import type { GEOAnalysisResult } from '../types/analysis';
import { normalizeUrl } from './history';

// The extension version is part of the key: a cached result is only valid
// for the analysis code that produced it. A fixed prefix ('geo_cache_v10:')
// had to be bumped by hand and wasn't in 4.5/4.6, so updated installs kept
// showing results without the new rules and report texts for every page
// whose content hadn't changed.
const CACHE_ROOT = 'geo_cache_';
const CACHE_PREFIX = `${CACHE_ROOT}${chrome.runtime.getManifest().version}:`;

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

// Drops entries written by other extension versions (and the old fixed
// prefixes). Called on install/update, so storage doesn't keep growing.
export async function pruneStaleCaches(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter(
    (key) => key.startsWith(CACHE_ROOT) && !key.startsWith(CACHE_PREFIX)
  );
  if (stale.length > 0) await chrome.storage.local.remove(stale);
}
