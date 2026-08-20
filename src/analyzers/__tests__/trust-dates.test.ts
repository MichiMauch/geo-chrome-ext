import { describe, it, expect } from 'vitest';
import { TrustSourcesAnalyzer } from '../trust-sources';
import { mapAnalysisResult } from '../../utils/analysis-mapper';
import type { DateData, PageData } from '../../types/analysis';

function makePage(dates: DateData[]): PageData {
  return {
    url: 'https://example.com/artikel',
    headings: [{ level: 1, text: 'Titel' }],
    paragraphs: [],
    lists: [],
    links: [],
    meta: { title: 'Ein Titel', description: '', author: '', publishDate: null, modifiedDate: null, ogType: 'article' },
    schema: [],
    author: null,
    dates,
    semanticElements: { hasArticle: false, hasMain: false, hasNav: false, hasAside: false, hasHeader: false, hasFooter: false, hasSection: false },
    llmsTxt: { exists: false },
    robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
    images: [],
    openGraph: { title: null, description: null, image: null, url: null, type: null },
    twitterCard: { card: null, title: null, description: null, image: null },
    robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
    viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: 'width=device-width, initial-scale=1' },
    canonical: { href: 'https://example.com/artikel' },
  };
}

function datum(iso: string, formatted = iso): DateData {
  return { date: new Date(iso), formatted, source: 'schema' };
}

function vorTagen(tage: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  return d;
}

function datumsDetail(page: PageData) {
  const kategorie = new TrustSourcesAnalyzer().analyze(page, 'article');
  return kategorie.details.find((d) => d.criterionKey === 'criterion_date');
}

describe('TrustSourcesAnalyzer — Datum', () => {
  it('zeigt das neuste Datum, nicht das erste in der Liste', () => {
    const neu = vorTagen(3);
    const page = makePage([
      datum('2021-03-15T09:42:36+0100'),
      { date: neu, formatted: 'Last updated: heute', source: 'text' },
    ]);

    const detail = datumsDetail(page);
    expect(detail?.value).toBe('Last updated: heute');
    expect(detail?.progress?.current).toBe(1);
  });

  it('setzt das Datum in den Hinweis ein, wenn alles älter als ein Jahr ist', () => {
    const page = makePage([datum('2021-03-15'), datum('2022-06-01')]);

    const detail = datumsDetail(page);
    expect(detail?.value).toBe('value_olderThanYear');
    // Das jüngste der alten Daten, nicht das erste
    expect(detail?.valueParams).toEqual({ date: '2022-06-01' });
    expect(detail?.progress?.current).toBe(0.5);

    // Und im Panel steht kein Platzhalter mehr, sondern das Datum
    const uebersetzt = mapAnalysisResult(
      new TrustSourcesAnalyzer().analyze(page, 'article')
    ).details.find((d) => String(d.value).includes('2022-06-01'));
    expect(uebersetzt).toBeDefined();
    expect(String(uebersetzt?.value)).not.toContain('{date}');
  });

  it('meldet fehlendes Datum unverändert', () => {
    const detail = datumsDetail(makePage([]));
    expect(detail?.value).toBe('value_noDateFound');
    expect(detail?.progress?.current).toBe(0);
  });
});
