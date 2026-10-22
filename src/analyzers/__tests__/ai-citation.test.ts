import { describe, it, expect, afterEach } from 'vitest';
import { AiCitationAnalyzer } from '../ai-citation';
import { GEO_CONFIG } from '../../config/geo-config';
import { mapAnalysisResult } from '../../utils/analysis-mapper';
import { setLang } from '../../utils/i18n';
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
        { level: 3, text: 'Où est la centrale ?' },
      ],
      faqQuestions: ['Was kostet Strom?', 'Wie viel Strom braucht die Schweiz?'],
      paragraphs: Array(5).fill(LONG),
    });
    // 3 verschiedene Fragen (auch mit französischem Leerzeichen vor dem ?)
    expect(detail(page, 'criterion_faq')?.value).toBe('60%');
  });

  it('zählt Zwischentitel mit Fragewort, aber ohne Fragezeichen nicht als Frage', () => {
    const page = makePage({
      headings: [
        { level: 1, text: 'Unsere Agentur' },
        { level: 2, text: 'Was wir bieten' },
        { level: 2, text: 'Wie wir arbeiten' },
        { level: 2, text: 'Wer wir sind' },
      ],
      paragraphs: Array(5).fill(LONG),
    });
    expect(detail(page, 'criterion_faq')?.value).toBe('0%');
  });

  it('wertet eine beliebige "ist der"-Phrase am Anfang nicht als Definition', () => {
    const page = makePage({
      headings: [{ level: 1, text: 'Aktion im Oktober' }],
      paragraphs: ['Hier ist ein Überblick über unser Angebot im Oktober für alle Kundinnen und Kunden.'],
    });
    const ev = detail(page, 'criterion_keyInfoUpfront')?.evidence ?? [];
    expect(JSON.stringify(ev)).not.toContain('definition_ok');
  });

  it('erkennt eine echte Definition am Anfang', () => {
    const page = makePage({
      headings: [{ level: 1, text: 'Was ist ein Smart Meter?' }],
      paragraphs: ['Ein Smart Meter ist ein digitaler Stromzähler, der den Verbrauch laufend misst und übermittelt.'],
    });
    const ev = detail(page, 'criterion_keyInfoUpfront')?.evidence ?? [];
    expect(JSON.stringify(ev)).toContain('definition_ok');
  });

  it('wertet FAQPage-Schema nur mit sichtbaren Fragen als Bonus, auch in einem @type-Array', () => {
    const schemaOnly = makePage({ schema: [{ '@type': 'NewsArticle', '@types': ['NewsArticle', 'FAQPage'] }] });
    // Without visible questions the markup describes nothing: no bonus
    expect(detail(schemaOnly, 'criterion_faq')?.value).toBe('0%');

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

describe('AiCitation — Report-Belege', () => {
  afterEach(() => setLang('en'));

  const keys = (d?: { evidence?: { key: string }[] }) => (d?.evidence ?? []).map((e) => e.key);
  const intro = 'Die Schweiz steht vor zentralen energiepolitischen Fragen zur sicheren und bezahlbaren Versorgung.';
  const questions = ['Woher hat die Schweiz ihren Strom?', 'Ist Schweizer Strom klimaneutral?', 'Wie hoch ist das Risiko?'];
  // The economiesuisse situation: one intro paragraph, every FAQ answer
  // missing from the HTML, no source links, social links only.
  const hiddenFaqPage = makePage({
    headings: [{ level: 1, text: 'Stromversorgung in der Schweiz: Fragen und Antworten' }],
    paragraphs: [intro],
    faqQuestions: questions,
    faqAnswersHidden: 3,
    questionAnswers: questions.map((question) => ({ question, answer: '' })),
    meta: { ...makePage().meta, description: 'Die Schweiz steht vor zentralen energiepolitischen Fragen: Wie bleibt die Stromversorgung sicher?' },
    links: [link('https://www.linkedin.com/company/acme', '', { isNavigational: true })],
  });

  it('facts: counts paragraphs, notes hidden FAQ answers and switches the fix', () => {
    const d = detail(hiddenFaqPage, 'criterion_facts');
    expect(d?.evidence).toEqual([
      { key: 'ev_facts_counted', params: { total: 1, facts: 0, target: 4 } },
      { key: 'ev_facts_hidden_faq', params: { hidden: 3 } },
    ]);
    expect(d?.fixKey).toBe('fix_facts_hidden');
  });

  it('facts: shows the figures found', () => {
    const d = detail(makePage({ paragraphs: ['Die Schweiz verbraucht rund 56 TWh Strom pro Jahr.', 'Ohne Zahl.'] }), 'criterion_facts');
    expect(d?.evidence).toEqual([
      { key: 'ev_facts_counted', params: { total: 2, facts: 1, target: 4 } },
      { key: 'ev_facts_example', params: { text: 'Die Schweiz verbraucht rund 56 TWh Strom pro Jahr.' } },
    ]);
    expect(d?.fixKey).toBeUndefined();
    expect(keys(detail(makePage(), 'criterion_facts'))).toEqual(['ev_facts_no_paragraphs']);
  });

  it('faq: hidden answers, examples and missing schema', () => {
    const d = detail(hiddenFaqPage, 'criterion_faq');
    expect(d?.evidence).toEqual([
      { key: 'ev_faq_questions', params: { count: 3, answered: 0, full: 5 } },
      { key: 'ev_faq_hidden', params: { hidden: 3, total: 3 } },
      { key: 'ev_faq_example', params: { text: 'Woher hat die Schweiz ihren Strom?' } },
      { key: 'ev_faq_example', params: { text: 'Ist Schweizer Strom klimaneutral?' } },
      { key: 'ev_faq_schema_no' },
    ]);
    expect(d?.fixKey).toBe('fix_faq_hidden');
  });

  it('faq: answered questions with schema, no FAQ at all, schema only', () => {
    const headings = Array.from({ length: 5 }, (_, i) => ({ level: 3, text: `Frage Nummer ${i + 1}?` }));
    const full = detail(makePage({
      headings,
      questionAnswers: headings.map((h) => ({ question: h.text, answer: LONG })),
      schema: [{ '@type': 'FAQPage' }],
    }), 'criterion_faq');
    expect(full?.evidence?.[0]).toEqual({ key: 'ev_faq_questions', params: { count: 5, answered: 5, full: 5 } });
    expect(keys(full)).toContain('ev_faq_schema_yes');

    const none = detail(makePage({ headings: [{ level: 1, text: 'Energie' }] }), 'criterion_faq');
    expect(keys(none)).toEqual(['ev_faq_none', 'ev_faq_schema_no']);
    expect(none?.fixKey).toBe('fix_faq');

    const schemaOnly = detail(makePage({ headings: [{ level: 1, text: 'Energie' }], schema: [{ '@type': 'FAQPage' }] }), 'criterion_faq');
    expect(keys(schemaOnly)).toEqual(['ev_faq_schema_only']);
    expect(schemaOnly?.fixKey).toBe('fix_faq_schema_only');
  });

  it('faq: counts answers that are too short', () => {
    const qs = ['Was ist Strom?', 'Was ist Gas?'];
    const d = detail(makePage({ questionAnswers: [{ question: qs[0], answer: LONG }, { question: qs[1], answer: 'Ein Gas.' }], faqQuestions: qs }), 'criterion_faq');
    expect(d?.evidence).toContainEqual({ key: 'ev_faq_short', params: { count: 1, min: 8 } });
    expect(d?.fixKey).toBe('fix_faq_more');
  });

  it('sourcedClaims: no sources, social links explained', () => {
    const d = detail(hiddenFaqPage, 'criterion_sourcedClaims');
    expect(d?.evidence).toEqual([
      { key: 'ev_sourcedClaims_no_citations' },
      { key: 'ev_sourcedClaims_no_links' },
      { key: 'ev_sources_excluded_social', params: { count: 1, hosts: 'linkedin.com' } },
    ]);
  });

  it('sourcedClaims: citations and source links with hosts', () => {
    const d = detail(makePage({
      paragraphs: ['Der Anteil liegt bei 30 % (BFE 2024).', 'Siehe auch [1].'],
      links: [link('https://www.bfe.admin.ch/a'), link('https://www.oecd.org/b')],
    }), 'criterion_sourcedClaims');
    expect(d?.evidence).toEqual([
      { key: 'ev_sourcedClaims_citations', params: { count: 2 } },
      { key: 'ev_sourcedClaims_citation_example', params: { text: '(BFE 2024)' } },
      { key: 'ev_sourcedClaims_citation_example', params: { text: '[1]' } },
      { key: 'ev_sourcedClaims_links', params: { count: 2, hosts: 'bfe.admin.ch, oecd.org', many: 4 } },
    ]);
  });

  it('sourcedClaims: links without figures', () => {
    const d = detail(makePage({
      paragraphs: ['Ein Text ohne jede Zahl.'],
      links: [link('https://www.bfe.admin.ch/a'), link('https://www.oecd.org/b')],
    }), 'criterion_sourcedClaims');
    expect(keys(d)).toContain('ev_sourcedClaims_links_no_numbers');
  });

  it('keyInfoUpfront: lists every part as met or not met', () => {
    const d = detail(hiddenFaqPage, 'criterion_keyInfoUpfront');
    expect(keys(d)).toEqual([
      'ev_keyInfoUpfront_lead',
      'ev_keyInfoUpfront_h1_ok',
      'ev_keyInfoUpfront_short_ok',
      'ev_keyInfoUpfront_meta_ok',
      'ev_keyInfoUpfront_definition_missing',
      'ev_keyInfoUpfront_number_missing',
    ]);
    expect(d?.evidence?.[2].params).toEqual({ chars: intro.length, points: 15 });

    const good = detail(makePage({
      headings: [{ level: 1, text: 'Was ist Netto-Null?' }],
      paragraphs: ['Netto-Null ist ein Ziel, bei dem die Schweiz bis 2050 rund 45 Millionen Tonnen CO₂ weniger ausstösst.'],
    }), 'criterion_keyInfoUpfront');
    expect(keys(good)).toEqual([
      'ev_keyInfoUpfront_lead',
      'ev_keyInfoUpfront_h1_ok',
      'ev_keyInfoUpfront_short_ok',
      'ev_keyInfoUpfront_meta_missing',
      'ev_keyInfoUpfront_definition_ok',
      'ev_keyInfoUpfront_number_ok',
    ]);
    expect(keys(detail(makePage(), 'criterion_keyInfoUpfront'))).toEqual(['ev_keyInfoUpfront_no_text']);
  });

  it('no evidence for not-applicable checks on a homepage', () => {
    const result = analyze(hiddenFaqPage, 'homepage');
    expect(result.details.find((d) => d.criterionKey === 'criterion_faq')?.evidence).toBeUndefined();
    expect(result.details.find((d) => d.criterionKey === 'criterion_keyInfoUpfront')?.evidence).toBeUndefined();
  });

  it('translates the economiesuisse case into concrete German text', () => {
    setLang('de');
    const mapped = mapAnalysisResult(analyze(hiddenFaqPage));
    const all = mapped.details.flatMap((d) => [...(d.evidenceText ?? []), d.whyText ?? '', d.fixText ?? '']).join('\n');
    expect(all).not.toMatch(/\{\w+\}/);
    const [facts, faq, sourced, upfront] = mapped.details;
    expect(facts.evidenceText).toContain('FAQ-Antworten, die nicht im HTML stehen: 3. Sie konnten nicht geprüft werden. Stehen dort Zahlen, sehen KI-Systeme sie ebenfalls nicht.');
    expect(facts.fixText).toContain('per CSS zugeklappt');
    expect(faq.evidenceText?.[1]).toContain('Bei 3 von 3 Fragen fehlt die Antwort im HTML');
    expect(faq.evidenceText).toContain('Beispiel: «Woher hat die Schweiz ihren Strom?»');
    expect(faq.fixText).toContain('Akkordeon');
    expect(sourced.evidenceText?.join(' ')).toContain('linkedin.com');
    expect(upfront.evidenceText).toContain('Nicht erfüllt (30 %): Am Anfang steht keine Kernaussage in der Form «X ist …» oder «X bedeutet …».');
  });
});
