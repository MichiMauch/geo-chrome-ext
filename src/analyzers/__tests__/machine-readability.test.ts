import { describe, it, expect } from 'vitest';
import { MachineReadabilityAnalyzer } from '../machine-readability';
import type { PageData, SchemaData, CrawlerViewData } from '../../types/analysis';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com',
    headings: [],
    paragraphs: ['Some content.'],
    lists: [],
    links: [],
    meta: { title: '', description: '', author: '', publishDate: null, modifiedDate: null, ogType: null },
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
    viewport: { hasViewport: false, hasDeviceWidth: false, userScalableNo: false, rawContent: null },
    canonical: { href: null },
    ...overrides,
  };
}

describe('MachineReadabilityAnalyzer — schema completeness', () => {
  const analyzer = new MachineReadabilityAnalyzer();

  it('shows no completeness detail when only shallow microdata entries exist', () => {
    // Microdata/RDFa extractor returns @type only — should not be validated
    const schemas: SchemaData[] = [{ '@type': 'Article' }];
    const result = analyzer.analyze(makePage({ schema: schemas }));
    const detail = result.details.find((d) => d.criterionKey === 'criterion_schema_completeness');
    expect(detail).toBeUndefined();
  });

  it('flags an Article schema that is missing author and datePublished', () => {
    const schemas: SchemaData[] = [
      { '@type': 'Article', headline: 'Some headline goes here' },
    ];
    const result = analyzer.analyze(makePage({ schema: schemas }));
    const detail = result.details.find((d) => d.criterionKey === 'criterion_schema_completeness');
    expect(detail).toBeDefined();
    expect(detail!.found).toBe(false);
    expect(detail!.progress?.current).toBe(1);
    expect(detail!.progress?.target).toBe(3);
    expect(String(detail!.value)).toContain('author');
    expect(String(detail!.value)).toContain('datePublished');
    expect(result.recommendations).toContain('schema_incomplete');
  });

  it('passes a fully populated Article schema', () => {
    const schemas: SchemaData[] = [
      {
        '@type': 'Article',
        headline: 'Some headline goes here',
        author: { '@type': 'Person', name: 'Jane Doe' },
        datePublished: '2026-05-01',
      },
    ];
    const result = analyzer.analyze(makePage({ schema: schemas }));
    const detail = result.details.find((d) => d.criterionKey === 'criterion_schema_completeness');
    expect(detail).toBeDefined();
    expect(detail!.found).toBe(true);
    expect(detail!.progress?.current).toBe(3);
    expect(result.recommendations).not.toContain('schema_incomplete');
  });

  it('treats empty string values as missing', () => {
    const schemas: SchemaData[] = [
      { '@type': 'Article', headline: '   ', author: { name: 'A' }, datePublished: '2026-01-01' },
    ];
    const result = analyzer.analyze(makePage({ schema: schemas }));
    const detail = result.details.find((d) => d.criterionKey === 'criterion_schema_completeness');
    expect(detail!.found).toBe(false);
    expect(String(detail!.value)).toContain('headline');
  });

  it('validates multiple schemas in one page', () => {
    const schemas: SchemaData[] = [
      { '@type': 'Article', headline: 'Title', author: { name: 'A' }, datePublished: '2026-01-01' },
      { '@type': 'Organization', name: 'Acme' }, // missing url
    ];
    const result = analyzer.analyze(makePage({ schema: schemas }));
    const detail = result.details.find((d) => d.criterionKey === 'criterion_schema_completeness');
    expect(detail).toBeDefined();
    expect(detail!.progress?.target).toBe(5); // 3 Article + 2 Organization
    expect(detail!.progress?.current).toBe(4); // all Article + name on Org
    expect(String(detail!.value)).toContain('Organization');
    expect(String(detail!.value)).toContain('url');
  });

  it('skips schemas whose @type is not in the required-fields table', () => {
    const schemas: SchemaData[] = [
      { '@type': 'WebSite', name: 'Acme' }, // not in our table
    ];
    const result = analyzer.analyze(makePage({ schema: schemas }));
    const detail = result.details.find((d) => d.criterionKey === 'criterion_schema_completeness');
    expect(detail).toBeUndefined();
  });
});

