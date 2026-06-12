import type { AnalysisCategory, CategoryDetail } from '../types/analysis';
import { t } from './i18n';

interface Recommendation {
  priority: number; // Higher = more important
  category: string;
  key: string; // Recommendation key (e.g. 'no_schema'), used for i18n + snippet lookup
}

const RECOMMENDATION_KEYS: Record<string, { i18nKey: string; priority: number }> = {
  // Content Clarity
  'no_h1': { i18nKey: 'rec_no_h1', priority: 10 },
  'bad_hierarchy': { i18nKey: 'rec_bad_hierarchy', priority: 8 },
  'low_scanability': { i18nKey: 'rec_low_scanability', priority: 6 },
  'low_readability': { i18nKey: 'rec_low_readability', priority: 5 },
  // Answerability
  'no_definitions': { i18nKey: 'rec_no_definitions', priority: 9 },
  'no_lists': { i18nKey: 'rec_no_lists', priority: 7 },
  'few_sections': { i18nKey: 'rec_few_sections', priority: 5 },
  // Trust & Sources
  'no_author': { i18nKey: 'rec_no_author', priority: 9 },
  'no_date': { i18nKey: 'rec_no_date', priority: 7 },
  'few_sources': { i18nKey: 'rec_few_sources', priority: 6 },
  // Machine Readability
  'no_schema': { i18nKey: 'rec_no_schema', priority: 10 },
  'schema_incomplete': { i18nKey: 'rec_schema_incomplete', priority: 9 },
  'few_entities': { i18nKey: 'rec_few_entities', priority: 5 },
  'weak_semantic_html': { i18nKey: 'rec_weak_semantic_html', priority: 4 },
  'weak_internal_links': { i18nKey: 'rec_weak_internal_links', priority: 5 },
  'no_llms_txt': { i18nKey: 'rec_no_llms_txt', priority: 8 },
  'ai_bots_blocked': { i18nKey: 'rec_ai_bots_blocked', priority: 11 },
  // AI Citation
  'no_facts': { i18nKey: 'rec_no_facts', priority: 7 },
  'no_faq': { i18nKey: 'rec_no_faq', priority: 6 },
  'no_sourced_claims': { i18nKey: 'rec_no_sourced_claims', priority: 6 },
  'no_key_info_upfront': { i18nKey: 'rec_no_key_info_upfront', priority: 5 },
  // On-Page SEO
  'page_is_noindex': { i18nKey: 'rec_page_is_noindex', priority: 12 }, // Critical: page hidden from search
  'title_missing': { i18nKey: 'rec_title_missing', priority: 11 },
  'description_missing': { i18nKey: 'rec_description_missing', priority: 10 },
  'title_too_short': { i18nKey: 'rec_title_too_short', priority: 7 },
  'title_too_long': { i18nKey: 'rec_title_too_long', priority: 7 },
  'description_too_short': { i18nKey: 'rec_description_too_short', priority: 6 },
  'description_too_long': { i18nKey: 'rec_description_too_long', priority: 6 },
  'images_missing_alts': { i18nKey: 'rec_images_missing_alts', priority: 6 },
  'canonical_mismatch': { i18nKey: 'rec_canonical_mismatch', priority: 7 }, // Wrong canonical ≈ soft deindex of this page
  'canonical_missing': { i18nKey: 'rec_canonical_missing', priority: 6 },
  'social_cards_missing': { i18nKey: 'rec_social_cards_missing', priority: 5 },
  'viewport_missing': { i18nKey: 'rec_viewport_missing', priority: 9 },
  'viewport_misconfigured': { i18nKey: 'rec_viewport_misconfigured', priority: 7 },
};

export function generateRecommendation(key: string): string | null {
  const entry = RECOMMENDATION_KEYS[key];
  return entry ? t(entry.i18nKey) : null;
}

export function getRecommendationPriority(key: string): number {
  return RECOMMENDATION_KEYS[key]?.priority || 0;
}

export function collectAllRecommendations(
  categories: Record<string, AnalysisCategory>
): string[] {
  const recommendations: Recommendation[] = [];

  Object.values(categories).forEach((category) => {
    category.recommendations.forEach((recKey) => {
      const entry = RECOMMENDATION_KEYS[recKey];
      if (entry) {
        recommendations.push({
          priority: entry.priority,
          category: category.nameKey,
          key: recKey,
        });
      }
    });
  });

  // Sort by priority (descending) and take top 5 keys.
  // We return keys (not translated text) so consumers can re-translate at render
  // time AND look up matching fix-snippets via the same key.
  return recommendations
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((r) => r.key);
}

export function generateCategoryRecommendations(
  details: CategoryDetail[],
  recommendationKeys: Record<string, string>
): string[] {
  const recs: string[] = [];

  details.forEach((detail) => {
    if (!detail.found && recommendationKeys[detail.criterionKey]) {
      const key = recommendationKeys[detail.criterionKey];
      const text = generateRecommendation(key);
      if (text) recs.push(text);
    }
  });

  return recs;
}
