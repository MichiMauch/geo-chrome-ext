import { hasTranslation, t } from '../utils/i18n';
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
      ...translateReportTexts(detail),
    })),
    recommendations: category.recommendations.map((recKey) => t(recKey)), // Translate recommendations
  };
}

function translateDetailValue(detail: CategoryDetail): string | number {
  if (typeof detail.value === 'number') return detail.value;
  if (!detail.value) return '';

  // Already formatted text ("85%", "52 chars") passes through. Deciding by
  // "contains a digit" misread keys like value_h1Optimal as text.
  if (!hasTranslation(detail.value)) return detail.value;

  // Otherwise it is a translation key. Value templates such as
  // "{current}/{target} lists" mostly restate the progress bar, so progress
  // fills {current}/{target} for every analyzer; explicit valueParams (types,
  // dates, missing tags) come on top and win.
  return t(detail.value, valueParamsOf(detail));
}

export function valueParamsOf(detail: CategoryDetail): Record<string, string | number> | undefined {
  const fromProgress = detail.progress
    ? { current: detail.progress.current, target: detail.progress.target }
    : undefined;
  if (!fromProgress && !detail.valueParams) return undefined;
  return { ...fromProgress, ...detail.valueParams };
}

// Report texts: the evidence lines the analyzer collected, plus why the
// criterion matters and how to fix it (the fix only while it isn't met).
// Keys without a translation are skipped, so a missing text never shows up
// as a raw key in the report.
function translateReportTexts(
  detail: CategoryDetail
): Pick<CategoryDetail, 'evidenceText' | 'whyText' | 'fixText'> {
  const id = detail.criterionKey.replace(/^criterion_/, '');
  const evidenceText = (detail.evidence ?? [])
    .filter((line) => hasTranslation(line.key))
    .map((line) => t(line.key, line.params));
  const whyKey = `why_${id}`;
  const fixKey = detail.fixKey ?? `fix_${id}`;
  // A full progress bar doesn't mean the check passed: sections can reach
  // 3/3 subheadings and still fail for lack of text under them.
  const met = detail.found && (!detail.progress || detail.progress.current >= detail.progress.target);
  return {
    ...(evidenceText.length > 0 ? { evidenceText } : {}),
    ...(hasTranslation(whyKey) ? { whyText: t(whyKey) } : {}),
    ...(!met && hasTranslation(fixKey) ? { fixText: t(fixKey) } : {}),
  };
}