describe('MachineReadabilityAnalyzer — crawler view', () => {
  const analyzer = new MachineReadabilityAnalyzer();

  const crawlerView = (overrides: Partial<CrawlerViewData> = {}): CrawlerViewData => ({
    status: 'ok',
    httpStatus: 200,
    renderedChars: 5000,
    rawChars: 5000,
    coverage: 1,
    renderedHeadings: 4,
    rawHeadings: 4,
    renderedHasH1: true,
    rawHasH1: true,
    renderedSchemaBlocks: 1,
    rawSchemaBlocks: 1,
    rawBytes: 20000,
    missingHeadings: [],
    ...overrides,
  });

  const detailOf = (page: PageData) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === 'criterion_crawlerView');

  it('adds no criterion and changes no score when the check did not run', () => {
    const withoutCheck = analyzer.analyze(makePage());
    expect(detailOf(makePage())).toBeUndefined();
    expect(withoutCheck.recommendations).not.toContain('js_only_content');
  });

  it('rewards a server-rendered page and fires no recommendation', () => {
    const baseline = analyzer.analyze(makePage()).score;
    const withCheck = analyzer.analyze(makePage({ crawlerView: crawlerView() }));
    // The criterion carries full marks here, so it can only help
    expect(withCheck.score).toBeGreaterThan(baseline);
    expect(withCheck.recommendations).not.toContain('js_only_content');

    const detail = detailOf(makePage({ crawlerView: crawlerView() }));
    expect(detail?.found).toBe(true);
    expect(detail?.value).toBe('value_crawlerOk');
  });

  it('flags a client-rendered page and drops the score', () => {
    const baseline = analyzer.analyze(makePage({ crawlerView: crawlerView() })).score;
    const page = makePage({
      crawlerView: crawlerView({ status: 'js-only', rawChars: 0, coverage: 0 }),
    });
    const result = analyzer.analyze(page);
    expect(result.score).toBeLessThan(baseline);
    expect(result.recommendations).toContain('js_only_content');

    const detail = detailOf(page);
    expect(detail?.found).toBe(false);
    expect(detail?.value).toBe('value_crawlerJsOnly');
    expect(detail?.progress).toEqual({ current: 0, target: 100, unitKey: 'unit_percent' });
  });

  it('scores a partly client-rendered page by its coverage', () => {
    const page = makePage({ crawlerView: crawlerView({ status: 'partial', rawChars: 2000, coverage: 0.4 }) });
    const result = analyzer.analyze(page);
    expect(result.recommendations).toContain('js_only_content');
    expect(detailOf(page)?.value).toBe('value_crawlerPartial');
    expect(detailOf(page)?.progress?.current).toBe(40);
  });

  it('ignores a login wall entirely', () => {
    // No weight added at all, so the score matches a run without the check
    const baseline = analyzer.analyze(makePage()).score;
    const page = makePage({ crawlerView: crawlerView({ status: 'auth-wall', coverage: 0 }) });
    const result = analyzer.analyze(page);
    expect(result.score).toBeCloseTo(baseline, 5);
    expect(result.recommendations).not.toContain('js_only_content');
    expect(detailOf(page)).toBeUndefined();
  });
});

