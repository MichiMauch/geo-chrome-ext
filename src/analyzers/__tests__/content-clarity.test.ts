import { describe, it, expect, afterEach } from 'vitest';
import { ContentClarityAnalyzer } from '../content-clarity';
import { PageData, HeadingData } from '../../types/analysis';
import { setLang } from '../../utils/i18n';
import { mapAnalysisResult } from '../../utils/analysis-mapper';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com',
    headings: [],
    paragraphs: [],
    lists: [],
    links: [],
    meta: { title: 'Title', description: 'Desc', author: 'Author', publishDate: null, modifiedDate: null, ogType: null },
    schema: [],
    author: null,
    dates: [],
    semanticElements: { hasArticle: true, hasMain: true, hasNav: true, hasAside: true, hasHeader: true, hasFooter: true, hasSection: true },
    llmsTxt: { exists: true },
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

const h = (level: number, text = `Heading ${level}`): HeadingData => ({ level, text });

// ≥80 chars each, so they count as substantive paragraphs for scanability.
const EN_PARAGRAPHS = [
  'This is a high quality paragraph with good length. It explains one idea in plain words.',
  'Another high quality paragraph that is concise. It adds a second point to the first one.',
  'A third paragraph to meet the minimum requirement. It closes the section with a short note.',
];

// Typical German Sachtext (economiesuisse-like FAQ answers).
const DE_PARAGRAPHS = [
  'Die Stromversorgung in der Schweiz ist heute sicher. Im Winter importiert das Land jedoch einen Teil seines Stroms aus dem Ausland.',
  'Deshalb braucht es zusätzliche Kraftwerke und mehr Speicher. Der Bund prüft verschiedene Massnahmen, um eine Mangellage zu verhindern.',
  'Wer Strom spart, hilft mit. Kleine Änderungen im Alltag haben eine grosse Wirkung, wenn viele Haushalte mitmachen.',
];

const LISTS = [
  { type: 'ul' as const, itemCount: 3, items: ['Item 1', 'Item 2', 'Item 3'] },
  { type: 'ol' as const, itemCount: 3, items: ['Step 1', 'Step 2', 'Step 3'] },
];

