import type { SitemapData } from '../types/analysis';

// Sitemap check for the live analysis: is there a sitemap, does robots.txt
// point to it, is this page listed, and with a <lastmod>? Bing (the index
// behind Copilot and parts of ChatGPT Search) leans on lastmod to decide
// what to recrawl, and a sitemap is how new pages get found at all.
//
// Same-origin fetches from the page, like the sitemap batch. The walk is
// capped; when the cap is hit before the page turns up, "listed" stays
// unknown rather than "no".

const MAX_FILES = 30;
const MAX_DEPTH = 3;
// lastmod values: when nearly all entries share one, the CMS writes the
// build time, not the content change, and search engines learn to ignore it.
const UNIFORM_MIN_ENTRIES = 10;
const UNIFORM_SHARE = 0.9;

// Same page regardless of scheme, www., trailing slash, query and hash
export function pageKey(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = decodeURI(u.pathname).replace(/\/+$/, '') || '/';
    return host + path;
  } catch {
    return null;
  }
}

function hostKey(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Sitemap: lines of a robots.txt body, absolute URLs only. */
export function sitemapsFromRobots(robotsTxt: string | undefined): string[] {
  if (!robotsTxt) return [];
  const urls: string[] = [];
  for (const line of robotsTxt.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, '').match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (m && /^https?:\/\//i.test(m[1])) urls.push(m[1]);
  }
  return urls;
}

async function fetchXml(url: string, fetchFn: typeof fetch): Promise<Document | null> {
  try {
    const res = await fetchFn(url, { credentials: 'omit' });
    if (!res.ok) return null;
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const root = doc.documentElement?.localName;
    return root === 'urlset' || root === 'sitemapindex' ? doc : null;
  } catch {
    return null;
  }
}

const childText = (el: Element, name: string): string =>
  (Array.from(el.children).find((c) => c.localName === name)?.textContent ?? '').trim();

/**
 * Bing Webmaster Tools verification: <meta name="msvalidate.01"> or
 * /BingSiteAuth.xml. Verification by DNS record cannot be seen, so a miss
 * proves nothing.
 */
export async function detectBingVerification(
  doc: Document,
  pageUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<'meta' | 'file' | null> {
  if (doc.querySelector('meta[name="msvalidate.01" i][content]')) return 'meta';
  try {
    const res = await fetchFn(new URL('/BingSiteAuth.xml', pageUrl).href, { credentials: 'omit' });
    if (res.ok && /<users>\s*<user>/i.test(await res.text())) return 'file';
  } catch {
    // unreachable: no statement
  }
  return null;
}

function newsPublicationDate(url: Element): string | null {
  const news = Array.from(url.children).find((c) => c.localName === 'news');
  const date = Array.from(news?.children ?? []).find((c) => c.localName === 'publication_date');
  return date?.textContent?.trim() || null;
}

export async function checkSitemap(
  pageUrl: string,
  robotsTxt: string | undefined,
  fetchFn: typeof fetch = fetch
): Promise<SitemapData> {
  const origin = new URL(pageUrl).origin;
  const target = pageKey(pageUrl);
  const host = hostKey(pageUrl);
  const declared = sitemapsFromRobots(robotsTxt).filter((u) => hostKey(u) === host);
  const candidates = declared.length > 0 ? declared : [`${origin}/sitemap.xml`];

  const visited = new Set<string>();
  let found = false;
  let capped = false;
  let entries = 0;
  let withLastmod = 0;
  const lastmodCounts = new Map<string, number>();
  let pageLastmod: string | null = null;
  // Google News sitemaps carry news:publication_date instead of lastmod
  let pagePublished: string | null = null;
  let listed = false;

  // A site often lists a page twice, e.g. in a news sitemap without lastmod
  // and in a regular one with it; the walk goes on until it has a lastmod.
  const visit = async (url: string, depth: number): Promise<void> => {
    if ((listed && pageLastmod) || visited.has(url)) return;
    if (visited.size >= MAX_FILES) {
      capped = true;
      return;
    }
    visited.add(url);
    const doc = await fetchXml(url, fetchFn);
    if (!doc) return;
    found = true;
    const children: string[] = [];
    for (const el of Array.from(doc.documentElement.children)) {
      const loc = childText(el, 'loc');
      if (!loc) continue;
      if (el.localName === 'sitemap' || (el.localName === 'url' && /\.xml(\.gz)?$/i.test(loc))) {
        if (hostKey(loc) === host) children.push(loc);
        continue;
      }
      if (el.localName !== 'url') continue;
      entries++;
      const lastmod = childText(el, 'lastmod');
      if (lastmod) {
        withLastmod++;
        const day = lastmod.slice(0, 10);
        lastmodCounts.set(day, (lastmodCounts.get(day) ?? 0) + 1);
      }
      if (pageKey(loc) === target) {
        listed = true;
        pageLastmod ||= lastmod || null;
        pagePublished ||= newsPublicationDate(el);
      }
    }
    if (depth >= MAX_DEPTH) {
      if (children.length > 0) capped = true;
      return;
    }
    for (const child of children) await visit(child, depth + 1);
  };

  for (const c of candidates) await visit(c, 0);

  const topLastmod = Math.max(0, ...lastmodCounts.values());
  return {
    exists: found,
    declaredInRobots: declared.length > 0,
    // Unknown when the walk stopped early without finding the page
    listed: listed ? true : capped ? null : false,
    pageLastmod: pageLastmod ?? pagePublished,
    entries,
    lastmodShare: entries > 0 ? withLastmod / entries : 0,
    lastmodUniform: withLastmod >= UNIFORM_MIN_ENTRIES && topLastmod / withLastmod >= UNIFORM_SHARE,
  };
}
