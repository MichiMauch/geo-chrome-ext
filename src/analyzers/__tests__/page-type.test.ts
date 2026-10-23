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

  it('detects article from a multi-typed node', () => {
    expect(
      detectPageType(makePage({ schema: [{ '@type': 'NewsArticle', '@types': ['NewsArticle', 'FAQPage'] }] }))
    ).toBe('article');
    // Legacy stored data where @type itself is an array
    const legacy = { '@type': ['WebPage', 'BlogPosting'] } as unknown as PageData['schema'][number];
    expect(detectPageType(makePage({ schema: [legacy] }))).toBe('article');
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
    // A recognizable publisher, so the homepage criterion contributes a score
    const page = makePage({
      url: 'https://example.com/',
      schema: [{ '@type': 'Organization', name: 'Example AG', logo: 'https://example.com/logo.png' }],
      links: [
        { href: 'https://example.org/a', text: 'a', isExternal: true },
        { href: 'https://example.net/b', text: 'b', isExternal: true },
        { href: 'https://example.com/impressum', text: 'Impressum', isExternal: false },
        { href: 'https://example.com/kontakt', text: 'Kontakt', isExternal: false },
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

  it('homepage: publisher instead of source links', () => {
    const analyzer = new TrustSourcesAnalyzer();
    const bare = analyzer.analyze(makePage({ url: 'https://example.com/' }), 'homepage');
    const publisher = bare.details.find((d) => d.criterionKey === 'criterion_publisher')!;
    expect(publisher.found).toBe(false);
    expect(publisher.evidence?.map((e) => e.key)).toEqual([
      'ev_publisher_schema_none', 'ev_publisher_imprint_missing', 'ev_publisher_contact_missing', 'ev_publisher_about_missing',
    ]);
    expect(bare.details.find((d) => d.criterionKey === 'criterion_sources')!.value).toBe('value_notApplicable');
    expect(bare.recommendations).toEqual(['publisher_unclear']);

    const named = analyzer.analyze(
      makePage({
        url: 'https://example.com/',
        schema: [{ '@type': 'WebSite', publisher: { '@type': 'Organization', name: 'Example AG', sameAs: ['https://ch.linkedin.com/company/example'] } }],
        links: [{ href: 'https://example.com/ueber-uns', text: 'Team', isExternal: false }],
      }),
      'homepage'
    );
    const d = named.details.find((x) => x.criterionKey === 'criterion_publisher')!;
    expect(d.progress?.current).toBe(85); // 0.5 named + 0.2 sameAs + 0.15 one of two links
    expect(d.evidence).toContainEqual({ key: 'ev_publisher_schema', params: { name: 'Example AG' } });
    expect(d.evidence).toContainEqual({ key: 'ev_publisher_about_ok' });
    expect(named.recommendations).not.toContain('publisher_unclear');
  });

  it('homepage: publisher links by menu label or path, not inside headlines', () => {
    const analyzer = new TrustSourcesAnalyzer();
    const kinds = (links: { href: string; text: string }[]) =>
      analyzer
        .analyze(makePage({ url: 'https://example.com/', links: links.map((l) => ({ ...l, isExternal: false })) }), 'homepage')
        .details.find((d) => d.criterionKey === 'criterion_publisher')!
        .evidence!.filter((e) => e.key.endsWith('_ok'))
        .map((e) => e.key);
    expect(kinds([{ href: 'https://example.com/pages/help', text: 'FAQ/Contact Us' }])).toEqual(['ev_publisher_contact_ok']);
    expect(kinds([{ href: 'https://example.com/de/uber-chch/', text: 'Über ch.ch' }])).toEqual(['ev_publisher_about_ok']);
    expect(kinds([{ href: 'https://example.com/de/rechtliches/', text: 'Rechtliches' }])).toEqual(['ev_publisher_imprint_ok']);
    expect(kinds([{ href: 'https://example.com/news/123.html', text: 'Was Sie als Admin über die neuen Systeme wissen müssen' }])).toEqual([]);
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
