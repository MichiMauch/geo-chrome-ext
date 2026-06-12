// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSitemap, discoverSitemapPages } from '../sitemap';

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/page-a</loc></url>
  <url><loc>https://example.com/page-a/</loc></url>
  <url><loc>https://other-domain.com/external</loc></url>
  <url><loc>https://example.com/page-b</loc></url>
</urlset>`;

const SITEMAP_INDEX = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
  <sitemap><loc>https://cdn.example.net/sitemap-foreign.xml</loc></sitemap>
</sitemapindex>`;

function stubFetch(routes: Record<string, string>): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const key = String(url);
    if (routes[key] !== undefined) {
      return new Response(routes[key], { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('parseSitemap', () => {
  it('extracts same-host page URLs and dedupes normalized variants', () => {
    const { pages, childSitemaps } = parseSitemap(URLSET, 'example.com');
    expect(pages).toEqual([
      'https://example.com/',
      'https://example.com/page-a',
      'https://example.com/page-b',
    ]);
    expect(childSitemaps).toEqual([]);
  });

  it('extracts same-host child sitemaps from an index', () => {
    const { pages, childSitemaps } = parseSitemap(SITEMAP_INDEX, 'example.com');
    expect(pages).toEqual([]);
    expect(childSitemaps).toEqual(['https://example.com/sitemap-posts.xml']);
  });

  it('returns empty on invalid XML', () => {
    expect(parseSitemap('<html>not a sitemap</html>', 'example.com').pages).toEqual([]);
  });
});

describe('discoverSitemapPages', () => {
  it('uses /sitemap.xml, excludes the current page and caps the result', async () => {
    const fetchFn = stubFetch({ 'https://example.com/sitemap.xml': URLSET });
    const pages = await discoverSitemapPages(
      'https://example.com',
      'https://example.com/page-a',
      2,
      fetchFn
    );
    expect(pages).toEqual(['https://example.com/', 'https://example.com/page-b']);
  });

  it('falls back to Sitemap: lines in robots.txt', async () => {
    const fetchFn = stubFetch({
      'https://example.com/robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://example.com/custom-map.xml\n',
      'https://example.com/custom-map.xml': URLSET,
    });
    const pages = await discoverSitemapPages('https://example.com', 'https://example.com/x', 10, fetchFn);
    expect(pages).toHaveLength(3);
  });

  it('resolves one level of sitemap-index nesting (same host only)', async () => {
    const fetchFn = stubFetch({
      'https://example.com/sitemap.xml': SITEMAP_INDEX,
      'https://example.com/sitemap-posts.xml': URLSET,
    });
    const pages = await discoverSitemapPages('https://example.com', 'https://example.com/x', 10, fetchFn);
    expect(pages).toHaveLength(3);
  });

  it('returns empty when nothing is found', async () => {
    const pages = await discoverSitemapPages('https://example.com', 'https://example.com/', 10, stubFetch({}));
    expect(pages).toEqual([]);
  });
});
