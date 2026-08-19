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
