import type {
  GEOAnalysisResult,
  HistoryEntry,
  StoredHistory,
  TrendInfo,
  DomainPageSummary,
} from '../types/analysis';
import { computeTrend } from './trend';

const STORAGE_PREFIX = 'geo_history:';
const MAX_ENTRIES = 50;

// Strips query params and hash so that tracking parameters and anchors
// don't create separate history entries for the same page content.
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    return u.origin + path;
  } catch {
    return url;
  }
}

function storageKey(url: string): string {
  return STORAGE_PREFIX + normalizeUrl(url);
}

export async function loadHistory(url: string): Promise<StoredHistory> {
  const key = storageKey(url);
  const data = await chrome.storage.local.get(key);
  return (data[key] as StoredHistory) ?? { url: normalizeUrl(url), entries: [] };
}

/**
 * Saves the analysis result to history and returns the trend compared to the
 * previous entry. Trend is computed before saving, so the comparison is always
 * against the most recent *previous* result.
 */
export async function saveAnalysis(result: GEOAnalysisResult): Promise<TrendInfo | null> {
  const key = storageKey(result.url);
  const existing = await loadHistory(result.url);

  // Compute trend BEFORE saving — entries[0] is the most recent previous result
  const trend = computeTrend(result.totalScore, existing);

  const entry: HistoryEntry = {
    timestamp: result.timestamp,
    totalScore: result.totalScore,
    ratingLevel: result.rating.level,
    ratingLabel: result.rating.label,
    ratingColor: result.rating.color,
  };

  // Prepend new entry, cap at MAX_ENTRIES
  existing.entries = [entry, ...existing.entries].slice(0, MAX_ENTRIES);

  await chrome.storage.local.set({ [key]: existing });

  return trend;
}

export async function clearHistory(url: string): Promise<void> {
  const key = storageKey(url);
  await chrome.storage.local.remove(key);
}

/**
 * Collects the latest analysis of every stored URL whose hostname matches
 * exactly (www. and non-www are distinct hosts). Sorted worst-score-first —
 * the dashboard's job is to surface the pages that need work.
 */
export async function getDomainOverview(hostname: string): Promise<DomainPageSummary[]> {
  const all = await chrome.storage.local.get(null);
  const pages: DomainPageSummary[] = [];

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    const stored = value as StoredHistory;
    if (!stored?.entries?.length) continue;

    let parsed: URL;
    try {
      parsed = new URL(stored.url);
    } catch {
      continue;
    }
    if (parsed.hostname !== hostname) continue;

    const latest = stored.entries[0];
    const previous = stored.entries[1];
    pages.push({
      url: stored.url,
      path: parsed.pathname || '/',
      lastScore: latest.totalScore,
      ratingLabel: latest.ratingLabel,
      ratingColor: latest.ratingColor,
      lastTimestamp: latest.timestamp,
      delta: previous ? Math.round((latest.totalScore - previous.totalScore) * 10) / 10 : null,
      analysisCount: stored.entries.length,
    });
  }

  return pages.sort((a, b) => a.lastScore - b.lastScore);
}
