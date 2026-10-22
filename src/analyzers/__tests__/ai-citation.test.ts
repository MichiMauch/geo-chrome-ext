import { describe, it, expect } from 'vitest';
import { AiCitationAnalyzer } from '../ai-citation';
import { GEO_CONFIG } from '../../config/geo-config';
import { mapAnalysisResult } from '../../utils/analysis-mapper';
import { collectAllRecommendations } from '../../utils/recommendations';
import { getFixSnippet } from '../../utils/fix-snippets';
import type { LinkData, PageData, PageType } from '../../types/analysis';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://www.example.ch/faq',
    headings: [{ level: 1, text: 'Energie-FAQ' }],
    paragraphs: [],
    lists: [],
    links: [],
    meta: { title: 'Energie-FAQ', description: '', author: '', publishDate: null, modifiedDate: null, ogType: null },
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
    viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: 'width=device-width, initial-scale=1' },
    canonical: { href: 'https://www.example.ch/faq' },
    ...overrides,
  };
}

function analyze(page: PageData, pageType: PageType = 'other') {
  return new AiCitationAnalyzer().analyze(page, pageType);
}

function detail(page: PageData, key: string, pageType: PageType = 'other') {
  return analyze(page, pageType).details.find((d) => d.criterionKey === key);
}

const LONG = 'Diese Antwort erklärt den Sachverhalt in mehreren vollständigen Sätzen für die Leserschaft.';

function link(href: string, text = 'Studie', extra: Partial<LinkData> = {}): LinkData {
  return { href, text, isExternal: true, ...extra };
}

const isFact = (text: string) => GEO_CONFIG.aiCitation.patterns.facts.some((p) => p.test(text));

describe('AiCitation — Fakten-Muster', () => {
  it.each([
    'Der Anteil liegt bei 30 % der Haushalte.',
    'Der Anteil liegt bei 30% der Haushalte.',
    'Der Anteil liegt bei 4,5 Prozent.',
    'Die Schweiz verbraucht rund 56 TWh Strom pro Jahr.',
    'Das Kraftwerk leistet 1,2 GW.',
    'Die Kosten betragen 1,5 Mrd. Franken.',
    'Die Kosten betragen 300 Millionen.',
    'Die Abgabe kostet CHF 50 pro Jahr.',
    'Der Preis liegt bei 20 € pro Monat.',
    'Es profitieren 1\'200 Betriebe.',
    'Es profitieren 1 200 Betriebe.',
    'Gemäss BFE sinkt der Verbrauch.',
    'Gemäß BFE sinkt der Verbrauch.',
    'Einer Umfrage zufolge sinkt der Verbrauch.',
    'According to the report, demand fell.',
  ])('erkennt "%s"', (text) => {
    expect(isFact(text)).toBe(true);
  });

  it.each([
    'Copyright 2024 economiesuisse',
    'Die Energiestrategie 2050 des Bundes.',
    'Telefon 044 421 35 35',
    'Kontaktieren Sie uns jederzeit.',
  ])('wertet "%s" nicht als Fakt', (text) => {
    expect(isFact(text)).toBe(false);
  });

  it('zählt Absätze mit deutschen Einheiten als zitierbare Fakten', () => {
    const page = makePage({
      paragraphs: [
        'Die Schweiz verbraucht rund 56 TWh Strom pro Jahr.',
        'Der Anteil erneuerbarer Energie liegt bei 30 %.',
        'Gemäss BFE sinkt der Verbrauch pro Kopf.',
        'Die Netzkosten betragen 1,5 Mrd. Franken.',
      ],
    });
    const d = detail(page, 'criterion_facts');
    expect(d?.found).toBe(true);
    expect(d?.value).toBe('100%');
  });

  it('gibt für reine Jahreszahlen keine Fakten-Punkte', () => {
    const page = makePage({
      paragraphs: ['Copyright 2024 economiesuisse', 'Die Energiestrategie 2050 des Bundes.'],
    });
    const d = detail(page, 'criterion_facts');
    expect(d?.found).toBe(false);
    expect(d?.value).toBe('0%');
    expect(analyze(page).recommendations).toContain('no_facts');
  });
});

describe('AiCitation — Zitat-Muster', () => {
  const citationCount = (text: string) =>
    GEO_CONFIG.aiCitation.patterns.citations.filter((p) => p.test(text)).length;

  it.each([
    '(Bundesamt für Energie, 2024)',
    '(Schärli, 2023)',
    '(BFE 2024)',
    '(Müller et al. 2023)',
    '[1]',
    'Quelle: BFE',
  ])('erkennt %s genau einmal', (text) => {
    expect(citationCount(text)).toBe(1);
  });

  it.each(['(Energiestrategie 2050)', '(2024)', '(siehe unten)'])('ignoriert %s', (text) => {
    expect(citationCount(text)).toBe(0);
  });
});