describe('MachineReadabilityAnalyzer — llms.txt / llms-full.txt', () => {
  const analyzer = new MachineReadabilityAnalyzer();

  function llmsDetail(llmsTxt: PageData['llmsTxt']) {
    const result = analyzer.analyze(makePage({ llmsTxt }));
    return result.details.find((d) => d.criterionKey === 'criterion_llmsTxt')!;
  }

  it('reports both files when llms.txt and llms-full.txt exist', () => {
    const d = llmsDetail({ exists: true, fullExists: true });
    expect(d.found).toBe(true);
    expect(d.value).toBe('value_llms_both');
    expect(d.progress?.current).toBe(1);
  });

  it('gives full credit for llms.txt alone and names the missing long form', () => {
    const d = llmsDetail({ exists: true, fullExists: false });
    expect(d.found).toBe(true);
    expect(d.value).toBe('value_llms_indexOnly');
    expect(d.progress?.current).toBe(1);
  });

  it('gives partial credit when only llms-full.txt exists', () => {
    const d = llmsDetail({ exists: false, fullExists: true });
    expect(d.found).toBe(true);
    expect(d.value).toBe('value_llms_fullOnly');
    expect(d.progress?.current).toBe(0.5);
  });

  it('scores zero when neither file exists', () => {
    const d = llmsDetail({ exists: false, fullExists: false });
    expect(d.found).toBe(false);
    expect(d.value).toBe('value_notFound');
    expect(d.progress?.current).toBe(0);
  });

  it('treats a legacy entry without the fullExists flag as llms.txt only', () => {
    const d = llmsDetail({ exists: true });
    expect(d.value).toBe('value_llms_indexOnly');
    expect(d.progress?.current).toBe(1);
  });

  it('scores llms.txt-only higher than llms-full.txt-only, and that above nothing', () => {
    const score = (llmsTxt: PageData['llmsTxt']) => analyzer.analyze(makePage({ llmsTxt })).score;
    expect(score({ exists: true, fullExists: false })).toBeGreaterThan(
      score({ exists: false, fullExists: true })
    );
    expect(score({ exists: false, fullExists: true })).toBeGreaterThan(
      score({ exists: false, fullExists: false })
    );
  });

  it('does not reward llms-full.txt on top of llms.txt (no score inflation)', () => {
    const score = (llmsTxt: PageData['llmsTxt']) => analyzer.analyze(makePage({ llmsTxt })).score;
    expect(score({ exists: true, fullExists: true })).toBe(score({ exists: true, fullExists: false }));
  });
});

describe('MachineReadabilityAnalyzer — schema type count', () => {
  const analyzer = new MachineReadabilityAnalyzer();
  const schemaDetail = (page: PageData) => {
    const result = analyzer.analyze(page);
    return { detail: result.details.find((d) => d.criterionKey === 'criterion_schema')!, result };
  };

  it('counts two identical types once', () => {
    const { detail } = schemaDetail(
      makePage({ schema: [{ '@type': 'NewsArticle' }, { '@type': 'NewsArticle', headline: 'H' }] })
    );
    expect(detail.progress).toMatchObject({ current: 1, target: 2 });
    expect(detail.value).toBe('value_schemaTypes');
    expect(detail.valueParams?.types).toBe('NewsArticle');
  });

  it('counts distinct types and every type of a multi-typed node', () => {
    const { detail } = schemaDetail(
      makePage({
        schema: [
          { '@type': 'NewsArticle', '@types': ['NewsArticle', 'FAQPage'] },
          { '@type': 'BreadcrumbList' },
        ],
      })
    );
    expect(detail.progress?.current).toBe(2);
    expect(detail.valueParams?.types).toBe('NewsArticle, FAQPage, BreadcrumbList');
  });

  it('copes with a raw @type array from older stored data', () => {
    const legacy = { '@type': ['BlogPosting', 'WebPage'] } as unknown as SchemaData;
    const { detail } = schemaDetail(makePage({ schema: [legacy] }));
    expect(detail.progress?.current).toBe(2);
  });

  it('keeps an og:type=article page without Article schema below target', () => {
    const { detail, result } = schemaDetail(
      makePage({
        url: 'https://example.com/news/story',
        openGraph: { title: null, description: null, image: null, url: null, type: 'article' },
        schema: [{ '@type': 'Organization' }, { '@type': 'WebPage' }, { '@type': 'BreadcrumbList' }],
      })
    );
    expect(detail.progress).toMatchObject({ current: 1, target: 2 });
    expect(detail.value).toBe('value_schemaTypesMissing');
    expect(detail.valueParams?.missing).toBe('Article');
    expect(result.recommendations).toContain('no_schema');
  });

  it('expects FAQPage when the page shows a FAQ', () => {
    const page = (schema: SchemaData[]) =>
      makePage({ schema, faqQuestions: ['Was ist GEO?', 'Wie funktioniert es?', 'Was kostet es?'] });
    expect(schemaDetail(page([{ '@type': 'WebPage' }, { '@type': 'Organization' }])).detail.progress?.current).toBe(1);
    expect(schemaDetail(page([{ '@type': 'WebPage' }, { '@type': 'FAQPage' }])).detail.progress?.current).toBe(2);
  });
});

