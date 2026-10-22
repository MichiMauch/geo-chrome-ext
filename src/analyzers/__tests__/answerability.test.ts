import { describe, it, expect, afterEach } from 'vitest';
import { AnswerabilityAnalyzer } from '../answerability';
import { mapAnalysisResult } from '../../utils/analysis-mapper';
import { setLang } from '../../utils/i18n';
import { PageData, HeadingData, ListData } from '../../types/analysis';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com/article',
    headings: [],
    paragraphs: [],
    lists: [],
    links: [],
    meta: { title: 'Title', description: '', author: '', publishDate: null, modifiedDate: null, ogType: null },
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
    viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: null },
    canonical: { href: null },
    ...overrides,
  };
}

const h = (level: number, text = `Heading ${level}`): HeadingData => ({ level, text });
const list = (n = 3): ListData => ({ type: 'ul', itemCount: n, items: Array.from({ length: n }, (_, i) => `Item ${i}`) });

describe('AnswerabilityAnalyzer', () => {
  const analyzer = new AnswerabilityAnalyzer();
  const detail = (page: PageData, key: string) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === key)!;

  describe('definitions', () => {
    it('credits German definition sentences', () => {
      const d = detail(
        makePage({
          paragraphs: [
            'Ein Smart Meter ist ein digitaler Stromzähler. Er misst den Verbrauch viertelstündlich.',
            'Die Grundversorgung bezeichnet die Belieferung durch den lokalen Netzbetreiber.',
            'Seit Jahren wird darüber diskutiert. Unter Netzstabilität versteht man die Fähigkeit, Last und Erzeugung auszugleichen.',
          ],
        }),
        'criterion_definitions'
      );
      // 3 definitions → 0.7, no structured paragraphs
      expect(d.value).toBe('70%');
      expect(d.found).toBe(true);
    });

    it('credits English, French and Spanish definitions', () => {
      const d = detail(
        makePage({
          paragraphs: [
            'A heat pump is a device that moves heat from a cold place to a warm one.',
            "L'électricité est une forme d'énergie.",
            'La red eléctrica es un sistema interconectado.',
          ],
        }),
        'criterion_definitions'
      );
      expect(d.value).toBe('70%');
    });

    it('does not count a bare "ist" as a definition (audit false positive)', () => {
      const result = analyzer.analyze(
        makePage({
          paragraphs: [
            'Ob das sinnvoll ist, wissen wir nicht.',
            'Ob das sinnvoll ist, wissen wir nicht.',
            'Ob das sinnvoll ist, wissen wir nicht.',
          ],
        })
      );
      const d = result.details.find((x) => x.criterionKey === 'criterion_definitions')!;
      expect(d.value).toBe('0%');
      expect(d.found).toBe(false);
      expect(result.recommendations).toContain('no_definitions');
    });

    it('ignores pronoun statements, plain adjectives and questions', () => {
      const d = detail(
        makePage({
          paragraphs: [
            'Das ist ein Problem für viele Haushalte.',
            'Strom ist teuer geworden.',
            'Was ist ein Smart Meter?',
            'It is a good idea to compare offers.',
            'This is the reason why prices rise.',
          ],
        }),
        'criterion_definitions'
      );
      expect(d.value).toBe('0%');
    });

    it('handles umlauts at the term start (Unicode boundaries)', () => {
      const d = detail(
        makePage({ paragraphs: ['Übertragungsnetzbetreiber sind die Firmen, die das Höchstspannungsnetz betreiben.'] }),
        'criterion_definitions'
      );
      // 1 of 3 definitions → 0.7 × 1/3
      expect(d.value).toBe('23%');
    });

    it('counts structured paragraphs but not dates like "1. Januar 2025"', () => {
      const structured = detail(
        makePage({ paragraphs: ['1. Schritt: Zähler ablesen.', '2) Antrag online stellen.'] }),
        'criterion_definitions'
      );
      expect(structured.value).toBe('30%');

      const dates = detail(
        makePage({
          paragraphs: [
            '1. Januar 2025 tritt das neue Stromgesetz in Kraft.',
            '15. März 2024: Das Parlament hat entschieden.',
          ],
        }),
        'criterion_definitions'
      );
      expect(dates.value).toBe('0%');
    });

    it('is not applicable on homepages', () => {
      const result = analyzer.analyze(makePage({ paragraphs: ['Ob das sinnvoll ist, wissen wir nicht.'] }), 'homepage');
      const d = result.details.find((x) => x.criterionKey === 'criterion_definitions')!;
      expect(d.weight).toBe(0);
      expect(result.recommendations).not.toContain('no_definitions');
    });
  });

  describe('lists', () => {
    it('scores proportionally up to the target count', () => {
      const one = detail(makePage({ lists: [list()] }), 'criterion_lists');
      expect(one.found).toBe(true);
      expect(one.progress).toMatchObject({ current: 1, target: 3 });

      const many = detail(makePage({ lists: [list(), list(), list(), list()] }), 'criterion_lists');
      expect(many.progress).toMatchObject({ current: 3, target: 3 });
    });

    it('recommends lists when there are none', () => {
      const result = analyzer.analyze(makePage());
      expect(result.details.find((d) => d.criterionKey === 'criterion_lists')?.found).toBe(false);
      expect(result.recommendations).toContain('no_lists');
    });
  });

  describe('structured sections', () => {
    const paragraphs = ['Erster Absatz.', 'Zweiter Absatz.', 'Dritter Absatz.'];

    it('passes with enough subheadings and paragraphs', () => {
      const result = analyzer.analyze(makePage({ headings: [h(1), h(2), h(2), h(3)], paragraphs }));
      expect(result.details.find((d) => d.criterionKey === 'criterion_sections')?.found).toBe(true);
      expect(result.recommendations).not.toContain('few_sections');
    });

    it('gives partial credit proportional to the subheadings reached', () => {
      // Homepage: only lists (0/3) and sections carry weight (1.5 each).
      // n of 3 subheadings → n/3 of the sections weight → n/3 × 1.5 / 3 × 5.
      // The old fixed 0.5 points gave 1 and 2 subheadings the same 0.8.
      const score = (n: number) =>
        analyzer.analyze(makePage({ headings: [h(1), ...Array.from({ length: n }, () => h(2))], paragraphs }), 'homepage').score;
      expect(score(1)).toBe(0.8);
      expect(score(2)).toBe(1.7);
      expect(score(3)).toBe(2.5);
    });

    it('halves the credit when there is too little body text', () => {
      const thin = analyzer.analyze(makePage({ headings: [h(2), h(2), h(2)], paragraphs: ['Nur ein Absatz.'] }), 'homepage');
      expect(thin.details.find((d) => d.criterionKey === 'criterion_sections')?.found).toBe(false);
      // 0.5 × 1.5 / 3 × 5 = 1.25
      expect(thin.score).toBeGreaterThanOrEqual(1.2);
      expect(thin.score).toBeLessThanOrEqual(1.3);
    });
  });
});

