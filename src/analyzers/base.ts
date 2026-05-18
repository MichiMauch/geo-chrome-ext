import { PageData, AnalysisCategory, CategoryDetail } from '../types/analysis';
import { normalizeScore } from '../utils/scoring';

export interface AnalyzerResult {
  categoryKey: string;
  score: number;
  details: CategoryDetail[];
  recommendations: string[];
}

export abstract class BaseAnalyzer {
  /**
   * The unique translation key for this category.
   */
  protected abstract readonly categoryKey: string;

  /**
   * Returns the joined text of all paragraphs.
   * Since PageData might be large, we avoid joining multiple times.
   */
  protected getFullText(pageData: PageData): string {
    // We check if the joined text is already present (added by the coordinator)
    // or join it here once. Note: To be truly efficient, the joined text
    // should be created once in the analysis coordinator.
    return (pageData as any).fullText || pageData.paragraphs.join(' ');
  }

  /**
   * Core analysis method implemented by each specific analyzer.
   */
  abstract analyze(pageData: PageData): AnalysisCategory;

  /**
   * Helper to create a standard category result object.
   */
  protected createCategory(
    score: number,
    weightedScore: number,
    totalWeight: number,
    details: CategoryDetail[],
    recommendations: string[]
  ): AnalysisCategory {
    return {
      nameKey: this.categoryKey,
      score: normalizeScore(weightedScore, totalWeight),
      maxScore: 5,
      details: details,
      recommendations: recommendations
    };
  }
}
