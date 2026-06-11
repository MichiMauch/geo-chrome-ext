import { describe, it, expect } from 'vitest';
import { MachineReadabilityAnalyzer } from '../machine-readability';
import type { PageData, SchemaData } from '../../types/analysis';

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
