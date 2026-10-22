// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { generateHtmlReport } from '../export-html';
import { mapAnalysisResult } from '../analysis-mapper';
import { setLang } from '../i18n';
import type { AnalysisCategory, GEOAnalysisResult } from '../../types/analysis';

function category(): AnalysisCategory {
  return mapAnalysisResult({
    nameKey: 'cat_machineReadability',
    score: 2.5,
    maxScore: 5,
    recommendations: [],
    details: [
      {
        criterionKey: 'criterion_schema_completeness',
        found: true,
        weight: 1,
        progress: { current: 3, target: 3 },
        evidence: [{ key: 'ev_schema_completeness_ok', params: { types: 'NewsArticle' } }],
      },
      {
        criterionKey: 'criterion_schema',
        found: false,
        weight: 1,
        progress: { current: 1, target: 2 },
        evidence: [
          { key: 'ev_schema_found', params: { types: 'NewsArticle' } },
          { key: 'ev_schema_missing_faq', params: { count: 52, example: '«Woher?»' } },
        ],
      },
    ],
  });
}

function report(): Document {
  const c = category();
  const result = {
    url: 'https://www.example.ch/faq',
    timestamp: '2026-10-22T20:00:00Z',
    totalScore: 15,
    maxTotalScore: 30,
    rating: { level: 'fair', label: 'Fair', color: '#eab308' },
    categories: {
      contentClarity: c, answerability: c, trustSources: c,
      machineReadability: c, aiCitation: c, onPageSeo: c,
    },
    topRecommendations: [],
  } as unknown as GEOAnalysisResult;
  return new DOMParser().parseFromString(generateHtmlReport(result), 'text/html');
}

describe('HTML report layout', () => {
  beforeEach(() => setLang('de'));

  it('lists failing criteria first, collapsed, with the key finding as teaser', () => {
    const card = report().querySelector('#cat-machineReadability')!;
    const crits = Array.from(card.querySelectorAll('.crit'));
    expect(crits[0].classList.contains('crit-partial')).toBe(true);
    expect(crits[0].tagName).toBe('DETAILS');
    expect((crits[0] as HTMLDetailsElement).open).toBe(false);
    // "Missing: FAQPage" sums the criterion up better than "Found: NewsArticle"
    expect(crits[0].querySelector('.crit-teaser')!.textContent).toContain('FAQPage');
    expect(crits[0].querySelector('.crit-fix')).not.toBeNull();
    expect(crits[1].classList.contains('crit-ok')).toBe(true);
    expect(crits[1].querySelector('.crit-fix')).toBeNull();
  });

  it('shows only the non-zero status counts and an overview link per category', () => {
    const doc = report();
    expect(doc.querySelector('#cat-machineReadability .cat-counts')!.textContent).toBe('1 teilweise · 1 erfüllt');
    expect(doc.querySelectorAll('.overview-item')).toHaveLength(6);
    expect(doc.querySelector('.overview-item')!.getAttribute('href')).toBe('#cat-contentClarity');
  });
});