describe('AiCitation — belegte Aussagen', () => {
  const facts = [
    'Die Schweiz verbraucht rund 56 TWh Strom pro Jahr.',
    'Der Anteil erneuerbarer Energie liegt bei 30 %.',
  ];

  it('gibt Social-, Share- und Navigationslinks keine Quellen-Punkte', () => {
    const page = makePage({
      paragraphs: facts,
      links: [
        link('https://www.facebook.com/economiesuisse', 'Facebook'),
        link('https://x.com/economiesuisse', 'X'),
        link('https://www.linkedin.com/sharing/share-offsite/?url=x', 'Teilen'),
        link('https://www.youtube.com/@economiesuisse', 'YouTube'),
        link('https://www.admin.ch/', 'Bund', { isNavigational: true }),
        link('https://www.bfe.admin.ch/studie', ''),
      ],
    });
    const d = detail(page, 'criterion_sourcedClaims');
    expect(d?.value).toBe('0%');
    expect(d?.found).toBe(false);
    expect(analyze(page).recommendations).toContain('no_sourced_claims');
  });

  it('wertet echte Quellenlinks zusammen mit Zahlen', () => {
    const page = makePage({
      paragraphs: facts,
      links: [
        link('https://www.bfe.admin.ch/studie-1', 'BFE-Studie'),
        link('https://www.bfs.admin.ch/statistik', 'BFS-Statistik'),
        link('https://www.iea.org/report', 'IEA-Report'),
        link('https://www.elcom.admin.ch/bericht', 'ElCom-Bericht'),
      ],
    });
    expect(detail(page, 'criterion_sourcedClaims')?.value).toBe('50%');
  });

  it('zählt Zitate mit Umlauten und Mehrwort-Namen', () => {
    const page = makePage({
      paragraphs: [
        'Der Verbrauch sinkt (Bundesamt für Energie, 2024).',
        'Die Kosten steigen (Schärli, 2023).',
        'Die Netze werden ausgebaut (BFE 2024).',
        'Die Preise schwanken [1].',
      ],
    });
    expect(detail(page, 'criterion_sourcedClaims')?.value).toBe('50%');
  });
});

describe('AiCitation — FAQ', () => {
  const questions = Array.from({ length: 6 }, (_, i) => `Frage Nummer ${i + 1} zur Energie?`);

  it('meldet Antworten, die im HTML fehlen, und gibt dafür keine Punkte', () => {
    const many = Array.from({ length: 60 }, (_, i) => `Wie funktioniert Punkt ${i + 1}?`);
    const page = makePage({
      faqQuestions: many,
      faqAnswersHidden: 60,
      paragraphs: Array(10).fill(LONG),
    });
    const result = analyze(page);
    const d = result.details.find((x) => x.criterionKey === 'criterion_faq');
    expect(d?.found).toBe(false);
    expect(d?.value).toBe('value_faqAnswersHidden');
    expect(d?.valueParams).toEqual({ hidden: '60', total: '60' });
    expect(d?.progress?.current).toBe(0);
    expect(result.recommendations).toContain('faq_answers_hidden');
    expect(result.recommendations).not.toContain('no_faq');

    // Wert, Empfehlung und Fix-Hinweis kommen übersetzt in der UI an
    const mapped = mapAnalysisResult(result).details.find((x) => x.valueParams?.hidden);
    expect(String(mapped?.value)).toContain('60');
    expect(String(mapped?.value)).not.toContain('{hidden}');
    expect(collectAllRecommendations({ aiCitation: result })).toContain('faq_answers_hidden');
    expect(getFixSnippet('faq_answers_hidden')?.type).toBe('no-snippet');
  });

  it('rechnet sichtbare Antworten an, wenn nur ein Teil versteckt ist', () => {
    const page = makePage({
      faqQuestions: Array.from({ length: 10 }, (_, i) => `Wann gilt Regel ${i + 1}?`),
      faqAnswersHidden: 7,
      paragraphs: Array(10).fill(LONG),
    });
    const result = analyze(page);
    const d = result.details.find((x) => x.criterionKey === 'criterion_faq');
    expect(d?.found).toBe(true);
    expect(d?.progress?.current).toBe(60);
    expect(d?.valueParams).toEqual({ hidden: '7', total: '10' });
    expect(result.recommendations).toContain('faq_answers_hidden');
  });

  it('erreicht volle Punkte mit vielen beantworteten Fragen auch ohne FAQPage-Schema', () => {
    const page = makePage({ faqQuestions: questions, paragraphs: Array(6).fill(LONG) });
    const d = detail(page, 'criterion_faq');
    expect(d?.value).toBe('100%');
    expect(d?.found).toBe(true);
  });

  it('verlangt Antwortinhalt — Fragen ohne Text geben keine Punkte', () => {
    const page = makePage({ faqQuestions: questions, paragraphs: [] });
    const d = detail(page, 'criterion_faq');
    expect(d?.value).toBe('0%');
    expect(analyze(page).recommendations).toContain('no_faq');
  });

  it('zählt Fragen-Überschriften und erkannte Fragen nur einmal', () => {
    const page = makePage({
      headings: [
        { level: 1, text: 'Energie-FAQ' },
        { level: 3, text: 'Was kostet Strom?' },
        { level: 3, text: 'Wie viel Strom braucht die Schweiz?' },
        { level: 3, text: 'Où est la centrale' },
      ],
      faqQuestions: ['Was kostet Strom?', 'Wie viel Strom braucht die Schweiz?'],
      paragraphs: Array(5).fill(LONG),
    });
    // 3 verschiedene Fragen (Où wird trotz Akzent als Frage erkannt)
    expect(detail(page, 'criterion_faq')?.value).toBe('60%');
  });

  it('wertet FAQPage-Schema als Bonus, auch in einem @type-Array', () => {
    const schemaOnly = makePage({ schema: [{ '@type': 'NewsArticle', '@types': ['NewsArticle', 'FAQPage'] }] });
    expect(detail(schemaOnly, 'criterion_faq')?.value).toBe('40%');

    const withQuestions = makePage({
      schema: [{ '@type': 'FAQPage' }],
      faqQuestions: questions.slice(0, 3),
      paragraphs: Array(3).fill(LONG),
    });
    expect(detail(withQuestions, 'criterion_faq')?.value).toBe('100%');
  });

  it('ist auf der Startseite nicht relevant', () => {
    const page = makePage({ faqQuestions: questions, faqAnswersHidden: 6 });
    const result = analyze(page, 'homepage');
    expect(result.details.find((d) => d.criterionKey === 'criterion_faq')?.value).toBe('value_notApplicable');
    expect(result.recommendations).not.toContain('faq_answers_hidden');
    expect(result.recommendations).not.toContain('no_faq');
  });
});

