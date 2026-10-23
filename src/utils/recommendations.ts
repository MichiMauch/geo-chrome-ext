import type { AnalysisCategory, CategoryDetail } from '../types/analysis';
import { t } from './i18n';

interface Recommendation {
  priority: number; // Higher = more important
  category: string;
  key: string; // Recommendation key (e.g. 'no_schema'), used for i18n + snippet lookup
}

// Who fixes it: the editorial team in the CMS, or the web agency /
// development in the template, server or configuration.
export type RecommendationOwner = 'editorial' | 'dev';
// Rough effort for one page (editorial) or once for the site (dev):
// quick ≈ a quarter of an hour, medium ≈ an hour or two, project = days.
export type RecommendationEffort = 'quick' | 'medium' | 'project';

interface RecommendationEntry {
  i18nKey: string;
  priority: number;
  owner: RecommendationOwner;
  effort: RecommendationEffort;
}

const RECOMMENDATION_KEYS: Record<string, RecommendationEntry> = {
  // Content Clarity
  'no_h1': { i18nKey: 'rec_no_h1', priority: 10, owner: 'editorial', effort: 'quick' },
  'bad_hierarchy': { i18nKey: 'rec_bad_hierarchy', priority: 8, owner: 'editorial', effort: 'quick' },
  'low_scanability': { i18nKey: 'rec_low_scanability', priority: 6, owner: 'editorial', effort: 'medium' },
  'low_readability': { i18nKey: 'rec_low_readability', priority: 5, owner: 'editorial', effort: 'medium' },
  // Answerability
  'no_definitions': { i18nKey: 'rec_no_definitions', priority: 9, owner: 'editorial', effort: 'quick' },
  'no_lists': { i18nKey: 'rec_no_lists', priority: 7, owner: 'editorial', effort: 'medium' },
  'few_sections': { i18nKey: 'rec_few_sections', priority: 5, owner: 'editorial', effort: 'medium' },
  // Trust & Sources
  'no_author': { i18nKey: 'rec_no_author', priority: 9, owner: 'editorial', effort: 'quick' },
  'no_date': { i18nKey: 'rec_no_date', priority: 7, owner: 'editorial', effort: 'quick' },
  'date_not_visible': { i18nKey: 'rec_date_not_visible', priority: 3, owner: 'dev', effort: 'medium' },
  'publisher_unclear': { i18nKey: 'rec_publisher_unclear', priority: 5, owner: 'dev', effort: 'medium' },
  'few_sources': { i18nKey: 'rec_few_sources', priority: 6, owner: 'editorial', effort: 'medium' },
  // Machine Readability
  'no_schema': { i18nKey: 'rec_no_schema', priority: 10, owner: 'dev', effort: 'medium' },
  'no_faq_schema': { i18nKey: 'rec_no_faq_schema', priority: 9, owner: 'dev', effort: 'medium' },
  'schema_incomplete': { i18nKey: 'rec_schema_incomplete', priority: 9, owner: 'dev', effort: 'medium' },
  'few_entities': { i18nKey: 'rec_few_entities', priority: 5, owner: 'dev', effort: 'medium' },
  'weak_semantic_html': { i18nKey: 'rec_weak_semantic_html', priority: 4, owner: 'dev', effort: 'project' },
  'weak_internal_links': { i18nKey: 'rec_weak_internal_links', priority: 5, owner: 'editorial', effort: 'medium' },
  'no_llms_txt': { i18nKey: 'rec_no_llms_txt', priority: 8, owner: 'dev', effort: 'medium' },
  'ai_bots_blocked': { i18nKey: 'rec_ai_bots_blocked', priority: 11, owner: 'dev', effort: 'quick' },
  'ai_bots_firewall': { i18nKey: 'rec_ai_bots_firewall', priority: 10, owner: 'dev', effort: 'quick' },
  'content_signal_opt_out': { i18nKey: 'rec_content_signal_opt_out', priority: 8, owner: 'dev', effort: 'quick' },
  'js_only_content': { i18nKey: 'rec_js_only_content', priority: 11, owner: 'dev', effort: 'project' }, // Crawlers get (almost) nothing
  'no_sitemap': { i18nKey: 'rec_no_sitemap', priority: 6, owner: 'dev', effort: 'medium' },
  'sitemap_page_missing': { i18nKey: 'rec_sitemap_page_missing', priority: 5, owner: 'dev', effort: 'quick' },
  'sitemap_lastmod': { i18nKey: 'rec_sitemap_lastmod', priority: 3, owner: 'dev', effort: 'medium' },
  'sitemap_not_in_robots': { i18nKey: 'rec_sitemap_not_in_robots', priority: 2, owner: 'dev', effort: 'quick' },
  // AI Citation
  'no_facts': { i18nKey: 'rec_no_facts', priority: 7, owner: 'editorial', effort: 'medium' },
  'no_faq': { i18nKey: 'rec_no_faq', priority: 6, owner: 'editorial', effort: 'medium' },
  'faq_answers_hidden': { i18nKey: 'rec_faq_answers_hidden', priority: 8, owner: 'dev', effort: 'project' },
  'no_sourced_claims': { i18nKey: 'rec_no_sourced_claims', priority: 6, owner: 'editorial', effort: 'medium' },
  'no_key_info_upfront': { i18nKey: 'rec_no_key_info_upfront', priority: 5, owner: 'editorial', effort: 'quick' },
  // On-Page SEO
  'page_is_noindex': { i18nKey: 'rec_page_is_noindex', priority: 12, owner: 'dev', effort: 'quick' }, // Critical: page hidden from search
  'snippet_restricted': { i18nKey: 'rec_snippet_restricted', priority: 9, owner: 'dev', effort: 'quick' }, // Indexed, but not quotable
  'title_missing': { i18nKey: 'rec_title_missing', priority: 11, owner: 'editorial', effort: 'quick' },
  'description_missing': { i18nKey: 'rec_description_missing', priority: 10, owner: 'editorial', effort: 'quick' },
  'title_too_short': { i18nKey: 'rec_title_too_short', priority: 7, owner: 'editorial', effort: 'quick' },
  'title_too_long': { i18nKey: 'rec_title_too_long', priority: 7, owner: 'editorial', effort: 'quick' },
  'description_too_short': { i18nKey: 'rec_description_too_short', priority: 6, owner: 'editorial', effort: 'quick' },
  'description_too_long': { i18nKey: 'rec_description_too_long', priority: 6, owner: 'editorial', effort: 'quick' },
  'images_missing_alts': { i18nKey: 'rec_images_missing_alts', priority: 6, owner: 'editorial', effort: 'quick' },
  'canonical_mismatch': { i18nKey: 'rec_canonical_mismatch', priority: 7, owner: 'dev', effort: 'medium' }, // Wrong canonical ≈ soft deindex of this page
  'canonical_missing': { i18nKey: 'rec_canonical_missing', priority: 6, owner: 'dev', effort: 'medium' },
  'hreflang_missing': { i18nKey: 'rec_hreflang_missing', priority: 5, owner: 'dev', effort: 'medium' },
  'hreflang_incomplete': { i18nKey: 'rec_hreflang_incomplete', priority: 3, owner: 'dev', effort: 'medium' },
  'social_cards_missing': { i18nKey: 'rec_social_cards_missing', priority: 5, owner: 'dev', effort: 'medium' },
  'viewport_missing': { i18nKey: 'rec_viewport_missing', priority: 9, owner: 'dev', effort: 'quick' },
  'viewport_misconfigured': { i18nKey: 'rec_viewport_misconfigured', priority: 7, owner: 'dev', effort: 'quick' },
};

/** Owner and effort of a recommendation, for the panel tags and report groups. */
export function recommendationMeta(key: string): { owner: RecommendationOwner; effort: RecommendationEffort } | null {
  const entry = RECOMMENDATION_KEYS[key];
  return entry ? { owner: entry.owner, effort: entry.effort } : null;
}

export function generateRecommendation(key: string): string | null {
  const entry = RECOMMENDATION_KEYS[key];
  return entry ? t(entry.i18nKey) : null;
}

export function getRecommendationPriority(key: string): number {
  return RECOMMENDATION_KEYS[key]?.priority || 0;
}

// Recommendations shown before the "+ N more" fold
export const VISIBLE_RECOMMENDATIONS = 5;

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

  // All keys, sorted by priority (descending). Panel and report show the
  // first VISIBLE_RECOMMENDATIONS and fold the rest behind "+ N more", so a
  // low-priority finding is never silently dropped.
  // We return keys (not translated text) so consumers can re-translate at render
  // time AND look up matching fix-snippets via the same key.
  return recommendations
    .sort((a, b) => b.priority - a.priority)
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