describe('MachineReadabilityAnalyzer — completeness edge cases', () => {
  const analyzer = new MachineReadabilityAnalyzer();
  const completeness = (schema: SchemaData[]) =>
    analyzer
      .analyze(makePage({ schema }))
      .details.find((d) => d.criterionKey === 'criterion_schema_completeness');

  it('does not accept a nameless Person as author', () => {
    const d = completeness([
      { '@type': 'NewsArticle', headline: 'H', datePublished: '2026-01-01', author: { '@type': 'Person' } },
    ]);
    expect(d!.found).toBe(false);
    expect(String(d!.value)).toContain('author');
  });

  it('follows an @id author reference into @graph', () => {
    const d = completeness([
      { '@type': 'NewsArticle', headline: 'H', datePublished: '2026-01-01', author: { '@id': '#jane' } },
      { '@type': 'Person', '@id': '#jane', name: 'Jane Doe' },
    ]);
    expect(d!.found).toBe(true);
    expect(d!.progress).toMatchObject({ current: 4, target: 4 }); // 3 article + Person name
  });

  it('accepts an author array with at least one name', () => {
    const d = completeness([
      { '@type': 'Article', headline: 'H', datePublished: '2026-01-01', author: [{ '@type': 'Person' }, 'Jane Doe'] },
    ]);
    expect(d!.found).toBe(true);
  });

  it('validates every type of a multi-typed node', () => {
    const d = completeness([
      { '@type': 'NewsArticle', '@types': ['NewsArticle', 'FAQPage'], headline: 'H', author: 'Jane', datePublished: '2026-01-01' },
    ]);
    expect(d!.progress).toMatchObject({ current: 3, target: 4 });
    expect(String(d!.value)).toContain('NewsArticle/FAQPage: mainEntity');
  });

  it('validates identical duplicate nodes once', () => {
    const node: SchemaData = { '@type': 'Article', headline: 'H' };
    const d = completeness([node, { ...node }]);
    expect(d!.progress?.target).toBe(3);
  });

  it('checks Article subtypes against the Article fields', () => {
    const d = completeness([{ '@type': 'TechArticle', headline: 'H' }]);
    expect(d!.progress).toMatchObject({ current: 1, target: 3 });
  });
});

describe('MachineReadabilityAnalyzer — entities', () => {
  const analyzer = new MachineReadabilityAnalyzer();
  const entityPercent = (page: PageData) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === 'criterion_entities')!.progress!.current;

  it('scores zero for a page with only a meta description and product words', () => {
    expect(
      entityPercent(
        makePage({
          paragraphs: ['Unsere Software ist die beste Lösung und App für Ihr Produkt.'],
          meta: { title: '', description: 'x'.repeat(120), author: '', publishDate: null, modifiedDate: null, ogType: null },
        })
      )
    ).toBe(0);
  });

  it('counts an author once, whether from schema or byline', () => {
    const schemaOnly = makePage({ schema: [{ '@type': 'Article', author: { '@type': 'Person', name: 'Jane' } }] });
    const both = makePage({
      schema: [{ '@type': 'Article', author: { '@type': 'Person', name: 'Jane' } }],
      author: { name: 'Jane', source: 'schema' },
    });
    const bylineOnly = makePage({ author: { name: 'Jane', source: 'dom' } });
    expect(entityPercent(schemaOnly)).toBe(20);
    expect(entityPercent(both)).toBe(20);
    expect(entityPercent(bylineOnly)).toBe(20);
  });

  it('does not count a nameless Person', () => {
    expect(entityPercent(makePage({ schema: [{ '@type': 'Article', author: { '@type': 'Person' } }] }))).toBe(0);
  });

  it('rewards a fully described, linked entity graph with 100%', () => {
    const page = makePage({
      schema: [
        {
          '@type': 'NewsArticle',
          '@id': '#article',
          author: { '@id': '#jane' },
          publisher: { '@id': '#org' },
          about: { '@type': 'Thing', name: 'Energy policy' },
        },
        { '@type': 'Person', '@id': '#jane', name: 'Jane Doe', sameAs: ['https://www.linkedin.com/in/jane'] },
        { '@type': 'NewsMediaOrganization', '@id': '#org', name: 'Acme News', logo: 'https://acme.example/logo.png' },
      ],
    });
    expect(entityPercent(page)).toBe(100);
  });

  it('a named publisher without logo/sameAs earns only the base signal', () => {
    const page = makePage({ schema: [{ '@type': 'Article', publisher: { '@type': 'Organization', name: 'Acme' } }] });
    expect(entityPercent(page)).toBe(25);
  });
});

