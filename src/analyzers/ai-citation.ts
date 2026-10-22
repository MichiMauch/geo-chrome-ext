import { PageData, AnalysisCategory, CategoryDetail, PageType } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { getSourceLinks } from '../utils/source-links';
import { hasSchemaType } from '../utils/schema-types';

interface FaqEvaluation {
  score: number;
  questionCount: number;
  // Questions whose answer is not in the DOM (closed accordions etc.)
  hiddenCount: number;
}

export class AiCitationAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_aiCitation';

  analyze(pageData: PageData, pageType?: PageType): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.aiCitation;

    // A homepage is a hub, not an answer document — FAQ sections and an
    // upfront definition belong on content pages, not here.
    const isHomepage = pageType === 'homepage';

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
    const faq = this.evaluateFaqSections(pageData);
    const faqScore = faq.score;
    const hasFaq = faqScore > 0;
    const faqPercent = Math.round(faqScore * 100);
    // Answers missing from the HTML are a finding of their own: crawlers see
    // the questions but nothing to cite.
    const faqAnswersHidden = !isHomepage && faq.hiddenCount > 0;

    if (isHomepage) {
      details.push(this.notApplicable('criterion_faq'));
    } else {
      details.push({
        criterionKey: 'criterion_faq',
        found: hasFaq,
        value: faqAnswersHidden ? 'value_faqAnswersHidden' : `${faqPercent}%`,
        valueParams: faqAnswersHidden
          ? { hidden: String(faq.hiddenCount), total: String(faq.questionCount) }
          : undefined,
        weight: config.weights.faqQa,
        progress: {
          current: faqPercent,
          target: 100,
          unitKey: 'unit_percent',
        },
      });

      weightedScore += faqScore * config.weights.faqQa;
      totalWeight += config.weights.faqQa;
    }

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

    if (isHomepage) {
      details.push(this.notApplicable('criterion_keyInfoUpfront'));
    } else {
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
    }

    const recommendations: string[] = [];
    if (!hasFacts) recommendations.push('no_facts');
    if (faqAnswersHidden) recommendations.push('faq_answers_hidden');
    else if (!isHomepage && !hasFaq) recommendations.push('no_faq');
    if (!hasSourcedClaims) recommendations.push('no_sourced_claims');
    if (!isHomepage && !hasKeyInfoUpfront) recommendations.push('no_key_info_upfront');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  private isFact(text: string): boolean {
    return GEO_CONFIG.aiCitation.patterns.facts.some((p) => p.test(text));
  }

  private evaluateFactStatements(paragraphs: string[]): number {
    const factCount = paragraphs.filter((p) => this.isFact(p)).length;
    return Math.min(1, factCount / GEO_CONFIG.aiCitation.thresholds.factCountDivisor);
  }

  private evaluateFaqSections(pageData: PageData): FaqEvaluation {
    const t = GEO_CONFIG.aiCitation.thresholds;

    const hasFaqSchema = pageData.schema.some((s) => hasSchemaType(s, ['FAQPage', 'QAPage']));

    const questionPatterns = [/\?$/, ...GEO_CONFIG.aiCitation.patterns.questions];
    const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*\?$/, '');

    // Detected FAQ/accordion questions plus question-style headings, counted
    // once each (a FAQ item is often both).
    const detected = pageData.faqQuestions ?? [];
    const questions = new Set(detected.map(normalize));
    pageData.headings
      .filter((h) => questionPatterns.some((p) => p.test(h.text.trim())))
      .forEach((h) => questions.add(normalize(h.text)));
    questions.delete('');

    const questionCount = questions.size;
    const hiddenCount = Math.min(
      Math.max(0, pageData.faqAnswersHidden ?? 0),
      questionCount
    );

    // Hidden answers earn nothing. The remaining questions only count as
    // answered when the page actually carries answer text — at most one
    // answered question per substantive paragraph.
    const answerParagraphs = pageData.paragraphs.filter(
      (p) => p.trim().split(/\s+/).length >= t.upfrontMinWords
    ).length;
    const answered = Math.min(questionCount - hiddenCount, answerParagraphs);

    let score = 0;
    if (answered >= t.faqAnsweredFull) score = 1;
    else if (answered >= t.faqAnsweredPartial) score = 0.6;
    else if (answered >= 1) score = 0.3;

    if (hasFaqSchema) score += t.faqSchemaBonus;

    return { score: Math.min(1, score), questionCount, hiddenCount };
  }

  private evaluateSourcedClaims(pageData: PageData): number {
    const t = GEO_CONFIG.aiCitation.thresholds;
    const allText = this.getFullText(pageData);
    const citationPatterns = GEO_CONFIG.aiCitation.patterns.citations;

    let citationCount = 0;
    for (const pattern of citationPatterns) {
      // Keep the pattern's own flags (u for \p{…}); only add g to count.
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      const matches = allText.match(new RegExp(pattern.source, flags));
      if (matches) citationCount += matches.length;
    }

    // Same filter as TrustSources: no social/share/nav links, no tel:/mailto:
    const sourceLinks = getSourceLinks(pageData.links).length;
    const hasNumbers = pageData.paragraphs.some((p) => this.isFact(p));

    let score = Math.min(0.5, citationCount / 4);
    if (sourceLinks >= t.sourceLinksWithNumbers && hasNumbers) score += 0.3;
    if (sourceLinks >= t.sourceLinksMany) score += 0.2;

    return Math.min(1, score);
  }

  // The first paragraphs a reader (and an AI) actually reads: skips a
  // repeated H1 and short bylines, teasers or captions above the text.
  private leadParagraphs(pageData: PageData): string[] {
    const minWords = GEO_CONFIG.aiCitation.thresholds.upfrontMinWords;
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const h1 = pageData.headings.find((h) => h.level === 1);
    const h1Text = h1 ? norm(h1.text) : '';

    const lead = pageData.paragraphs.filter((p) => {
      const text = norm(p);
      if (text.length === 0) return false;
      if (h1Text && (text === h1Text || (h1Text.includes(text) && text.length < h1Text.length + 20))) {
        return false;
      }
      return text.split(' ').length >= minWords;
    });

    return (lead.length > 0 ? lead : pageData.paragraphs).slice(0, 3);
  }

  private evaluateKeyInfoUpfront(pageData: PageData): number {
    const firstParagraphs = this.leadParagraphs(pageData);
    const firstText = firstParagraphs.join(' ');
    const words = firstText.split(/\s+/).filter(Boolean);
    const first150 = words.slice(0, 150).join(' ');

    if (first150.length === 0) return 0;

    let score = 0;
    if (GEO_CONFIG.aiCitation.patterns.definitions.some((p) => p.test(first150))) {
      score += 0.3;
    }

    if (this.isFact(first150)) score += 0.2;

    const h1 = pageData.headings.find((h) => h.level === 1);
    if (h1 && h1.text.length >= GEO_CONFIG.contentClarity.thresholds.h1MinLength) score += 0.2;

    if (firstParagraphs.length > 0 && firstParagraphs[0].length < 500) score += 0.15;

    if (pageData.meta.description && pageData.meta.description.length > 50) score += 0.15;

    return Math.min(1, score);
  }
}
