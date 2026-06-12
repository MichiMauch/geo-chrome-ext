import { PageData, AnalysisCategory, CategoryDetail, PageType } from '../types/analysis';
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
   * Core analysis method implemented by each specific analyzer. pageType is
   * passed to analyzers that relax expectations per page type (a homepage is
   * not scored like an article); undefined behaves like 'other'.
   */
  abstract analyze(pageData: PageData, pageType?: PageType): AnalysisCategory;

  /**
   * Detail entry for a check that doesn't apply to the detected page type
   * (e.g. author/date on a homepage). Weight 0 keeps it out of the score;
   * found=true renders it neutral instead of as a failure.
   */
  protected notApplicable(criterionKey: string): CategoryDetail {
    return {
      criterionKey,
      found: true,
      value: 'value_notApplicable',
      weight: 0,
      progress: { current: 1, target: 1, unitKey: 'unit_status' },
    };
  }

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