describe('MachineReadabilityAnalyzer — semantic HTML', () => {
  const analyzer = new MachineReadabilityAnalyzer();
  const semanticPercent = (semanticElements: PageData['semanticElements']) =>
    analyzer.analyze(makePage({ semanticElements })).details.find((d) => d.criterionKey === 'criterion_semanticHtml')!
      .progress!.current;
  const all = { hasArticle: true, hasMain: true, hasNav: true, hasAside: false, hasHeader: true, hasFooter: true, hasSection: true };

  it('reaches 100% with all landmarks and no <aside>', () => {
    expect(semanticPercent(all)).toBe(100);
  });

  it('treats <aside> as a bonus that can not exceed 100%', () => {
    expect(semanticPercent({ ...all, hasAside: true })).toBe(100);
    expect(semanticPercent({ ...all, hasFooter: false })).toBe(90);
    expect(semanticPercent({ ...all, hasFooter: false, hasAside: true })).toBe(95);
  });
});

describe('MachineReadabilityAnalyzer — report evidence', () => {
  const analyzer = new MachineReadabilityAnalyzer();
  const detail = (page: PageData, key: string) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === key)!;
  const ev = (page: PageData, key: string) => detail(page, key).evidence ?? [];
  const keys = (page: PageData, key: string) => ev(page, key).map((e) => e.key);
  const faq = Array.from({ length: 52 }, (_, i) => `Frage ${i + 1}?`);
  const newsArticle: SchemaData = {
    '@type': 'NewsArticle',
    headline: 'Stromversorgung',
    author: { '@type': 'Person', name: 'Lukas Federer', url: 'https://example.com/person/lf' },
    datePublished: '2026-07-29',
    publisher: { '@type': 'Organization', name: 'economiesuisse', logo: { url: 'https://example.com/logo.png' } },
  };

  it('schema: names the found type and the missing FAQPage with the question count', () => {
    const page = makePage({ schema: [newsArticle], faqQuestions: faq });
    const d = detail(page, 'criterion_schema');
    expect(d.evidence).toContainEqual({ key: 'ev_schema_found', params: { types: 'NewsArticle' } });
    expect(d.evidence).toContainEqual({ key: 'ev_schema_missing_faq', params: { count: 52, example: 'Frage 1?' } });
    expect(d.evidence).toContainEqual({ key: 'ev_schema_target', params: { count: 1, target: 2 } });
    expect(d.fixKey).toBe('fix_schema_faq');
  });

  it('schema: passing page lists its types and confirms the FAQPage', () => {
    const page = makePage({ schema: [newsArticle, { '@type': 'FAQPage', mainEntity: [{}] }], faqQuestions: faq });
    const d = detail(page, 'criterion_schema');
    expect(d.evidence).toEqual([
      { key: 'ev_schema_found', params: { types: 'NewsArticle, FAQPage' } },
      { key: 'ev_schema_faq_ok', params: { count: 52 } },
    ]);
    expect(d.fixKey).toBeUndefined();
  });

  it('schema: no schema, and a single non-article type that needs a second one', () => {
    expect(keys(makePage(), 'criterion_schema')).toEqual(['ev_schema_none', 'ev_schema_target', 'ev_schema_too_few']);
    const d = detail(makePage({ schema: [{ '@type': 'WebPage', name: 'x' }, { '@type': 'WebSite' }] }), 'criterion_schema');
    expect(d.evidence).toContainEqual({ key: 'ev_schema_other', params: { types: 'WebSite' } });
    expect(d.fixKey).toBe('fix_schema_more');
  });

  it('schema completeness: lists the missing fields per block and the unnamed author', () => {
    const page = makePage({ schema: [{ '@type': 'Article', headline: 'H', author: { '@type': 'Person' } }] });
    const d = detail(page, 'criterion_schema_completeness');
    expect(d.evidence).toEqual([
      { key: 'ev_schema_completeness_summary', params: { found: 1, total: 3 } },
      { key: 'ev_schema_completeness_missing', params: { type: 'Article', fields: 'author, datePublished' } },
      { key: 'ev_schema_completeness_author_unnamed' },
    ]);
    expect(d.fixKey).toBe('fix_schema_completeness_author');
    expect(ev(makePage({ schema: [newsArticle] }), 'criterion_schema_completeness')).toContainEqual({
      key: 'ev_schema_completeness_ok',
      params: { types: 'NewsArticle' },
    });
  });

  it('entities: one line per signal, with names', () => {
    expect(ev(makePage({ schema: [newsArticle] }), 'criterion_entities')).toEqual([
      { key: 'ev_entities_org_named', params: { name: 'economiesuisse' } },
      { key: 'ev_entities_org_verifiable' },
      { key: 'ev_entities_person_named', params: { name: 'Lukas Federer' } },
      { key: 'ev_entities_person_verifiable' },
      { key: 'ev_entities_graph_loose' },
      { key: 'ev_entities_topic_none' },
    ]);
    const bare = makePage({ author: { name: 'Anna Muster', source: 'dom' } });
    expect(keys(bare, 'criterion_entities')).toEqual([
      'ev_entities_org_none',
      'ev_entities_person_named_page',
      'ev_entities_graph_loose',
      'ev_entities_topic_none',
    ]);
    const withTopic = makePage({ schema: [{ ...newsArticle, about: [{ '@type': 'Thing', name: 'Energiepolitik' }] }] });
    expect(ev(withTopic, 'criterion_entities')).toContainEqual({
      key: 'ev_entities_topic',
      params: { topics: '«Energiepolitik»' },
    });
  });

  it('semantic HTML: lists present elements and each missing one', () => {
    const semanticElements = { hasArticle: false, hasMain: true, hasNav: true, hasAside: false, hasHeader: true, hasFooter: true, hasSection: true };
    expect(ev(makePage({ semanticElements }), 'criterion_semanticHtml')).toEqual([
      { key: 'ev_semanticHtml_present', params: { elements: '<main>, <section>, <header>, <nav>, <footer>' } },
      { key: 'ev_semanticHtml_missing_article' },
    ]);
    expect(keys(makePage(), 'criterion_semanticHtml')[0]).toBe('ev_semanticHtml_none');
  });

  it('llms.txt: found and missing, with the URL', () => {
    const page = makePage({ url: 'https://example.com/a', llmsTxt: { exists: true, url: 'https://example.com/llms.txt', contentLength: 384 } });
    expect(ev(page, 'criterion_llmsTxt')).toEqual([
      { key: 'ev_llmsTxt_found', params: { url: 'https://example.com/llms.txt', chars: 384 } },
      { key: 'ev_llmsTxt_full_missing' },
    ]);
    expect(ev(makePage({ url: 'https://example.com/a' }), 'criterion_llmsTxt')[0]).toEqual({
      key: 'ev_llmsTxt_missing',
      params: { url: 'https://example.com/llms.txt' },
    });
  });

  it('robots.txt: groups blocked bots by purpose, with owners', () => {
    const robotsTxt = { exists: true, path: '/blog/', allowedBots: {}, blockedBots: ['GPTBot', 'OAI-SearchBot', 'CCBot'], totalChecked: 12 };
    const d = detail(makePage({ robotsTxt }), 'criterion_robotsTxt');
    expect(d.evidence).toEqual([
      { key: 'ev_robotsTxt_blocked_count', params: { blocked: 3, total: 12, path: '/blog/' } },
      { key: 'ev_robotsTxt_blocked_search', params: { bots: 'OAI-SearchBot (OpenAI)' } },
      { key: 'ev_robotsTxt_blocked_training', params: { bots: 'GPTBot (OpenAI), CCBot (Common Crawl)' } },
    ]);
    expect(d.fixKey).toBeUndefined();
    const trainingOnly = { ...robotsTxt, blockedBots: ['GPTBot'] };
    expect(detail(makePage({ robotsTxt: trainingOnly }), 'criterion_robotsTxt').fixKey).toBe('fix_robotsTxt_training');
    const allowed = { ...robotsTxt, blockedBots: [] };
    expect(ev(makePage({ robotsTxt: allowed }), 'criterion_robotsTxt')).toEqual([
      { key: 'ev_robotsTxt_all_allowed', params: { count: 12, path: '/blog/' } },
    ]);
  });

  it('crawler view: characters, headings and missing heading examples', () => {
    const crawlerView: CrawlerViewData = {
      status: 'partial', httpStatus: 200, renderedChars: 5000, rawChars: 2000, coverage: 0.4,
      renderedHeadings: 6, rawHeadings: 2, renderedHasH1: true, rawHasH1: false,
      renderedSchemaBlocks: 2, rawSchemaBlocks: 1, rawBytes: 9000,
      missingHeadings: ['Woher hat die Schweiz ihren Strom?', 'Was kostet das?'],
    };
    expect(ev(makePage({ crawlerView }), 'criterion_crawlerView')).toEqual([
      { key: 'ev_crawlerView_text', params: { raw: 2000, rendered: 5000, percent: 40 } },
      { key: 'ev_crawlerView_headings', params: { raw: 2, rendered: 6 } },
      { key: 'ev_crawlerView_h1_missing' },
      {
        key: 'ev_crawlerView_missing_headings',
        params: { count: 2, examples: '«Woher hat die Schweiz ihren Strom?», «Was kostet das?»' },
      },
      { key: 'ev_crawlerView_schema', params: { raw: 1, rendered: 2 } },
    ]);
    const ok = { ...crawlerView, status: 'ok' as const, rawChars: 5000, coverage: 1, rawHeadings: 6, rawHasH1: true, rawSchemaBlocks: 2, missingHeadings: [] };
    expect(keys(makePage({ crawlerView: ok }), 'criterion_crawlerView')).toEqual(['ev_crawlerView_text', 'ev_crawlerView_headings']);
  });
});

