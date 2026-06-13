import { normalizeUrl } from './history';

// Sitemap discovery for the batch analysis. Everything runs in the page
// context of the analyzed site, so all fetches are same-origin — that's what
// makes batch analysis possible without any host permissions.

export interface ParsedSitemap {
  pages: string[];
  childSitemaps: string[];
}

// A <loc> that points at another sitemap file rather than a content page.
// Some sites (e.g. netnode.ch) declare a sitemap *index* as a plain <urlset>
// with <url><loc>…sitemap-pages.xml</loc> entries instead of the standard
// <sitemapindex>/<sitemap>. Without this check those .xml files get analyzed
// as if they were HTML pages, which is meaningless.
function isSitemapUrl(url: string): boolean {
  try {
    return /\.xml(\.gz)?$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// Parses <urlset> page URLs (same hostname only) and <sitemapindex> children.
// <url><loc> entries that themselves point at a .xml sitemap are reclassified
// as child sitemaps so they get expanded, not analyzed.
export function parseSitemap(xmlText: string, hostname: string): ParsedSitemap {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return { pages: [], childSitemaps: [] };

  const locsIn = (parent: string): string[] =>
    Array.from(doc.querySelectorAll(`${parent} > loc`))
      .map((loc) => (loc.textContent || '').trim())
      .filter(Boolean);

  const childSitemaps: string[] = [];
  const childSeen = new Set<string>();
  const addChild = (url: string) => {
    if (!sameHost(url, hostname)) return;
    const key = normalizeUrl(url);
    if (childSeen.has(key)) return;
    childSeen.add(key);
    childSitemaps.push(url);
  };
  for (const url of locsIn('sitemap')) addChild(url);

  const pages: string[] = [];
  const seen = new Set<string>();
  for (const url of locsIn('url')) {
    if (!sameHost(url, hostname)) continue;
    if (isSitemapUrl(url)) {
      addChild(url);
      continue;
    }
    const key = normalizeUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    pages.push(url);
  }
  return { pages, childSitemaps };
}

function sameHost(url: string, hostname: string): boolean {
  try {
    return new URL(url).hostname === hostname;
  } catch {
    return false;
  }
}

async function fetchText(url: string, fetchFn: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Depth of sitemap-index nesting we follow. Real-world sites nest up to two
// levels (root index → per-language index → per-type urlset, e.g. netnode.ch).
const MAX_SITEMAP_DEPTH = 3;
// Hard cap on sitemap files fetched, so a pathological/looping index can't
// fan out indefinitely.
const MAX_SITEMAPS_FETCHED = 50;

/**
 * Finds same-origin page URLs to batch-analyze: tries /sitemap.xml, falls
 * back to Sitemap: lines in robots.txt; recursively resolves sitemap-index
 * nesting (including non-standard <urlset>-as-index files). The current page
 * is excluded (it's already analyzed), the result capped at maxPages.
 */
export async function discoverSitemapPages(
  origin: string,
  currentUrl: string,
  maxPages: number,
  fetchFn: typeof fetch = fetch
): Promise<string[]> {
  const hostname = new URL(origin).hostname;
  const currentKey = normalizeUrl(currentUrl);

  const candidates: string[] = [`${origin}/sitemap.xml`];
  const robots = await fetchText(`${origin}/robots.txt`, fetchFn);
  if (robots) {
    for (const line of robots.split(/\r?\n/)) {
      const m = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (m && sameHost(m[1], hostname)) candidates.push(m[1]);
    }
  }

  const pages: string[] = [];
  const seen = new Set<string>();
  const addPages = (urls: string[]) => {
    for (const url of urls) {
      const key = normalizeUrl(url);
      if (key === currentKey || seen.has(key)) continue;
      seen.add(key);
      pages.push(url);
      if (pages.length >= maxPages) return true;
    }
    return false;
  };

  const triedSitemaps = new Set<string>();
  // Returns true once maxPages is reached, to short-circuit the whole walk.
  const visit = async (url: string, depth: number): Promise<boolean> => {
    if (pages.length >= maxPages) return true;
    if (triedSitemaps.has(url) || triedSitemaps.size >= MAX_SITEMAPS_FETCHED) {
      return false;
    }
    triedSitemaps.add(url);

    const xml = await fetchText(url, fetchFn);
    if (!xml) return false;
    const parsed = parseSitemap(xml, hostname);
    if (addPages(parsed.pages)) return true;
    if (depth >= MAX_SITEMAP_DEPTH) return false;

    for (const child of parsed.childSitemaps) {
      if (await visit(child, depth + 1)) return true;
    }
    return false;
  };

  for (const candidate of candidates) {
    if (await visit(candidate, 0)) break;
  }

  return pages;
}
