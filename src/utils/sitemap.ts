import { normalizeUrl } from './history';

// Sitemap discovery for the batch analysis. Everything runs in the page
// context of the analyzed site, so all fetches are same-origin — that's what
// makes batch analysis possible without any host permissions.

export interface ParsedSitemap {
  pages: string[];
  childSitemaps: string[];
}

// Parses <urlset> page URLs (same hostname only) and <sitemapindex> children.
export function parseSitemap(xmlText: string, hostname: string): ParsedSitemap {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return { pages: [], childSitemaps: [] };

  const locsIn = (parent: string): string[] =>
    Array.from(doc.querySelectorAll(`${parent} > loc`))
      .map((loc) => (loc.textContent || '').trim())
      .filter(Boolean);

  const childSitemaps = locsIn('sitemap').filter((url) => sameHost(url, hostname));
  const pages: string[] = [];
  const seen = new Set<string>();
  for (const url of locsIn('url')) {
    if (!sameHost(url, hostname)) continue;
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

/**
 * Finds same-origin page URLs to batch-analyze: tries /sitemap.xml, falls
 * back to Sitemap: lines in robots.txt; resolves one level of sitemap-index
 * nesting. The current page is excluded (it's already analyzed), the result
 * capped at maxPages.
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
  for (const candidate of candidates) {
    if (pages.length >= maxPages) break;
    if (triedSitemaps.has(candidate)) continue;
    triedSitemaps.add(candidate);

    const xml = await fetchText(candidate, fetchFn);
    if (!xml) continue;
    const parsed = parseSitemap(xml, hostname);
    if (addPages(parsed.pages)) break;

    // One level of sitemap-index nesting, max 3 children
    for (const child of parsed.childSitemaps.slice(0, 3)) {
      if (pages.length >= maxPages || triedSitemaps.has(child)) continue;
      triedSitemaps.add(child);
      const childXml = await fetchText(child, fetchFn);
      if (!childXml) continue;
      if (addPages(parseSitemap(childXml, hostname).pages)) break;
    }
  }

  return pages;
}