describe('MachineReadabilityAnalyzer — report texts (German)', () => {
  it('explains the missing FAQPage with the concrete count and the Google caveat', async () => {
    const { setLang } = await import('../../utils/i18n');
    const { mapAnalysisResult } = await import('../../utils/analysis-mapper');
    setLang('de');
    const page = makePage({
      schema: [{ '@type': 'NewsArticle', headline: 'H', author: 'Lukas Federer', datePublished: '2026-07-29' }],
      faqQuestions: Array.from({ length: 52 }, (_, i) => `Woher hat die Schweiz ihren Strom ${i}?`),
      robotsTxt: { exists: true, path: '/', allowedBots: {}, blockedBots: ['OAI-SearchBot'], totalChecked: 12 },
    });
    const mapped = mapAnalysisResult(new MachineReadabilityAnalyzer().analyze(page));
    const schema = mapped.details.find((d) => d.criterionKey === 'Strukturierte Daten (Schema.org)')!;
    const text = [...(schema.evidenceText ?? []), schema.whyText, schema.fixText].join('\n');
    expect(text).toContain('Gefunden: NewsArticle.');
    expect(text).toContain('Fehlt: FAQPage. Die Seite enthält 52 Fragen');
    expect(text).toContain('seit 2023');
    for (const d of mapped.details) {
      for (const line of [...(d.evidenceText ?? []), d.whyText ?? '', d.fixText ?? '']) {
        expect(line).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
    const robots = mapped.details.find((d) => (d.evidenceText ?? []).some((l) => l.includes('OAI-SearchBot (OpenAI)')));
    expect(robots?.evidenceText?.join(' ')).toContain('Gesperrte Such-Crawler: OAI-SearchBot (OpenAI)');
    setLang('en');
  });
});
