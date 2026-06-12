import type { GEOAnalysisResult } from '../types/analysis';
import { getLang } from './i18n';
import { normalizeUrl } from './history';

// Anonymous, URL-free usage statistics (opt-out). Privacy contract:
// - NOTHING URL- or content-derived ever leaves the browser. Deduplication
//   (one report per page per day) is decided locally against
//   chrome.storage — the URL itself is never transmitted, not even hashed.
// - Payload: scores, fired recommendation keys, language, version, plus a
//   random install id for dedup/quality on the server.
// - Fire-and-forget with a 5s timeout; failures are silently ignored.
// - No manifest permission needed: the endpoint allows the extension origin
//   via CORS.

const ENDPOINT = 'https://api.geo.mauch.rocks/v1/analyses';
const ENABLED_KEY = 'geo_analytics_enabled';
const NOTICE_KEY = 'geo_analytics_notice_seen';
const INSTALL_KEY = 'geo_install_id';
const SENT_KEY = 'geo_analytics_sent';

export async function isAnalyticsEnabled(): Promise<boolean> {
  const data = await chrome.storage.local.get(ENABLED_KEY);
  return data[ENABLED_KEY] !== false; // default ON (opt-out model)
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
}

export async function isNoticeSeen(): Promise<boolean> {
  const data = await chrome.storage.local.get(NOTICE_KEY);
  return data[NOTICE_KEY] === true;
}

export async function markNoticeSeen(): Promise<void> {
  await chrome.storage.local.set({ [NOTICE_KEY]: true });
}

async function getInstallId(): Promise<string> {
  const data = await chrome.storage.local.get(INSTALL_KEY);
  const existing = data[INSTALL_KEY] as string | undefined;
  if (existing) return existing;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_KEY]: id });
  return id;
}

// Local dedupe: report each page at most once per day. The sent-map only
// lives in local storage and is pruned to the current day on every check.
async function alreadySentToday(url: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const key = normalizeUrl(url);
  const data = await chrome.storage.local.get(SENT_KEY);
  const sent = (data[SENT_KEY] as Record<string, string>) || {};
  if (sent[key] === today) return true;

  const pruned: Record<string, string> = {};
  for (const [u, day] of Object.entries(sent)) {
    if (day === today) pruned[u] = day;
  }
  pruned[key] = today;
  await chrome.storage.local.set({ [SENT_KEY]: pruned });
  return false;
}

export interface AnalyticsPayload {
  installId: string;
  version: string;
  lang: string;
  score: number;
  maxScore: number;
  ratingLevel: string;
  categories: Record<string, number>;
  recommendations: string[];
}

export function buildPayload(
  result: GEOAnalysisResult,
  installId: string,
  version: string
): AnalyticsPayload {
  return {
    installId,
    version,
    lang: getLang(),
    score: result.totalScore,
    maxScore: result.maxTotalScore,
    ratingLevel: result.rating.level,
    categories: Object.fromEntries(
      Object.entries(result.categories).map(([key, cat]) => [key, cat.score])
    ),
    // All fired recommendation keys (not just top 5) — that's the substance
    // for aggregate stats like "X% of pages have no llms.txt".
    recommendations: [
      ...new Set(Object.values(result.categories).flatMap((cat) => cat.recommendations)),
    ],
  };
}

export async function reportAnalysis(result: GEOAnalysisResult): Promise<void> {
  try {
    if (!(await isAnalyticsEnabled())) return;
    if (await alreadySentToday(result.url)) return;

    const payload = buildPayload(
      result,
      await getInstallId(),
      chrome.runtime.getManifest().version
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // Fire-and-forget: stats must never affect the user-facing flow.
  }
}
