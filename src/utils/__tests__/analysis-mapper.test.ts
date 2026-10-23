import { describe, it, expect, beforeAll } from 'vitest';
import { mapAnalysisResult } from '../analysis-mapper';
import { setLang } from '../i18n';
import { runFullAnalysis } from '../../analyzers';
import type { AnalysisCategory, CategoryDetail, PageData } from '../../types/analysis';

const PLACEHOLDER = /\{[a-zA-Z]+\}/;

function mapValue(detail: Partial<CategoryDetail>): string | number | undefined {
  const category: AnalysisCategory = {
    nameKey: 'cat_machineReadability',
    score: 0,
    maxScore: 5,
    details: [{ criterionKey: 'criterion_schema', found: true, weight: 1, ...detail }],
    recommendations: [],
  } as AnalysisCategory;
  return mapAnalysisResult(category).details[0].value;
}

describe('mapAnalysisResult — value placeholders', () => {
  beforeAll(() => setLang('en'));

  // Every value key with placeholders, in the shape its analyzer emits it
  const cases: [string, Partial<CategoryDetail>, string][] = [
    ['value_lists', { progress: { current: 2, target: 3 } }, '2/3 lists/tables'],
    ['value_subheadings', { progress: { current: 3, target: 3 } }, '3/3 subheadings'],
    ['value_externalLinks', { progress: { current: 1, target: 2 } }, '1/2 external links'],
    [
      'value_schemaTypes',
      { progress: { current: 2, target: 2 }, valueParams: { types: 'NewsArticle, BreadcrumbList' } },
      '2/2 types (NewsArticle, BreadcrumbList)',
    ],
    [
      'value_schemaTypesMissing',
      { progress: { current: 1, target: 2 }, valueParams: { types: 'WebPage, Organization', missing: 'Article' } },
      '1/2 types (WebPage, Organization), missing: Article',
    ],
    [
      'value_socialCardsMissing',
      { progress: { current: 5, target: 6 }, valueParams: { missing: 'twitter:card' } },
      '5/6 (missing: twitter:card)',
    ],
    ['value_olderThanYear', { valueParams: { date: '1 March 2024' } }, '1 March 2024 (older than 1 year)'],
  ];

  it.each(cases)('%s is fully filled', (key, detail, expected) => {
    expect(mapValue({ value: key, ...detail })).toBe(expected);
  });

  it('explicit valueParams win over progress', () => {
    expect(
      mapValue({ value: 'value_lists', progress: { current: 3, target: 3 }, valueParams: { current: '7' } })
    ).toBe('7/3 lists/tables');
  });

  it('leaves already formatted values untouched', () => {
    expect(mapValue({ value: '85%', progress: { current: 85, target: 100 } })).toBe('85%');
  });
});

describe('runFullAnalysis — no raw placeholders reach the UI', () => {
  beforeAll(() => setLang('en'));

  it('every detail value of a typical article is fully translated', () => {
    const page: PageData = {
      url: 'https://example.com/news/story',
      headings: [
        { level: 1, text: 'Energy prices explained for households' },
        { level: 2, text: 'What drives the price' },
        { level: 2, text: 'What happens next' },
      ],
      paragraphs: ['Energy prices rose by 12% in 2025, according to the federal office.', 'Second paragraph.', 'Third.'],
      lists: [],
      links: [
        { href: 'https://example.com/guide', text: 'Guide to tariffs', isExternal: false },
        { href: 'https://www.admin.ch/report', text: 'Federal report', isExternal: true },
      ],
      meta: { title: 'Energy prices explained', description: 'Short.', author: '', publishDate: null, modifiedDate: null, ogType: null },
      schema: [{ '@type': 'NewsArticle', headline: 'Energy prices explained', author: { '@type': 'Person' } }],
      author: null,
      dates: [],
      semanticElements: { hasArticle: true, hasMain: true, hasNav: true, hasAside: false, hasHeader: true, hasFooter: true, hasSection: false },
      llmsTxt: { exists: false },
      robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
      images: [],
      openGraph: { title: 'Energy prices', description: null, image: null, url: null, type: 'website' },
      twitterCard: { card: null, title: null, description: null, image: null },
      robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
      viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: 'width=device-width' },
      canonical: { href: null },
    };

    const result = runFullAnalysis(page);
    for (const category of Object.values(result.categories)) {
      for (const detail of category.details) {
        expect(String(detail.value ?? ''), `${detail.criterionKey}`).not.toMatch(PLACEHOLDER);
      }
    }
  });
});
