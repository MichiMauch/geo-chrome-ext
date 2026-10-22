import { describe, it, expect } from 'vitest';
import { MachineReadabilityAnalyzer } from '../machine-readability';
import type { PageData, LinkData } from '../../types/analysis';

let linkCounter = 0;
// Each call targets its own page unless an href is given
function link(text: string, isExternal = false, extra: Partial<LinkData> = {}): LinkData {
  linkCounter++;
  return {
    href: isExternal ? `https://other.com/x${linkCounter}` : `https://example.com/internal/${linkCounter}`,
    text,
    isExternal,
    ...extra,
  };
}

function makePage(links: LinkData[]): PageData {
  return {
    url: 'https://example.com/some-page',
    headings: [],
    paragraphs: [],
    lists: [],
    links,
    meta: { title: 'T', description: '', author: '', publishDate: null, modifiedDate: null, ogType: null },
    schema: [],
    author: null,
    dates: [],
    semanticElements: { hasArticle: false, hasMain: false, hasNav: false, hasAside: false, hasHeader: false, hasFooter: false, hasSection: false },
    llmsTxt: { exists: false },
    robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
    images: [],
    openGraph: { title: null, description: null, image: null, url: null, type: null },
    twitterCard: { card: null, title: null, description: null, image: null },
    robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
    viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: 'width=device-width' },
    canonical: { href: null },
  };
}

const analyzer = new MachineReadabilityAnalyzer();

function linkingDetail(page: PageData) {
  const result = analyzer.analyze(page);
  return {
    detail: result.details.find((d) => d.criterionKey === 'criterion_internalLinks')!,
    recommendations: result.recommendations,
  };
}

describe('internal linking check', () => {
  it('fails with no internal links at all', () => {
    const { detail, recommendations } = linkingDetail(
      makePage([link('External reference', true)])
    );
    expect(detail.found).toBe(false);
    expect(detail.value).toBe('value_notPresent');
    expect(recommendations).toContain('weak_internal_links');
  });

  it('passes with enough descriptive internal links', () => {
    const { detail, recommendations } = linkingDetail(
      makePage([
        link('Guide to GEO basics'),
        link('Schema.org reference'),
        link('Our analysis methodology'),
      ])
    );
    expect(detail.found).toBe(true);
    expect(detail.value).toBe('3 (100%)');
    expect(recommendations).not.toContain('weak_internal_links');
  });

  it('fails when anchors are generic ("click here", "mehr") or bare symbols', () => {
    const { detail, recommendations } = linkingDetail(
      makePage([link('mehr'), link('click here'), link('→'), link('Weiterlesen')])
    );
    expect(detail.found).toBe(false);
    expect(recommendations).toContain('weak_internal_links');
  });

  it('mixed anchors: mostly descriptive still passes', () => {
    const { recommendations } = linkingDetail(
      makePage([
        link('Guide to GEO basics'),
        link('Schema.org reference'),
        link('Pricing overview'),
        link('Our analysis methodology'),
        link('mehr'),
      ])
    );
    // 4/5 descriptive = 80% ≥ threshold, count ≥ 3 → pass
    expect(recommendations).not.toContain('weak_internal_links');
  });

  it('ignores header/nav/footer links — only contextual links count', () => {
    const { detail } = linkingDetail(
      makePage([
        link('Guide to GEO basics'),
        link('Products', false, { isNavigational: true }),
        link('About us', false, { isNavigational: true }),
        link('Contact', false, { isNavigational: true }),
      ])
    );
    expect(detail.value).toBe('1 (100%)');
    expect(detail.found).toBe(false);
  });

  it('counts each target once (trailing slash and #hash normalized)', () => {
    const { detail } = linkingDetail(
      makePage([
        link('Schema.org reference', false, { href: 'https://example.com/schema' }),
        link('Schema.org reference', false, { href: 'https://example.com/schema/' }),
        link('Schema section', false, { href: 'https://example.com/schema#types' }),
        link('Guide to GEO basics', false, { href: 'https://example.com/guide' }),
      ])
    );
    expect(detail.value).toBe('2 (100%)');
  });

  it('a target is descriptive when any of its anchors is', () => {
    const { detail } = linkingDetail(
      makePage([
        link('mehr', false, { href: 'https://example.com/guide' }),
        link('Guide to GEO basics', false, { href: 'https://example.com/guide' }),
      ])
    );
    expect(detail.value).toBe('1 (100%)');
  });

  it('drops Cloudflare /cdn-cgi/ links and jump links to the page itself', () => {
    const { detail } = linkingDetail(
      makePage([
        link('info@example.com', false, { href: 'https://example.com/cdn-cgi/l/email-protection#abc' }),
        link('Jump to the methodology section', false, { href: 'https://example.com/some-page#method' }),
        link('Guide to GEO basics'),
      ])
    );
    expect(detail.value).toBe('1 (100%)');
  });
});

describe('internal links — report evidence', () => {
  it('counts contextual links, shows examples and the generic anchors', () => {
    const { detail } = linkingDetail(
      makePage([
        link('Guide to GEO basics'),
        link('mehr'),
        link('Home', false, { isNavigational: true }),
      ])
    );
    expect(detail.evidence).toEqual([
      { key: 'ev_internalLinks_count', params: { count: 2, min: 3, nav: 1 } },
      { key: 'ev_internalLinks_examples', params: { examples: '«Guide to GEO basics»' } },
      { key: 'ev_internalLinks_generic', params: { count: 1, examples: '«mehr»' } },
      { key: 'ev_internalLinks_ratio', params: { percent: 50, min: 80 } },
    ]);
  });

  it('reports no contextual links, and the anchor-text fix when only the texts fail', () => {
    expect(linkingDetail(makePage([])).detail.evidence).toEqual([
      { key: 'ev_internalLinks_none', params: { min: 3, nav: 0 } },
    ]);
    const { detail } = linkingDetail(makePage([link('Guide to GEO basics'), link('mehr'), link('hier'), link('weiter')]));
    expect(detail.fixKey).toBe('fix_internalLinks_anchors');
  });

  it('a passing page has examples and no fix override', () => {
    const { detail } = linkingDetail(makePage([link('Guide A one'), link('Guide B two'), link('Guide C three')]));
    expect(detail.evidence?.[0]).toEqual({ key: 'ev_internalLinks_count', params: { count: 3, min: 3, nav: 0 } });
    expect(detail.fixKey).toBeUndefined();
  });
});