describe('direct answers under question headings', () => {
  const analyzer = new AnswerabilityAnalyzer();
  const score = (page: PageData) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === 'criterion_definitions')!.progress!.current;
  const qa = (question: string, answer: string) => ({ question, answer });

  it('credits a question heading answered with a statement', () => {
    const page = makePage({
      questionAnswers: [
        qa('Woher hat die Schweiz ihren Strom?', 'Rund 60 Prozent stammen aus Wasserkraft, etwa 30 Prozent aus Kernenergie.'),
        qa('Ist Schweizer Strom klimaneutral?', 'Weitgehend ja, weil Wasserkraft und Kernenergie kaum CO2 ausstossen.'),
        qa('Was kostet der Ausbau?', 'Die Schätzungen reichen von 30 bis 70 Milliarden Franken bis 2050.'),
      ],
    });
    expect(score(page)).toBe(70);
  });

  it('gives nothing for hidden answers or answers that open with a question', () => {
    const page = makePage({
      questionAnswers: [
        qa('Woher hat die Schweiz ihren Strom?', ''),
        qa('Ist Schweizer Strom klimaneutral?', 'Gute Frage?'),
        qa('Was kostet es?', 'Viel.'),
      ],
    });
    expect(score(page)).toBe(0);
  });

  it('does not count an answer twice when it is also a definition', () => {
    const def = 'Ein Smart Meter ist ein digitaler Stromzähler, der den Verbrauch laufend misst.';
    const page = makePage({
      paragraphs: [def],
      questionAnswers: [qa('Was ist ein Smart Meter?', def)],
    });
    // One of three needed → 1/3 × 70 %
    expect(score(page)).toBe(23);
  });
});

