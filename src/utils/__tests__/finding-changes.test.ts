// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { GEOAnalysisResult, AnalysisCategory } from '../../types/analysis';
import { mapAnalysisResult } from '../analysis-mapper';
import { setLang } from '../i18n';

// chrome.storage stub for saveAnalysis
const store: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
      set: async (items: Record<string, unknown>) => Object.assign(store, items),
    },
  },
};

const { saveAnalysis } = await import('../history');
const { criterionChecks, diffChecks, formatCriterionList } = await import('../trend');
const { generateHtmlReport } = await import('../export-html');

function result(found: Record<string, boolean>, score = 15): GEOAnalysisResult {
  const category = mapAnalysisResult({
    nameKey: 'cat_trustSources',
    score: 2,
    maxScore: 5,
    recommendations: [],
    details: [
      ...Object.entries(found).map(([criterionKey, f]) => ({
        criterionKey, found: f, weight: 1, progress: { current: f ? 1 : 0, target: 1 },
      })),
      { criterionKey: 'criterion_date', found: true, weight: 0, value: 'value_notApplicable' },
    ],
  } as AnalysisCategory);
  return {
    url: 'https://x.ch/a',
    timestamp: new Date().toISOString(),
    totalScore: score,
    maxTotalScore: 30,
    rating: { level: 'moderate', label: 'Moderate', color: '#eab308' },
    categories: {
      contentClarity: category, answerability: category, trustSources: category,
      machineReadability: category, aiCitation: category, onPageSeo: category,
    },
    topRecommendations: [],
  } as GEOAnalysisResult;
}

describe('Vorher/Nachher pro Befund', () => {
  beforeEach(() => {
    setLang('de');
    for (const k of Object.keys(store)) delete store[k];
  });

  it('merkt sich erfüllte Kriterien sprachunabhängig, ohne nicht anwendbare', () => {
    expect(criterionChecks(result({ criterion_author: false, criterion_sitemap: true }))).toEqual({
      criterion_author: false,
      criterion_sitemap: true,
    });
  });

  it('vergleicht nur Kriterien, die beide Male geprüft wurden', () => {
    expect(diffChecks({ a: false, b: true, c: false }, { a: true, b: false, d: false })).toEqual({ fixed: ['a'], regressed: ['b'] });
  });

  it('liefert beim zweiten Speichern behobene und neue Befunde', async () => {
    expect(await saveAnalysis(result({ criterion_author: false, criterion_sitemap: true }, 14))).toBeNull();
    const trend = await saveAnalysis(result({ criterion_author: true, criterion_sitemap: false }, 15));
    expect(trend).toMatchObject({ direction: 'up', fixed: ['criterion_author'], regressed: ['criterion_sitemap'] });
    expect(formatCriterionList(trend!.fixed!)).toBe('Autor/Organisation erkennbar');
  });

  it('zeigt die Änderungen im Bericht', async () => {
    const r = result({ criterion_author: true });
    r.changes = { direction: 'up', delta: 1, previousScore: 14, previousTimestamp: '2026-10-01T10:00:00Z', fixed: ['criterion_author'], regressed: [] };
    const doc = new DOMParser().parseFromString(generateHtmlReport(r), 'text/html');
    expect(doc.querySelector('.changes-card .card-title')!.textContent).toContain('Seit der letzten Prüfung');
    expect(doc.querySelectorAll('.changes-fixed .changes-item')).toHaveLength(1);
    expect(doc.querySelector('.changes-new')).toBeNull();
    expect(new DOMParser().parseFromString(generateHtmlReport(result({})), 'text/html').querySelector('.changes-card')).toBeNull();
  });
});