describe('AiCitation — Kerninformation am Anfang', () => {
  const definition = 'Die Energiestrategie 2050 ist ein Massnahmenpaket des Bundes für die Energiewende.';

  it('erkennt eine Definition und überspringt H1-Wiederholung, Byline und Teaser', () => {
    const page = makePage({
      headings: [{ level: 1, text: 'Energiestrategie 2050' }],
      paragraphs: ['Energiestrategie 2050', 'Von Max Muster', 'Lesezeit 3 Minuten', definition],
    });
    // Definition 0.3 + H1 0.2 + kurzer erster Absatz 0.15 (die Jahreszahl ist kein Fakt)
    expect(detail(page, 'criterion_keyInfoUpfront')?.value).toBe('65%');
  });

  it('wertet ein beliebiges "ist" oder "es" nicht als Definition', () => {
    const page = makePage({
      headings: [{ level: 1, text: 'Energiestrategie 2050' }],
      paragraphs: ['Das Wetter ist heute schön und es regnet nicht mehr so viel wie gestern.'],
    });
    expect(detail(page, 'criterion_keyInfoUpfront')?.value).toBe('35%');
  });

  it('erkennt "versteht man" als Definition', () => {
    const page = makePage({ paragraphs: ['Unter Netzzuschlag versteht man eine Abgabe auf jede verbrauchte Kilowattstunde Strom.'] });
    // Definition 0.3 + H1 0.2 + kurzer erster Absatz 0.15
    expect(detail(page, 'criterion_keyInfoUpfront')?.value).toBe('65%');
  });

  it('ist auf der Startseite nicht relevant', () => {
    const result = analyze(makePage({ paragraphs: [definition] }), 'homepage');
    expect(result.details.find((d) => d.criterionKey === 'criterion_keyInfoUpfront')?.value).toBe('value_notApplicable');
    expect(result.recommendations).not.toContain('no_key_info_upfront');
  });
});

describe('FAQ answered count from question/answer pairs', () => {
  const answer = 'Rund 60 Prozent des Stroms stammen aus Wasserkraft und etwa 30 Prozent aus Kernenergie.';
  const headings = Array.from({ length: 5 }, (_, i) => ({ level: 3, text: `Frage Nummer ${i + 1}?` }));

  it('counts only the questions that have their own answer', () => {
    // Five question headings, but only the first one has text under it. The
    // old approximation credited one answer per long paragraph anywhere on
    // the page (here: five), the pairs credit exactly one.
    const page = makePage({
      headings,
      paragraphs: Array.from({ length: 5 }, () => answer),
      questionAnswers: headings.map((h, i) => ({ question: h.text, answer: i === 0 ? answer : '' })),
    });
    expect(detail(page, 'criterion_faq')?.progress?.current).toBe(30);
  });

  it('reaches full points when every question is answered', () => {
    const page = makePage({
      headings,
      questionAnswers: headings.map((h) => ({ question: h.text, answer })),
    });
    expect(detail(page, 'criterion_faq')?.progress?.current).toBe(100);
  });
});
