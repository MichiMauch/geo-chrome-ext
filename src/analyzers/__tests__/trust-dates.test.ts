import { describe, it, expect, afterEach } from 'vitest';
import { TrustSourcesAnalyzer } from '../trust-sources';
import { mapAnalysisResult } from '../../utils/analysis-mapper';
import { setLang } from '../../utils/i18n';
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
    // Als Tag angezeigt, nicht als Rohtext der Fundstelle
    expect(detail?.value).toBe(neu.toISOString().slice(0, 10));
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

describe('TrustSourcesAnalyzer — Datum, Report-Belege', () => {
  afterEach(() => setLang('en'));

  const tag = (d: Date) => d.toISOString().slice(0, 10);
  // Exact days back (DST-safe), plus an hour so the floor is stable.
  const tageZurueck = (tage: number) => new Date(Date.now() - tage * 86400000 - 3600000);

  it('nennt Änderungs- und Veröffentlichungsdatum mit Alter', () => {
    const geaendert = tageZurueck(42);
    const publiziert = tageZurueck(85);
    const page = {
      ...makePage([
        { date: geaendert, formatted: geaendert.toISOString(), source: 'schema' as const },
        { date: publiziert, formatted: publiziert.toISOString(), source: 'schema' as const },
      ]),
      schema: [{ '@type': 'NewsArticle', dateModified: geaendert.toISOString(), datePublished: publiziert.toISOString() }],
    };
    expect(datumsDetail(page)?.evidence).toEqual([
      { key: 'ev_date_newest_modified', params: { date: tag(geaendert) } },
      { key: 'ev_date_age_days', params: { days: 42 } },
      { key: 'ev_date_also_published', params: { date: tag(publiziert) } },
      // Both dates only in the schema
      { key: 'ev_date_invisible', params: { date: tag(geaendert) } },
    ]);
  });

  it('meldet ein altes Veröffentlichungsdatum ohne Änderungsdatum', () => {
    setLang('de');
    const alt = tageZurueck(800);
    const base = makePage([{ date: alt, formatted: alt.toISOString(), source: 'meta' }]);
    const page = { ...base, meta: { ...base.meta, publishDate: alt.toISOString() } };
    const detail = datumsDetail(page);
    expect(detail?.evidence).toEqual([
      { key: 'ev_date_newest_published', params: { date: tag(alt) } },
      { key: 'ev_date_age_years', params: { years: 2 } },
      { key: 'ev_date_stale' },
      { key: 'ev_date_no_modified' },
      { key: 'ev_date_invisible', params: { date: tag(alt) } },
    ]);
    expect(detail?.fixKey).toBe('fix_date_old');

    const mapped = mapAnalysisResult(new TrustSourcesAnalyzer().analyze(page, 'article'))
      .details.find((d) => d.evidenceText?.some((e) => e.includes(tag(alt))));
    const text = mapped?.evidenceText?.join(' ') ?? '';
    expect(text).toContain(`veröffentlicht am ${tag(alt)}`);
    expect(text).toContain('rund 2 Jahre her');
    expect(text).not.toMatch(/\{\w+\}/);
    expect(mapped?.fixText).toContain('Änderungsdatum');
  });

  it('wertet ein Datum nur im Seitencode schwächer als ein sichtbares', () => {
    const neu = tageZurueck(10);
    const alt = tageZurueck(400);
    const schemaOnly = {
      ...makePage([
        { date: neu, formatted: neu.toISOString(), source: 'schema' as const },
        { date: alt, formatted: alt.toISOString(), source: 'time-element' as const },
      ]),
      schema: [{ '@type': 'Article', dateModified: neu.toISOString() }],
    };
    const visible = { ...schemaOnly, dates: [...schemaOnly.dates, { date: neu, formatted: '', source: 'text' as const }] };
    const d = datumsDetail(schemaOnly);
    expect(d?.evidence).toContainEqual({ key: 'ev_date_invisible_older', params: { date: tag(neu), shown: tag(alt) } });
    expect(d?.fixKey).toBe('fix_date_visible');
    expect(datumsDetail(visible)?.evidence?.map((e) => e.key)).not.toContain('ev_date_invisible_older');
    const score = (p: typeof schemaOnly) => new TrustSourcesAnalyzer().analyze(p, 'article').score;
    expect(score(schemaOnly)).toBeLessThan(score(visible));
  });

  it('meldet fehlendes Datum mit eigenem Beleg', () => {
    const detail = datumsDetail(makePage([]));
    expect(detail?.evidence).toEqual([{ key: 'ev_date_none' }]);
    expect(detail?.fixKey).toBe('fix_date');
  });

  it('kennzeichnet ein Datum nur im sichtbaren Text', () => {
    const d = tageZurueck(1);
    const detail = datumsDetail(makePage([{ date: d, formatted: 'gestern', source: 'text' }]));
    expect(detail?.evidence).toEqual([
      { key: 'ev_date_newest_visible', params: { date: tag(d) } },
      { key: 'ev_date_age_today' },
    ]);
  });

  it('gibt nicht anwendbaren Seiten keine Belege', () => {
    const detail = new TrustSourcesAnalyzer().analyze(makePage([]), 'homepage').details.find((x) => x.criterionKey === 'criterion_date');
    expect(detail?.evidence).toBeUndefined();
  });
});