describe('ContentClarityAnalyzer', () => {
  const analyzer = new ContentClarityAnalyzer();
  const detail = (page: PageData, key: string) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === key)!;

  afterEach(() => setLang('en'));

  describe('H1', () => {
    it('passes a single H1 of reasonable length', () => {
      const d = detail(makePage({ headings: [h(1, 'A perfect GEO optimized headline')] }), 'criterion_h1');
      expect(d.found).toBe(true);
      expect(d.progress?.current).toBe(1);
    });

    it('accepts shorter H1s based on relaxed config', () => {
      expect(detail(makePage({ headings: [h(1, 'Short')] }), 'criterion_h1').found).toBe(true);
    });

    it('fails and recommends when no H1 exists', () => {
      const result = analyzer.analyze(makePage({ headings: [h(2, 'No H1 here')], paragraphs: ['Some text'] }));
      expect(result.details.find((d) => d.criterionKey === 'criterion_h1')?.found).toBe(false);
      expect(result.recommendations).toContain('no_h1');
    });

    it('gives partial credit proportional to the weight for multiple H1s', () => {
      const d = detail(makePage({ headings: [h(1, 'First headline'), h(1, 'Second headline')] }), 'criterion_h1');
      expect(d.found).toBe(false);
      expect(d.value).toBe('value_h1Optimal');
      expect(d.progress?.current).toBe(0.5);
    });
  });

  describe('heading hierarchy', () => {
    it('scores a clean outline with enough subheadings at 100%', () => {
      const d = detail(makePage({ headings: [h(1), h(2), h(2), h(3), h(3)] }), 'criterion_hierarchy');
      expect(d.value).toBe('100%');
      expect(d.found).toBe(true);
    });

    it('never passes without an H1, even with a rich outline', () => {
      const d = detail(makePage({ headings: [h(2), h(2), h(3), h(2), h(3), h(2)] }), 'criterion_hierarchy');
      expect(d.found).toBe(false);
      expect(d.value).toBe('60%');
    });

    it('does not let the subheading bonus compensate a late H1 (20×H3 then H1)', () => {
      const headings = [...Array.from({ length: 20 }, () => h(3)), h(1)];
      const d = detail(makePage({ headings }), 'criterion_hierarchy');
      expect(d.value).not.toBe('100%');
      expect(d.value).toBe('80%');
    });

    it('deducts per level skip and withholds the bonus', () => {
      // H2 → H4 is one skip (−0.2); 4 subheadings would earn the bonus on a
      // flawless outline, but not here.
      const d = detail(makePage({ headings: [h(1), h(2), h(4), h(2), h(3), h(3)] }), 'criterion_hierarchy');
      expect(d.value).toBe('80%');
    });

    it('deducts for multiple H1s and too few subheadings', () => {
      const d = detail(makePage({ headings: [h(1), h(1), h(2)] }), 'criterion_hierarchy');
      // −0.1 multiple H1s, −0.1 fewer than 2 subheadings
      expect(d.value).toBe('80%');
    });

    it('scores 0 without any headings', () => {
      const result = analyzer.analyze(makePage());
      const d = result.details.find((x) => x.criterionKey === 'criterion_hierarchy')!;
      expect(d.value).toBe('0%');
      expect(result.recommendations).toContain('bad_hierarchy');
    });
  });

  describe('scannability', () => {
    it('reaches 100% with short paragraphs, lists and a healthy heading density', () => {
      const d = detail(
        makePage({ headings: [h(1), h(2), h(2), h(3), h(3)], paragraphs: EN_PARAGRAPHS, lists: LISTS }),
        'criterion_scannable'
      );
      expect(d.value).toBe('100%');
      expect(d.found).toBe(true);
    });

    it('ignores paragraphs under 80 characters for count and length', () => {
      const shortOnes = Array.from({ length: 10 }, (_, i) => `Kurzer Teaser Nummer ${i} mit Link.`);
      const d = detail(makePage({ headings: [h(1), h(2), h(2)], paragraphs: shortOnes }), 'criterion_scannable');
      // No substantive paragraphs, no lists, no content blocks → 0
      expect(d.value).toBe('0%');
      expect(d.found).toBe(false);
    });

    it('caps the heading-density factor when headings outnumber content', () => {
      // 20 subheadings over 2 paragraphs: headings without content.
      const headings = [h(1), ...Array.from({ length: 20 }, () => h(2))];
      const many = detail(makePage({ headings, paragraphs: EN_PARAGRAPHS.slice(0, 2) }), 'criterion_scannable');
      // 0.075 (1–2 paragraphs) + 0.25 (short) + 0 (ratio 10 > excessive)
      expect(many.value).toBe('33%');

      const balanced = detail(
        makePage({ headings: [h(1), h(2)], paragraphs: EN_PARAGRAPHS.slice(0, 2) }),
        'criterion_scannable'
      );
      // ratio 0.5 sits in the sweet spot → +0.2
      expect(balanced.value).toBe('53%');
    });

    it('rewards long paragraphs less', () => {
      const long = Array.from({ length: 3 }, () => 'Lorem ipsum dolor sit amet. '.repeat(25));
      const d = detail(makePage({ headings: [h(1)], paragraphs: long }), 'criterion_scannable');
      // 0.3 (count) + 0.05 (avg 700 chars < max) + 0 lists + 0 ratio
      expect(d.value).toBe('35%');
    });
  });

  describe('readability', () => {
    it('uses LIX for a German page even with an English UI', () => {
      setLang('en');
      const d = detail(makePage({ lang: 'de', paragraphs: DE_PARAGRAPHS }), 'criterion_readability');
      expect(String(d.value)).toMatch(/^\d+ LIX$/);
      expect(d.found).toBe(true);
    });

    it('detects German from the text when no page language is declared', () => {
      setLang('en');
      const d = detail(makePage({ paragraphs: DE_PARAGRAPHS }), 'criterion_readability');
      expect(String(d.value)).toMatch(/LIX$/);
    });

    it('uses Flesch for an English page even with a German UI', () => {
      setLang('de');
      const d = detail(makePage({ lang: 'en', paragraphs: EN_PARAGRAPHS }), 'criterion_readability');
      expect(String(d.value)).toMatch(/^\d+ Flesch$/);
      expect(d.found).toBe(true);
    });

    it('never shows a negative Flesch value', () => {
      const d = detail(
        makePage({
          lang: 'en',
          paragraphs: [
            'The phenomenological investigation of consciousness necessitates a comprehensive understanding of intentionality and the constitutive operations performed by transcendental subjectivity throughout temporally extended experiential horizons.',
          ],
        }),
        'criterion_readability'
      );
      expect(d.value).toBe('0 Flesch');
      expect(d.found).toBe(false);
    });

    it('is skipped for too little text', () => {
      const result = analyzer.analyze(makePage({ paragraphs: ['Hi.'] }));
      expect(result.details.find((d) => d.criterionKey === 'criterion_readability')).toBeUndefined();
      expect(result.recommendations).not.toContain('low_readability');
    });
  });

  it('gives a high overall score for a well-structured page', () => {
    const result = analyzer.analyze(
      makePage({
        lang: 'en',
        headings: [h(1, 'A perfect GEO optimized headline'), h(2), h(2), h(3), h(3)],
        paragraphs: EN_PARAGRAPHS,
        lists: LISTS,
      })
    );
    expect(result.score).toBeGreaterThan(4);
    expect(result.recommendations).toEqual([]);
  });
});

