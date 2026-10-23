// Building blocks for the answerability definition patterns (see
// GEO_CONFIG.answerability.patterns.definitions). DEF_SUBJECT is the term
// being defined: one to five word-ish tokens without commas, so a clause
// like "Ob das sinnvoll ist, …" can never be the subject.
const DEF_TOKEN = String.raw`[\p{L}\p{N}][\p{L}\p{N}'’&./-]*`;
const DEF_SUBJECT = String.raw`${DEF_TOKEN}(?:\s+${DEF_TOKEN}){0,4}`;
// Sentence openers that start a clause, a question or a pronoun statement
// ("Das ist ein Problem", "It is a good idea") rather than name a term.
const notATerm = (conjunctions: string, pronounStatement?: string): string =>
  String.raw`(?!(?:${conjunctions})(?![\p{L}]))` +
  (pronounStatement ? String.raw`(?!${pronounStatement}(?![\p{L}]))` : '');
const DE_NOT_A_TERM = notATerm(
  'Ob|Wenn|Dass|Daß|Weil|Da|Obwohl|Falls|Sofern|Wie|Was|Wo|Wer|Warum|Wieso|Weshalb|Wann|Welche[rsnm]?|Und|Aber|Oder|Denn|Doch|So|Nun|Jetzt|Hier|Damit|Dabei|Deshalb|Daher|Trotzdem|Auch|Nur|Noch|Wichtig|Entscheidend',
  String.raw`(?:Das|Dies|Dieses|Diese[rs]?|Es|Er|Sie|Wir|Ich|Man)\s+(?:ist|sind|bedeutet|bezeichnet|beschreibt|umfasst|meint)`
);
const EN_NOT_A_TERM = notATerm(
  'It|This|That|These|Those|There|Here|He|She|They|We|I|You|What|Which|Who|Why|How|Where|When|Whether|If|And|But|Or|So'
);
const FR_NOT_A_TERM = notATerm("Ce|Cela|Ceci|C['’]est|Il|Elle|Ils|Elles|Si|Quand|Qu['’]est|Que|Qui|Où|Pourquoi|Comment|Et|Mais");
const ES_NOT_A_TERM = notATerm('Esto|Eso|Esta|Este|Si|Cuando|Él|Ella|Ellos|Qué|Quién|Dónde|Por|Cómo|Y|Pero');
const PT_NOT_A_TERM = notATerm('Isto|Isso|Esta|Este|Se|Quando|Ele|Ela|Eles|Que|Quem|Onde|Por|Como|E|Mas');
const IT_NOT_A_TERM = notATerm('Questo|Questa|Ciò|Se|Quando|Lui|Lei|Loro|Che|Chi|Dove|Perché|Come|E|Ma');
// Month names (DE/EN) so "1. Januar 2025" is not read as a numbered step.
const MONTH_NAMES = String.raw`(?:Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|January|February|March|May|June|July|October|December|Jan|Feb|Mär|Mar|Apr|Jun|Jul|Aug|Sept?|Okt|Oct|Nov|Dez|Dec)`;

