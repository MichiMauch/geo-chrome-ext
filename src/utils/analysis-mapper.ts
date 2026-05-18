import { t } from '../utils/i18n';
import { AnalysisCategory, CategoryDetail } from '../types/analysis';

/**
 * Maps an analyzer's result keys to translated strings.
 * This ensures the analysis logic remains "pure" and decoupled from the UI language.
 */
export function mapAnalysisResult(category: AnalysisCategory): AnalysisCategory {
  return {
    ...category,
    nameKey: t(category.nameKey), // Translate the category name
    details: category.details.map((detail) => ({
      ...detail,
      criterionKey: t(detail.criterionKey), // Translate criterion
      value: translateDetailValue(detail), // Translate dynamic values
    })),
    recommendations: category.recommendations.map((recKey) => t(recKey)), // Translate recommendations
  };
}

function translateDetailValue(detail: CategoryDetail): string | number {
  if (typeof detail.value === 'number') return detail.value;
  if (!detail.value) return '';

  // If the value is already a formatted string (like "85%"), return it
  if (detail.value.includes('%') || /\d+/.test(detail.value)) {
    // We might still want to translate a wrapper, but usually, these are dynamic
    return detail.value;
  }

  // Otherwise, treat it as a translation key
  return t(detail.value);
}
