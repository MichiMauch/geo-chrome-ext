import { PageData, AnalysisCategory, CategoryDetail } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';

export class AnswerabilityAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_answerability';

  analyze(pageData: PageData): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.answerability;

    // Check 1: Direkte Antworten/Definitionen
    const definitionScore = this.evaluateDefinitions(pageData.paragraphs);
    const hasDefinitions = definitionScore > 0.3;
    const definitionPercent = Math.round(definitionScore * 100);

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
    const subheadingCount = pageData.headings.filter((h) => h.level >= 2).length;
    const hasStructuredSections = subheadingCount >= config.thresholds.sectionMinCount && pageData.paragraphs.length >= 3;

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

    if (hasStructuredSections) {
      weightedScore += config.weights.sections;
    } else if (subheadingCount >= 1) {
      weightedScore += 0.5;
    }
    totalWeight += config.weights.sections;

    const recommendations: string[] = [];
    if (!hasDefinitions) recommendations.push('no_definitions');
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
      for (const pattern of definitionPatterns) {
        if (pattern.test(p)) {
          definitionCount++;
          break;
        }
      }
      for (const pattern of structuredPatterns) {
        if (pattern.test(p)) {
          structuredCount++;
          break;
        }
      }
    });

    const defScore = Math.min(1, definitionCount / GEO_CONFIG.answerability.thresholds.definitionMinCount);
    const structScore = Math.min(1, structuredCount / 2);

    return defScore * 0.7 + structScore * 0.3;
  }
}