export const GEO_CONFIG = {
  contentClarity: {
    weights: {
      h1: 1.5,
      hierarchy: 1.5,
      scanability: 2.0,
      readability: 1.0,
    },
    thresholds: {
      h1MinLength: 5, // Relaxed from 10
      h1MaxLength: 150,
      hierarchyScoreMin: 0.6,
      scanScoreMin: 0.5,
      readabilityScoreMin: 0.5, // Normalized 0-1 score; below this triggers recommendation
      h1PartialCredit: 0.5, // share of the h1 weight for an H1 that exists but is off
    },
    scoring: {
      hierarchyDeductions: {
        noH1: 0.4,
        multipleH1s: 0.1,
        lateH1: 0.2, // first H1 is not among the first 3 headings
        levelSkip: 0.2, // per jump of more than one level (H2 → H4)
        fewSubheadings: 0.1, // fewer than 2 H2/H3
      },
      // Only granted to an outline without any deduction — a bonus must
      // never paper over a missing H1 or skipped levels.
      hierarchyBonus: {
        subheadingMinCount: 4,
        bonus: 0.1,
      },
      // Without an H1 the outline has no root; the score is capped at
      // hierarchyScoreMin so the check can never pass.
      noH1Cap: 0.6,
      // Scanability = paragraph count + paragraph length + lists + heading
      // density, maxima summing to 1.0.
      scanFactors: {
        paragraphCountMany: 0.3, // ≥3 substantive paragraphs
        paragraphCountFew: 0.075, // 1–2 substantive paragraphs
        paragraphLengthGood: 0.25, // avg < paragraphLengthChars.good
        paragraphLengthOk: 0.15, // avg < .ok
        paragraphLengthMax: 0.05, // avg < .max
        listsMany: 0.25, // ≥2 lists
        listsOne: 0.15,
        headingRatioGood: 0.2,
        headingRatioOk: 0.1,
      },
      // Paragraphs shorter than this (captions, teasers, button-ish lines)
      // say nothing about how a text is chunked and are ignored for the
      // paragraph count/length factors.
      substantiveParagraphMinChars: 80,
      // Subheadings (H2/H3) per content block. Full points in the sweet spot;
      // above `max` the page is mostly headings without content (e.g. 20 FAQ
      // headings over 2 paragraphs) and the factor drops back to the ok tier
      // up to `excessive`, then to zero.
      headingRatio: {
        ok: 0.1,
        good: 0.2,
        max: 1.0,
        excessive: 2.0,
      },
      // Average paragraph length tiers (characters) used by the scanability
      // check AND by highlight-targets to mark the paragraphs that drag the
      // average up. Single source so highlights never diverge from the score.
      paragraphLengthChars: {
        good: 300,
        ok: 500,
        max: 800,
      }
    }
  },
  answerability: {
    weights: {
      definitions: 2.0,
      lists: 1.5,
      sections: 1.5,
    },
    thresholds: {
      definitionMinCount: 3,
      // A question heading counts as directly answered when the text under
      // it opens with a statement of at least this many words.
      directAnswerMinWords: 4,
      listMinCount: 3,
      sectionMinCount: 3,
      sectionMinParagraphs: 3,
      // Share of the section score kept when there are enough subheadings
      // but fewer than sectionMinParagraphs paragraphs under them.
      sectionThinContentFactor: 0.5,
    },
    patterns: {
      // Tested per SENTENCE (anchored at its start), never against a whole
      // paragraph: a bare "ist"/"is" somewhere ("Ob das sinnvoll ist, wissen
      // wir nicht") is not a definition. A definition names a term as the
      // subject and then defines it: "X ist ein …", "X bezeichnet …",
      // "Unter X versteht man …". Sentences ending in '?' are skipped by the
      // analyzer. Boundaries use (?![\p{L}]) because \b is ASCII-only and
      // breaks on umlauts/accents.
      definitions: [
        // DE: "<Begriff> ist/sind ein|eine|der|die|das …"
        new RegExp(`^${DE_NOT_A_TERM}${DEF_SUBJECT}\\s+(?:ist|sind)\\s+(?:ein|eine|einer|eines|einen|der|die|das|kein|keine)(?![\\p{L}])`, 'u'),
        // DE: "<Begriff> bezeichnet/bedeutet/beschreibt/umfasst …"
        new RegExp(`^${DE_NOT_A_TERM}${DEF_SUBJECT}\\s+(?:bezeichnet|bedeutet|beschreibt|umfasst|meint)\\s`, 'u'),
        // DE: "Unter <Begriff> versteht man …" / "Als <Begriff> bezeichnet man …"
        new RegExp(`^(?:Unter|Als)\\s+${DEF_SUBJECT}\\s+(?:versteht|bezeichnet|definiert)\\s+man(?![\\p{L}])`, 'u'),
        // DE: "… wird definiert als …" / "… ist definiert als …"
        /^[^,;:]*?(?<![\p{L}])(?:wird|werden|ist|sind)\s+(?:[\p{L}-]+\s+){0,4}?definiert\s+als(?![\p{L}])/u,
        // EN: "<Term> is/are a|an|the …", "<Term> means/refers to …"
        new RegExp(`^${EN_NOT_A_TERM}${DEF_SUBJECT}\\s+(?:(?:is|are)\\s+(?:a|an|the)|means|refers\\s+to|describes|stands\\s+for|(?:is|are)\\s+defined\\s+as)(?![\\p{L}])`, 'u'),
        // FR: "<Terme> est un|une|le|la|l' …", "<Terme> désigne/signifie …"
        new RegExp(`^${FR_NOT_A_TERM}${DEF_SUBJECT}\\s+(?:(?:est|sont)\\s+(?:un|une|des|le|la|les|l['’])|désigne|signifie|se\\s+définit\\s+comme)(?![\\p{L}])`, 'u'),
        // ES: "<Término> es un|una|el|la …", "<Término> significa/se refiere a …"
        new RegExp(`^${ES_NOT_A_TERM}${DEF_SUBJECT}\\s+(?:(?:es|son)\\s+(?:un|una|unos|unas|el|la|los|las)|significa|designa|se\\s+refiere\\s+a|se\\s+define\\s+como)(?![\\p{L}])`, 'u'),
        // PT: "<Termo> é um|uma|o|a …", "<Termo> significa/refere-se a …"
        new RegExp(`^${PT_NOT_A_TERM}${DEF_SUBJECT}\\s+(?:(?:é|são)\\s+(?:um|uma|uns|umas|o|a|os|as)|significa|designa|refere-se\\s+a|define-se\\s+como)(?![\\p{L}])`, 'u'),
        // IT: "<Termine> è un|una|il|la …", "<Termine> significa/indica …"
        new RegExp(`^${IT_NOT_A_TERM}${DEF_SUBJECT}\\s+(?:(?:è|sono)\\s+(?:un|una|uno|il|lo|la|i|gli|le|l['’])|significa|indica|si\\s+riferisce\\s+a)(?![\\p{L}])`, 'u'),
      ],
      structured: [
        // "1. Schritt …" / "2) …" — but not a date like "1. Januar 2025" or
        // a number such as "1. 000".
        new RegExp(`^\\d{1,2}[.)]\\s+(?!\\d)(?!${MONTH_NAMES}\\.?(?![\\p{L}]))`, 'mu'),
        /^[-*•]\s+/m,
        /^(?:First|Second|Third|Firstly|Secondly|Thirdly)(?![\p{L}])/iu,
        /^(?:Erstens|Zweitens|Drittens)(?![\p{L}])/iu,
      ],
    }
  },
  trustSources: {
    weights: {
      authorOrg: 2.0,
      date: 1.5,
      externalSources: 1.5,
    },
    thresholds: {
      datePartialCredit: 0.75,
      sourcePartialCredit: 0.5,
      // Source links (see utils/source-links.ts) needed for full credit
      sourceLinksTarget: 2,
    },
    patterns: {
      date: [
        /\b\d{4}\b/,
        /\d{1,2}\.\s*(?:Jan|Feb|Mär|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{4}/i,
        /\d{1,2}\/\d{1,2}\/\d{4}/,
      ],
    }
  },
  machineReadability: {
    weights: {
      schemaOrg: 2.0,
      schemaCompleteness: 1.5,
      entities: 1.5,
      semanticHtml: 1.0,
      internalLinks: 1.0,
      // Low: a 2024 proposal, no major AI provider confirms reading it.
      llmsTxt: 0.5,
      robotsTxt: 1.5,
      // Only counted when the crawler comparison ran (live analysis) — see
      // MachineReadabilityAnalyzer check 6.
      crawlerView: 2.0,
    },
    thresholds: {
      // llms-full.txt alone is worth partial credit: the long-form text is
      // there, but the llms.txt index that points crawlers at it is missing.
      llmsFullOnlyCredit: 0.5,
    },
    internalLinks: {
      minCount: 3, // contextual paths a page should offer crawlers/agents
      descriptiveRatioMin: 0.8, // share of anchors that must be descriptive
      // Generic anchor texts that tell crawlers and agents nothing
      genericAnchorPatterns: [
        /^(hier|hier klicken|click here|here|mehr|mehr erfahren|mehr dazu|read more|more|learn more|weiter|weiterlesen|link|jetzt|los)$/i,
        /^(cliquez ici|en savoir plus|lire la suite|leer más|más información|clique aqui|saiba mais|leia mais|clicca qui|scopri di più|leggi di più)$/i,
      ],
    },
    // AI crawlers checked against robots.txt. Training crawlers plus the
    // search/retrieval agents that fetch pages for live answers — blocking the
    // latter removes a site from ChatGPT/Claude/Perplexity answers directly.
    // Checked crawlers. Googlebot and Bingbot are classic search crawlers,
    // but their index is what Google AI Overviews / AI Mode and Copilot /
    // ChatGPT Search answer from.
    aiBots: [
      // Search engine indexes behind AI answers
      'Googlebot', 'Bingbot',
      // OpenAI: training, search index, user-triggered fetches
      'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
      // Anthropic
      'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
      // Perplexity
      'PerplexityBot', 'Perplexity-User',
      // Opt-out tokens for AI training (Gemini / Apple Intelligence)
      'Google-Extended', 'Applebot-Extended',
      // Meta AI, Common Crawl (feeds many LLM training sets)
      'meta-externalagent', 'CCBot',
    ] as const,
    // Weight per crawler purpose in the robots.txt score. Blocking a search
    // or on-request bot removes the page from AI answers; blocking a training
    // crawler only keeps it out of future models — a legitimate choice that
    // costs a little but still passes.
    botPurposeWeights: {
      index: 3,
      search: 3,
      user: 2,
      training: 1,
    },
    // Schema type check: distinct relevant types a page should carry. Page-type
    // rules add one expected type on top — an article page without an
    // Article-family type, or a page with a visible FAQ but no FAQPage, can
    // never reach the target, however many other types it has.
    schemaTypes: {
      target: 2,
      faqMinQuestions: 3, // visible FAQ questions before FAQPage is expected
    },
    // Required fields per Schema.org type. Used to score the completeness of
    // detected JSON-LD blocks beyond the bare @type presence. Article subtypes
    // without their own entry fall back to Article.
    schemaRequiredFields: {
      Article: ['headline', 'author', 'datePublished'],
      NewsArticle: ['headline', 'author', 'datePublished'],
      BlogPosting: ['headline', 'author', 'datePublished'],
      FAQPage: ['mainEntity'],
      HowTo: ['name', 'step'],
      Product: ['name', 'offers'],
      Organization: ['name', 'url'],
      Person: ['name'],
      BreadcrumbList: ['itemListElement'],
      WebPage: ['name'],
    } as Record<string, string[]>,
    scoring: {
      // Landmarks that give a page its machine-readable skeleton; sums to 1.0
      // so a page using all of them reaches 100%.
      semanticElements: {
        main: 0.3,
        article: 0.25,
        section: 0.15,
        header: 0.1,
        nav: 0.1,
        footer: 0.1,
      },
      // Optional landmarks: a small bonus (capped at 100%) that can make up
      // for a missing element but is never expected.
      semanticBonus: {
        aside: 0.05,
      },
      // "Clear entities" signals — what lets a machine pin the page to known
      // things in a knowledge graph. Sums to 1.0. A named author counts once,
      // whether it comes from Schema.org or a visible byline.
      entitySignals: {
        organizationNamed: 0.25, // Organization / publisher with a name
        organizationVerifiable: 0.15, // ...plus logo or sameAs
        personNamed: 0.2, // author / Person with a name
        personVerifiable: 0.1, // ...plus sameAs or url (profile page)
        linkedGraph: 0.1, // nodes connected via @id references
        topic: 0.2, // about / mentions name what the page is about
      },
    }
  },
  onPageSeo: {
    weights: {
      titleQuality: 2.0,
      metaDescription: 1.5,
      imageAlts: 1.5,
      indexability: 2.5, // Highest weight — accidental noindex is catastrophic
      socialCards: 1.0,
      viewport: 1.5,
      canonical: 1.0,
    },
    thresholds: {
      titleMinLength: 30,
      titleMaxLength: 60,
      descriptionMinLength: 120,
      descriptionMaxLength: 160,
      imageAltCoverageMin: 0.8, // 80% of images need alt
    },
  },
  aiCitation: {
    weights: {
      factStatements: 2.0,
      faqQa: 1.5,
      sourcedClaims: 1.5,
      keyInfoUpfront: 1.5,
    },
    thresholds: {
      factCountDivisor: 4,
      // Source links (utils/source-links.ts) for the sourced-claims check:
      // `sourceLinksWithNumbers` together with figures in the text, and
      // `sourceLinksMany` for the extra credit.
      sourceLinksWithNumbers: 2,
      sourceLinksMany: 4,
      // Answered FAQ questions for full / partial FAQ credit
      faqAnsweredFull: 5,
      faqAnsweredPartial: 3,
      // FAQPage/QAPage schema is a bonus on top of visible Q&A, not the only
      // way to full points — and worth nothing without visible questions,
      // since markup must describe content on the page.
      faqSchemaBonus: 0.4,
      // Paragraphs shorter than this (in words) are bylines/teasers/captions
      // and skipped when looking for the key information upfront.
      upfrontMinWords: 8,
    },
    // Note: JS \b is ASCII-only — it fails next to umlauts and accents
    // ("gemäß", "Où"). Patterns use (?<![\p{L}]) / (?![\p{L}]) with the u flag
    // instead. None of them may carry the g flag (used with .test()).
    patterns: {
      // A citable fact is a figure with context: a percentage, an amount with
      // a unit (energy, area, length, weight, volume, temperature) or currency, a grouped large number, or an attributed statement.
      // A bare year ("Copyright 2024", "Energiestrategie 2050") is not a fact.
      facts: [
        // 30 %, 30%, 4,5 Prozent, 12 percent
        /\d+(?:['’.,]\d+)*\s?(?:%|‰|Prozent|percent|per cent|pour cent|por ciento|por cento|per cento)/iu,
        // 5 TWh, 1,2 Mrd., 300 Millionen, 50 CHF, 20 €
        /\d+(?:['’.,]\d+)*\s?(?:[TGMk]Wh|[TGMk]W|CHF|Fr\.|Franken|EUR|Euro|€|\$|USD|£|Mio\.?|Mrd\.?|Millionen|Milliarden|millions?|billions?|milliards?|Tonnen|tonnes?)(?![\p{L}])/iu,
        // 36 m², 250 Quadratmeter, 12 km, 3,5 kg, 200 Liter, 21 °C, 2 Hektar
        /\d+(?:['’.,]\d+)*\s?(?:m[²³23]|km[²2]|km\/h|qm|[kcm]?m|ha|[km]?g|ml|°\s?[CF]|Quadratmetern?|Kubikmetern?|Kilometern?|Metern?|Hektar|Kilogramm|Gramm|Litern?|Grad|square (?:metres?|meters?|feet)|sq\.? ?ft|(?:kilo)?met(?:re|er)s?|lit(?:re|er)s?|mètres?(?: carrés| cubes)?|kilomètres?|metros?(?: cuadrados| quadrados| cúbicos)?|quilômetros?|kilómetros?|metri(?: quadri| cubi)?|chilometri|litros?|litri)(?![\p{L}\d])/iu,
        // CHF 50, € 20, $5
        /(?<![\p{L}])(?:CHF|Fr\.|EUR|USD|€|\$|£)\s?\d/u,
        // 1'200, 1’200, 1 200 (not phone numbers like 044 421 35 35)
        /(?<![\d.,'’])\d{1,3}(?:['’   ]\d{3})+(?!['’   ]?\d)/u,
        // gemäss BFE, laut Studie, einer Umfrage zufolge, according to
        /(?<![\p{L}])(?:laut|gemäss|gemäß|zufolge|according to|selon|según|secondo|segundo)(?![\p{L}])/iu,
      ],
      questions: [
        /^(?:Was|Wie|Wo|Wann|Warum|Wer|Welche[rsmn]?|Wieso|Weshalb|Wozu|Wofür|Woher|Wohin)(?![\p{L}])/iu,
        /^(?:What|How|Where|When|Why|Who|Which)(?![\p{L}])/iu,
        /^(?:Qu'est-ce que|Comment|Où|Quand|Pourquoi|Qui)(?![\p{L}])/iu,
        /^(?:Qué|Cómo|Dónde|Cuándo|Por qué|Quién)(?![\p{L}])/iu,
      ],
      // Used with the g flag added (see AiCitationAnalyzer) — keep the u flag,
      // and no i flag on the author-year patterns: under /iu, \p{Lu} would
      // also match lowercase letters.
      citations: [
        // (Schärli, 2023), (Bundesamt für Energie, 2024), (Müller et al., 2023a)
        /\([\p{Lu}][\p{L}\p{M}.'’&-]*(?:\s+[\p{L}\p{M}.'’&-]+){0,6},\s*\d{4}[a-z]?(?:,\s*S\.\s*\d+)?\)/u,
        // (BFE 2024), (OECD 2023)
        /\([\p{Lu}]{2,}[\p{Lu}\d-]*\s+\d{4}[a-z]?\)/u,
        // (Müller et al. 2023)
        /\([\p{Lu}][\p{L}\p{M}'’-]*\s+et\s+al\.\s+\d{4}[a-z]?\)/u,
        // [1], [2, 3]
        /\[\d+(?:,\s*\d+)*\]/u,
        // Quelle: …, Sources – …
        /(?<![\p{L}])(?:Quellen?|Sources?|Fuentes?|Fontes?)(?![\p{L}])\s*[:\-–]/iu,
      ],
    }
  }
};

export type GeoConfig = typeof GEO_CONFIG;