describe('ContentClarityAnalyzer report evidence', () => {
  const analyzer = new ContentClarityAnalyzer();
  const detail = (page: PageData, key: string) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === key)!;
  const keys = (d: { evidence?: { key: string }[] }) => (d.evidence ?? []).map((e) => e.key);
  const line = (d: { evidence?: { key: string; params?: Record<string, string | number> }[] }, key: string) =>
    d.evidence!.find((e) => e.key === key)!;

  afterEach(() => setLang('en'));

  describe('h1', () => {
    it('names the H1 when it is fine', () => {
      const d = detail(makePage({ headings: [h(1, 'Heat pumps explained')] }), 'criterion_h1');
      expect(line(d, 'ev_h1_ok').params).toEqual({ text: '"Heat pumps explained"' });
      expect(d.fixKey).toBeUndefined();
    });

    it('reports a missing H1 and the first heading instead', () => {
      const d = detail(makePage({ headings: [h(2, 'Intro')] }), 'criterion_h1');
      expect(keys(d)).toEqual(['ev_h1_none', 'ev_h1_first_heading']);
      expect(line(d, 'ev_h1_first_heading').params).toEqual({ level: 2, text: '"Intro"' });
    });

    it('lists multiple H1s and picks the multiple-H1 fix', () => {
      const d = detail(makePage({ headings: [h(1, 'Logo'), h(1, 'Main topic')] }), 'criterion_h1');
      expect(line(d, 'ev_h1_multiple').params).toEqual({ count: 2, examples: '"Logo", "Main topic"' });
      expect(d.fixKey).toBe('fix_h1_multiple');
    });

    it('reports a too-short H1 with its length', () => {
      const d = detail(makePage({ headings: [h(1, 'GEO')] }), 'criterion_h1');
      expect(line(d, 'ev_h1_too_short').params).toEqual({ text: '"GEO"', length: 3, min: 5 });
      expect(d.fixKey).toBe('fix_h1_length');
    });
  });

  describe('hierarchy', () => {
    it('names each skipped level with the heading text', () => {
      const d = detail(
        makePage({ headings: [h(1, 'Title'), h(3, 'Auf einen Blick'), h(2, 'A'), h(3, 'B')] }),
        'criterion_hierarchy'
      );
      expect(line(d, 'ev_hierarchy_outline').params).toEqual({ outline: '1 × H1, 1 × H2, 2 × H3' });
      expect(line(d, 'ev_hierarchy_skips').params).toEqual({ count: 1, examples: 'H1 → H3 "Auf einen Blick"' });
      expect(keys(d)).not.toContain('ev_hierarchy_ok');
    });

    it('confirms a clean outline', () => {
      const d = detail(makePage({ headings: [h(1), h(2), h(3), h(2)] }), 'criterion_hierarchy');
      expect(keys(d)).toEqual(['ev_hierarchy_outline', 'ev_hierarchy_ok']);
    });

    it('reports a late H1 and the no-H1 case', () => {
      const late = detail(makePage({ headings: [h(2, 'X'), h(2, 'Y'), h(3, 'Z'), h(1, 'T'), h(2)] }), 'criterion_hierarchy');
      expect(line(late, 'ev_hierarchy_late_h1').params).toEqual({ position: 4, before: '"X", "Y"' });
      const none = detail(makePage({ headings: [h(2), h(2)] }), 'criterion_hierarchy');
      expect(keys(none)).toContain('ev_hierarchy_no_h1');
      expect(none.fixKey).toBe('fix_hierarchy_no_h1');
      expect(keys(detail(makePage(), 'criterion_hierarchy'))).toEqual(['ev_hierarchy_none']);
    });
  });

  describe('scannable', () => {
    it('explains headings without text and hidden FAQ answers', () => {
      const d = detail(
        makePage({
          headings: [h(1, 'FAQ'), ...Array.from({ length: 6 }, (_, i) => h(3, `Question ${i}?`))],
          paragraphs: ['A'.repeat(405)],
          faqAnswersHidden: 6,
        }),
        'criterion_scannable'
      );
      expect(line(d, 'ev_scannable_paragraphs').params).toEqual({ count: 1, avg: 405, min: 80, good: 300 });
      expect(keys(d)).toContain('ev_scannable_no_lists');
      expect(line(d, 'ev_scannable_headings_too_many').params).toEqual({ headings: 6, blocks: 1 });
      expect(line(d, 'ev_scannable_hidden_answers').params).toEqual({ count: 6 });
      expect(d.fixKey).toBe('fix_scannable_hidden');
    });

    it('describes a well-chunked page', () => {
      const d = detail(
        makePage({ headings: [h(1, 'T'), h(2, 'A'), h(2, 'B')], paragraphs: EN_PARAGRAPHS, lists: LISTS }),
        'criterion_scannable'
      );
      expect(keys(d)).toEqual(['ev_scannable_paragraphs', 'ev_scannable_lists', 'ev_scannable_headings_ok']);
      expect(d.fixKey).toBeUndefined();
    });

    it('names the longest paragraph when several are too long', () => {
      const long = 'Word '.repeat(80).trim();
      const d = detail(makePage({ paragraphs: [long, long + ' extra', EN_PARAGRAPHS[0]] }), 'criterion_scannable');
      expect(line(d, 'ev_scannable_longest').params).toMatchObject({ count: 2, length: long.length + 6 });
    });
  });

  describe('readability', () => {
    it('explains formula, value, scale and the hardest paragraph for German text', () => {
      setLang('de');
      const hard = 'Die Versorgungssicherheitsbeurteilung berücksichtigt Wechselwirkungen zwischen Produktionskapazitäten, Netzinfrastruktur, Speichertechnologien und grenzüberschreitenden Handelsbeziehungen.';
      const d = detail(makePage({ lang: 'de', paragraphs: [...DE_PARAGRAPHS, hard] }), 'criterion_readability');
      expect(line(d, 'ev_readability_formula_lix').params).toEqual({ lang: 'Deutsch' });
      expect(line(d, 'ev_readability_value_lix').params).toMatchObject({ pass: 52 });
      expect(keys(d)).toContain('ev_readability_stats_lix');
      expect(String(line(d, 'ev_readability_hardest_lix').params!.text)).toContain('Die Versorgungssicherheitsbeurteilung');
    });

    it('uses Flesch wording for English text and flags little text', () => {
      const d = detail(makePage({ lang: 'en', paragraphs: EN_PARAGRAPHS }), 'criterion_readability');
      expect(keys(d)).toContain('ev_readability_formula_flesch');
      expect(line(d, 'ev_readability_value_flesch').params).toMatchObject({ pass: 60 });
      expect(line(d, 'ev_readability_stats_flesch').params).toHaveProperty('syllables');
      expect(keys(d)).toContain('ev_readability_little_text');
    });

    it('says when the page language is unknown', () => {
      const d = detail(makePage({ paragraphs: ['xyzzy plugh quux frobnicate wibble wobble foo bar baz qux. Lorem ipsum dolor sit amet consectetur.'] }), 'criterion_readability');
      expect(keys(d)).toContain('ev_readability_formula_lix_unknown');
    });
  });

  it('translates into German report text with the concrete data', () => {
    setLang('de');
    const category = analyzer.analyze(
      makePage({
        lang: 'de',
        headings: [h(1, 'Stromversorgung der Schweiz'), h(3, 'Auf einen Blick'), h(2, 'A'), h(3, 'B')],
        paragraphs: DE_PARAGRAPHS,
      })
    );
    const mapped = mapAnalysisResult(category).details;
    const all = mapped.flatMap((d) => [...(d.evidenceText ?? []), d.whyText ?? '', d.fixText ?? '']).join('\n');
    expect(all).toContain('H1 gefunden: «Stromversorgung der Schweiz».');
    expect(all).toContain('Übersprungene Ebenen (1): H1 → H3 «Auf einen Blick».');
    expect(all).toMatch(/LIX \d+: /);
    expect(all).toContain('weil die Seite auf Deutsch ist');
    expect(all).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(all).not.toMatch(/\bev_/);
  });
});
