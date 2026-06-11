import type { GEOAnalysisResult } from '../types/analysis';
import { normalizeUrl } from './history';

// v5 prefix: highlightTargets field added to the result shape (in-page
// highlighting, selector + per-element label). Old caches are ignored
// automatically.
const CACHE_PREFIX = 'geo_cache_v5:';

interface CachedAnalysis {
  hash: string;
  result: GEOAnalysisResult;
  timestamp: number;
}

function cacheKey(url: string): string {
  return CACHE_PREFIX + normalizeUrl(url);
}

export async function loadCache(url: string): Promise<CachedAnalysis | null> {
  const key = cacheKey(url);
  const data = await chrome.storage.local.get(key);
  return (data[key] as CachedAnalysis) || null;
}

export async function saveCache(url: string, hash: string, result: GEOAnalysisResult): Promise<void> {
  const key = cacheKey(url);
  const entry: CachedAnalysis = { hash, result, timestamp: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
}

export async function clearCache(url: string): Promise<void> {
  const key = cacheKey(url);
  await chrome.storage.local.remove(key);
}
