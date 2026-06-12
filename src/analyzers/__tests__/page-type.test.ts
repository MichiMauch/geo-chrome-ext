import { describe, it, expect } from 'vitest';
import { detectPageType } from '../../utils/page-type';
import { TrustSourcesAnalyzer } from '../trust-sources';
import { AiCitationAnalyzer } from '../ai-citation';
import { AnswerabilityAnalyzer } from '../answerability';
import type { PageData } from '../../types/analysis';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com/some/article-path',
    headings: [],
    paragraphs: [],
    lists: [],
    links: [],
    meta: { title: 'A reasonable page title', description: '', author: '', publishDate: null, modifiedDate: null, ogType: null },
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
    ...overrides,
  };
}

describe('detectPageType', () => {
  it('detects product via Product schema', () => {
    expect(detectPageType(makePage({ schema: [{ '@type': 'Product' }] }))).toBe('product');
  });

  it('detects article via Article/BlogPosting schema', () => {
    expect(detectPageType(makePage({ schema: [{ '@type': 'BlogPosting' }] }))).toBe('article');
  });

  it('detects article via og:type', () => {
    expect(
      detectPageType(
        makePage({ openGraph: { title: null, description: null, image: null, url: null, type: 'article' } })
      )
    ).toBe('article');
  });

  it('detects homepage via root path', () => {
    expect(detectPageType(makePage({ url: 'https://example.com/' }))).toBe('homepage');
    expect(detectPageType(makePage({ url: 'https://example.com/index.html' }))).toBe('homepage');
  });

  it('explicit schema beats the homepage path', () => {
    expect(
      detectPageType(makePage({ url: 'https://example.com/', schema: [{ '@type': 'Article' }] }))
    ).toBe('article');
  });

  it('stays "other" without confident signals', () => {
    expect(detectPageType(makePage())).toBe('other');
  });
});

describe('page-type adjusted expectations', () => {
  it('homepage: no author/date penalty in Trust & Sources', () => {
    const analyzer = new TrustSourcesAnalyzer();
    // External links present so the remaining criterion contributes a score
    const page = makePage({
      url: 'https://example.com/',
      links: [
        { href: 'https://example.org/a', text: 'a', isExternal: true },
        { href: 'https://example.net/b', text: 'b', isExternal: true },
      ],
    });

    const asOther = analyzer.analyze(page, 'other');
    const asHomepage = analyzer.analyze(page, 'homepage');

    expect(asOther.recommendations).toContain('no_author');
    expect(asHomepage.recommendations).not.toContain('no_author');
    expect(asHomepage.recommendations).not.toContain('no_date');
    const authorDetail = asHomepage.details.find((d) => d.criterionKey === 'criterion_author')!;
    expect(authorDetail.found).toBe(true);
    expect(authorDetail.value).toBe('value_notApplicable');
    expect(authorDetail.weight).toBe(0);
    expect(asHomepage.score).toBeGreaterThan(asOther.score);
  });

  it('product page: author/date also skipped', () => {
    const analyzer = new TrustSourcesAnalyzer();
    const result = analyzer.analyze(makePage(), 'product');
    expect(result.recommendations).not.toContain('no_author');
    expect(result.recommendations).not.toContain('no_date');
  });

  it('homepage: FAQ and key-info-upfront not demanded in AI Citation', () => {
    const analyzer = new AiCitationAnalyzer();
    const page = makePage();

    expect(analyzer.analyze(page, 'other').recommendations).toContain('no_faq');
    const homepage = analyzer.analyze(page, 'homepage');
    expect(homepage.recommendations).not.toContain('no_faq');
    expect(homepage.recommendations).not.toContain('no_key_info_upfront');
  });

  it('homepage: definitions not demanded in Answerability', () => {
    const analyzer = new AnswerabilityAnalyzer();
    const page = makePage();

    expect(analyzer.analyze(page, 'other').recommendations).toContain('no_definitions');
    expect(analyzer.analyze(page, 'homepage').recommendations).not.toContain('no_definitions');
  });

  it('article: behavior identical to pre-detection logic', () => {
    const trust = new TrustSourcesAnalyzer();
    const page = makePage();
    const asArticle = trust.analyze(page, 'article');
    const asUndefined = trust.analyze(page);
    expect(asArticle.recommendations).toEqual(asUndefined.recommendations);
    expect(asArticle.score).toBe(asUndefined.score);
  });
});
