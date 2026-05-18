import { PageData, AnalysisCategory, CategoryDetail } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';

export class AiCitationAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_aiCitation';

  analyze(pageData: PageData): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.aiCitation;

    // Check 1: Citable fact statements
    const factScore = this.evaluateFactStatements(pageData.paragraphs);
    const hasFacts = factScore > 0.3;
    const factPercent = Math.round(factScore * 100);

    details.push({
      criterionKey: 'criterion_facts',
      found: hasFacts,
      value: `${factPercent}%`,
      weight: config.weights.factStatements,
      progress: {
        current: factPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += factScore * config.weights.factStatements;
    totalWeight += config.weights.factStatements;

    // Check 2: FAQ / Q&A sections
    const faqScore = this.evaluateFaqSections(pageData);
    const hasFaq = faqScore > 0;
    const faqPercent = Math.round(faqScore * 100);

    details.push({
      criterionKey: 'criterion_faq',
      found: hasFaq,
      value: `${faqPercent}%`,
      weight: config.weights.faqQa,
      progress: {
        current: faqPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += faqScore * config.weights.faqQa;
    totalWeight += config.weights.faqQa;

    // Check 3: Sourced claims
    const sourcedScore = this.evaluateSourcedClaims(pageData);
    const hasSourcedClaims = sourcedScore > 0.3;
    const sourcedPercent = Math.round(sourcedScore * 100);

    details.push({
      criterionKey: 'criterion_sourcedClaims',
      found: hasSourcedClaims,
      value: `${sourcedPercent}%`,
      weight: config.weights.sourcedClaims,
      progress: {
        current: sourcedPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += sourcedScore * config.weights.sourcedClaims;
    totalWeight += config.weights.sourcedClaims;

    // Check 4: Key information upfront
    const upfrontScore = this.evaluateKeyInfoUpfront(pageData);
    const hasKeyInfoUpfront = upfrontScore > 0.5;
    const upfrontPercent = Math.round(upfrontScore * 100);

    details.push({
      criterionKey: 'criterion_keyInfoUpfront',
      found: hasKeyInfoUpfront,
      value: `${upfrontPercent}%`,
      weight: config.weights.keyInfoUpfront,
      progress: {
        current: upfrontPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += upfrontScore * config.weights.keyInfoUpfront;
    totalWeight += config.weights.keyInfoUpfront;

    const recommendations: string[] = [];
    if (!hasFacts) recommendations.push('no_facts');
    if (!hasFaq) recommendations.push('no_faq');
    if (!hasSourcedClaims) recommendations.push('no_sourced_claims');
    if (!hasKeyInfoUpfront) recommendations.push('no_key_info_upfront');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  private evaluateFactStatements(paragraphs: string[]): number {
    const factPatterns = GEO_CONFIG.aiCitation.patterns.facts;

    let factCount = 0;
    paragraphs.forEach((p) => {
      for (const pattern of factPatterns) {
        if (pattern.test(p)) {
          factCount++;
          break;
        }
      }
    });

    return Math.min(1, factCount / GEO_CONFIG.aiCitation.thresholds.factCountDivisor);
  }

  private evaluateFaqSections(pageData: PageData): number {
    let score = 0;

    const hasFaqSchema = pageData.schema.some(
      (s) => s['@type'] === 'FAQPage' || s['@type'] === 'QAPage'
    );
    if (hasFaqSchema) score += 0.5;

    const questionPatterns = [
      /\?$/,
      ...GEO_CONFIG.aiCitation.patterns.questions,
      /^FAQ/i,
    ];

    const questionHeadings = pageData.headings.filter((h) =>
      questionPatterns.some((p) => p.test(h.text))
    );

    const explicitQuestions = pageData.faqQuestions?.length ?? 0;
    const questionCount = Math.max(questionHeadings.length, explicitQuestions);

    if (questionCount >= 3) score += 0.5;
    else if (questionCount >= 1) score += 0.25;

    return Math.min(1, score);
  }

  private evaluateSourcedClaims(pageData: PageData): number {
    const allText = this.getFullText(pageData);
    const citationPatterns = GEO_CONFIG.aiCitation.patterns.citations;

    let citationCount = 0;
    for (const pattern of citationPatterns) {
      const matches = allText.match(new RegExp(pattern.source, 'gi'));
      if (matches) citationCount += matches.length;
    }

    const externalLinks = pageData.links.filter((l) => l.isExternal).length;
    const hasNumbers = /\b\d+([.,]\d+)?(%|\s*(Mio|Mrd|Million|Billion))?\b/.test(allText);

    let score = Math.min(0.5, citationCount / 4);
    if (externalLinks >= 2 && hasNumbers) score += 0.3;
    if (externalLinks >= 4) score += 0.2;

    return Math.min(1, score);
  }

  private evaluateKeyInfoUpfront(pageData: PageData): number {
    const firstParagraphs = pageData.paragraphs.slice(0, 3);
    const firstText = firstParagraphs.join(' ');
    const words = firstText.split(/\s+/);
    const first150 = words.slice(0, 150).join(' ');

    if (first150.length === 0) return 0;

    let score = 0;
    const definitionPatterns = [
      /\b(ist|sind|is|are|es |c'est|son|são|è)\b/i,
      /\b(bedeutet|means|signifie|significa)\b/i,
    ];
    for (const p of definitionPatterns) {
      if (p.test(first150)) {
        score += 0.3;
        break;
      }
    }

    if (/\d+/.test(first150)) score += 0.2;

    const h1 = pageData.headings.find((h) => h.level === 1);
    if (h1 && h1.text.length >= GEO_CONFIG.contentClarity.thresholds.h1MinLength) score += 0.2;

    if (firstParagraphs.length > 0 && firstParagraphs[0].length < 500) score += 0.15;

    if (pageData.meta.description && pageData.meta.description.length > 50) score += 0.15;

    return Math.min(1, score);
  }
}
