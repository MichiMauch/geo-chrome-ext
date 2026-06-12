import { describe, it, expect } from 'vitest';
import { MachineReadabilityAnalyzer } from '../machine-readability';
import type { PageData, LinkData } from '../../types/analysis';

function link(text: string, isExternal = false): LinkData {
  return { href: isExternal ? 'https://other.com/x' : '/internal/x', text, isExternal };
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
});
