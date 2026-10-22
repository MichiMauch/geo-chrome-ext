import { describe, it, expect, afterEach } from 'vitest';
import { ContentClarityAnalyzer } from '../content-clarity';
import { PageData, HeadingData } from '../../types/analysis';
import { setLang } from '../../utils/i18n';

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
