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
    },
    scoring: {
      hierarchyDeductions: {
        skipH2: 0.4,
        skipH3: 0.2,
        tooManyH1s: 0.1,
        tooManyH2s: 0.1,
        h4OrDeeper: 0.2,
        noHeadings: 0.1,
      },
      scanFactors: {
        shortParagraphs: 0.3,
        bulletPoints: 0.15,
        boldText: 0.25,
        numberedLists: 0.15,
        shortSentences: 0.05,
        whiteSpace: 0.25,
        conclusion: 0.15,
        clearStructure: 0.2,
        optimalLength: 0.1,
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
      listMinCount: 3,
      sectionMinCount: 3,
    },
    patterns: {
      definitions: [
        /\b(ist|sind|bezeichnet|bedeutet|definiert als)\b/i,
        /\b(is|are|means|defined as|refers to)\b/i,
        /\b(est|son|significa|definido como)\b/i,
        /\b(est|sont|signifie|défini comme)\b/i,
      ],
      structured: [
        /^\d+\.\s+/m,
        /^[-*•]\s+/m,
        /^(?:First|Second|Third|Firstly|Secondly|Thirdly)\b/i,
        /^(?:\bErstens|Zweitens|Drittens)\b/i,
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
      llmsTxt: 1.5,
      robotsTxt: 1.5,
    },
    aiBots: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'] as const,
    // Required fields per Schema.org type. Used to score the completeness of
    // detected JSON-LD blocks beyond the bare @type presence.
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
      semanticElements: {
        article: 0.25,
        main: 0.25,
        section: 0.15,
        aside: 0.1,
        header: 0.1,
        footer: 0.05,
      }
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
    },
    patterns: {
      facts: [
        /(\d+(?:[\.,]\d+)?\s*%(?:[\s\s\S]*?))/,
        /\b(19|20)\d{2}\b/,
        /\b(laut|gemäss|according to|selon|según)\b\s+[^.!?]*/i,
      ],
      questions: [
        /^(?:Was|Wie|Wo|Wann|Warum|Wer|Welche|Wieso)\b/i,
        /^(?:What|How|Where|When|Why|Who|Which)\b/i,
        /^(?:Qu'est-ce que|Comment|Où|Quand|Pourquoi|Qui)\b/i,
        /^(?:Qué|Cómo|Dónde|Cuándo|Por qué|Quién)\b/i,
      ],
      citations: [
        /\(\w+,\s*\d{4}\)/,
        /\[\d+(?:,\s*\d+)*\]/,
        /\b(Quelle|Source|Fuente|Fonte)\b\s*[:\-]/i,
      ],
    }
  }
};

export type GeoConfig = typeof GEO_CONFIG;