describe('AnswerabilityAnalyzer report evidence', () => {
  const analyzer = new AnswerabilityAnalyzer();
  const detail = (page: PageData, key: string) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === key)!;
  const keys = (d: { evidence?: { key: string }[] }) => (d.evidence ?? []).map((e) => e.key);
  const line = (d: { evidence?: { key: string; params?: Record<string, string | number> }[] }, key: string) =>
    d.evidence!.find((e) => e.key === key)!;

  afterEach(() => setLang('en'));

  describe('definitions', () => {
    it('counts definitions and direct answers with examples', () => {
      const d = detail(
        makePage({
          paragraphs: ['Ein Smart Meter ist ein digitaler Stromzähler. Er misst den Verbrauch.'],
          questionAnswers: [
            { question: 'Woher kommt der Strom?', answer: 'Rund 60 Prozent stammen aus Wasserkraft.' },
            { question: 'Was kostet das?', answer: 'Kommt drauf an?' },
          ],
        }),
        'criterion_definitions'
      );
      expect(line(d, 'ev_definitions_sentences').params).toEqual({
        count: 1,
        example: '"Ein Smart Meter ist ein digitaler Stromzähler."',
      });
      expect(line(d, 'ev_definitions_answers').params).toEqual({ questions: 2, answered: 1 });
      expect(line(d, 'ev_definitions_answer_example').params).toEqual({
        question: '"Woher kommt der Strom?"',
        answer: '"Rund 60 Prozent stammen aus Wasserkraft."',
      });
      expect(line(d, 'ev_definitions_total').params).toEqual({ count: 2, target: 3 });
      expect(d.fixKey).toBeUndefined();
    });

    it('says when question headings have their answers hidden', () => {
      const d = detail(
        makePage({
          questionAnswers: [{ question: 'A?', answer: '' }, { question: 'B?', answer: '' }],
          faqAnswersHidden: 2,
        }),
        'criterion_definitions'
      );
      expect(keys(d)).toEqual([
        'ev_definitions_sentences_none',
        'ev_definitions_answers',
        'ev_definitions_answers_hidden',
        'ev_definitions_total',
        'ev_definitions_structured',
      ]);
      expect(line(d, 'ev_definitions_answers_hidden').params).toEqual({ count: 2 });
      expect(d.fixKey).toBe('fix_definitions_hidden');
    });

    it('reports empty question headings and the no-question case', () => {
      const empty = detail(makePage({ questionAnswers: [{ question: 'A?', answer: ' ' }] }), 'criterion_definitions');
      expect(line(empty, 'ev_definitions_answers_empty').params).toEqual({ count: 1 });
      expect(keys(detail(makePage(), 'criterion_definitions'))).toContain('ev_definitions_no_questions');
    });

    it('points to the step-form share once enough answers exist', () => {
      const d = detail(
        makePage({
          paragraphs: [
            'Ein Smart Meter ist ein digitaler Stromzähler.',
            'Die Grundversorgung bezeichnet die Belieferung durch den Netzbetreiber.',
            'Netzstabilität ist die Fähigkeit, Last und Erzeugung auszugleichen.',
          ],
        }),
        'criterion_definitions'
      );
      expect(line(d, 'ev_definitions_total').params).toEqual({ count: 3, target: 3 });
      expect(d.fixKey).toBe('fix_definitions_structured');
    });
  });

  describe('lists', () => {
    it('describes the lists found', () => {
      const d = detail(makePage({ lists: [list(3), { type: 'ol', itemCount: 2, items: ['Antrag stellen', 'Warten'] }] }), 'criterion_lists');
      expect(line(d, 'ev_lists_found').params).toEqual({ count: 2, ul: 1, ol: 1, items: 5, target: 3 });
      expect(line(d, 'ev_lists_examples').params).toEqual({ examples: '"Item 0", "Antrag stellen"' });
    });

    it('reports missing lists', () => {
      expect(keys(detail(makePage(), 'criterion_lists'))).toEqual(['ev_lists_none']);
    });
  });

  describe('sections', () => {
    it('explains why 3/3 subheadings still fail with too little text', () => {
      const d = detail(
        makePage({
          headings: [h(1), h(2, 'A'), h(3, 'B?'), h(3, 'C?')],
          paragraphs: ['Only one paragraph.'],
          faqAnswersHidden: 2,
        }),
        'criterion_sections'
      );
      expect(d.found).toBe(false);
      expect(line(d, 'ev_sections_count').params).toEqual({ count: 3, target: 3, examples: '"A", "B?", "C?"' });
      expect(line(d, 'ev_sections_thin_half').params).toEqual({ paragraphs: 1, min: 3 });
      expect(line(d, 'ev_sections_hidden_answers').params).toEqual({ count: 2 });
      expect(d.fixKey).toBe('fix_sections_hidden');
    });

    it('uses the thin-content fix without hidden answers', () => {
      const d = detail(makePage({ headings: [h(2), h(2), h(2)], paragraphs: ['x'] }), 'criterion_sections');
      expect(d.fixKey).toBe('fix_sections_thin');
    });

    it('confirms passing sections', () => {
      const d = detail(makePage({ headings: [h(2), h(2), h(2)], paragraphs: ['a', 'b', 'c'] }), 'criterion_sections');
      expect(keys(d)).toEqual(['ev_sections_count', 'ev_sections_paragraphs_ok']);
      expect(d.fixKey).toBeUndefined();
    });

    it('reports missing subheadings', () => {
      const d = detail(makePage({ paragraphs: ['a'] }), 'criterion_sections');
      expect(keys(d)).toEqual(['ev_sections_none', 'ev_sections_thin']);
    });
  });

  it('translates into German report text with the concrete data', () => {
    setLang('de');
    const category = analyzer.analyze(
      makePage({
        headings: [h(1), h(2, 'Woher kommt der Strom?'), h(3, 'B'), h(3, 'C')],
        paragraphs: ['Nur ein Absatz.'],
        questionAnswers: [{ question: 'Woher kommt der Strom?', answer: '' }],
        faqAnswersHidden: 1,
      })
    );
    const mapped = mapAnalysisResult(category).details;
    const all = mapped.flatMap((d) => [...(d.evidenceText ?? []), d.whyText ?? '', d.fixText ?? '']).join('\n');
    expect(all).toContain('Frage-Überschriften: 1. Direkt mit einer Aussage darunter beantwortet: 0.');
    expect(all).toContain('Fragen, deren Antwort nicht im HTML steht: 1');
    expect(all).toContain('aber zu wenige Textabsätze: 1 (nötig sind mindestens 3)');
    expect(all).toContain('Zwischenüberschriften (H2–H6): 3 (Ziel: 3), z. B. «Woher kommt der Strom?», «B», «C».');
    expect(all).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(all).not.toMatch(/\bev_/);
  });
});
