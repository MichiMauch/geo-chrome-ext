import { PageData, AnalysisCategory, CategoryDetail, PageType } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';

export class AnswerabilityAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_answerability';

  analyze(pageData: PageData, pageType?: PageType): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.answerability;

    // Homepages are navigation hubs — definition sentences ("X is …")
    // belong on content pages, so don't demand them here.
    const isHomepage = pageType === 'homepage';

    // Check 1: Direkte Antworten/Definitionen
    const definitionScore = this.evaluateDefinitions(pageData.paragraphs);
    const hasDefinitions = definitionScore > 0.3;
    const definitionPercent = Math.round(definitionScore * 100);

    if (isHomepage) {
      details.push(this.notApplicable('criterion_definitions'));
    } else {
      details.push({
        criterionKey: 'criterion_definitions',
        found: hasDefinitions,
        value: `${definitionPercent}%`,
        weight: config.weights.definitions,
        progress: {
          current: definitionPercent,
          target: 100,
          unitKey: 'unit_percent',
        },
      });

      weightedScore += definitionScore * config.weights.definitions;
      totalWeight += config.weights.definitions;
    }

    // Check 2: Listen & Aufzählungen
    const listCount = pageData.lists.length;
    const hasLists = listCount >= 1;
    const listScore = Math.min(1, listCount / config.thresholds.listMinCount);

    details.push({
      criterionKey: 'criterion_lists',
      found: hasLists,
      value: 'value_lists', // Now a key
      weight: config.weights.lists,
      progress: {
        current: Math.min(listCount, config.thresholds.listMinCount),
        target: config.thresholds.listMinCount,
        unitKey: 'unit_lists',
      },
    });

    weightedScore += listScore * config.weights.lists;
    totalWeight += config.weights.lists;

    // Check 3: Strukturierte Abschnitte
    // Score = share of the target subheadings reached (same ratio as the
    // progress bar), halved when there is too little body text under them.
    const subheadingCount = pageData.headings.filter((h) => h.level >= 2).length;
    const hasEnoughParagraphs = pageData.paragraphs.length >= config.thresholds.sectionMinParagraphs;
    const hasStructuredSections = subheadingCount >= config.thresholds.sectionMinCount && hasEnoughParagraphs;
    const sectionCoverage = Math.min(1, subheadingCount / config.thresholds.sectionMinCount);
    const sectionScore = hasEnoughParagraphs
      ? sectionCoverage
      : sectionCoverage * config.thresholds.sectionThinContentFactor;

    details.push({
      criterionKey: 'criterion_sections',
      found: hasStructuredSections,
      value: 'value_subheadings', // Now a key
      weight: config.weights.sections,
      progress: {
        current: Math.min(subheadingCount, config.thresholds.sectionMinCount),
        target: config.thresholds.sectionMinCount,
        unitKey: 'unit_subheadings',
      },
    });

    weightedScore += sectionScore * config.weights.sections;
    totalWeight += config.weights.sections;

    const recommendations: string[] = [];
    if (!isHomepage && !hasDefinitions) recommendations.push('no_definitions');
    if (!hasLists) recommendations.push('no_lists');
    if (!hasStructuredSections) recommendations.push('few_sections');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  private evaluateDefinitions(paragraphs: string[]): number {
    const definitionPatterns = GEO_CONFIG.answerability.patterns.definitions;
    const structuredPatterns = GEO_CONFIG.answerability.patterns.structured;

    let definitionCount = 0;
    let structuredCount = 0;

    paragraphs.forEach((p) => {
      // Definition patterns are anchored at the sentence start, so test each
      // sentence on its own. Questions ("Was ist ein Smart Meter?") ask for
      // a definition rather than give one.
      const hasDefinition = splitSentences(p).some(
        (sentence) =>
          !sentence.endsWith('?') &&
          definitionPatterns.some((pattern) => pattern.test(sentence))
      );
      if (hasDefinition) definitionCount++;

      if (structuredPatterns.some((pattern) => pattern.test(p))) structuredCount++;
    });

    const defScore = Math.min(1, definitionCount / GEO_CONFIG.answerability.thresholds.definitionMinCount);
    const structScore = Math.min(1, structuredCount / 2);

    return defScore * 0.7 + structScore * 0.3;
  }
}

// Splits after ., !, ? or … followed by whitespace. Abbreviations ("z. B.")
// over-split, which only ever yields extra non-matching fragments.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
