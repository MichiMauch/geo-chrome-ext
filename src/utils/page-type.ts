import type { PageData, PageType } from '../types/analysis';
import { schemaTypesOf } from './schema-types';

// Conservative page-type detection. Explicit author signals (Schema.org,
// og:type) beat URL heuristics; anything uncertain stays 'other' so the
// scoring behaves exactly as before detection existed. Only confident
// homepage/product/article detections may relax check expectations.

// Article and the subtypes publishers actually emit.
export const ARTICLE_SCHEMA_TYPES = [
  'Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'ScholarlyArticle', 'Report',
  'ReportageNewsArticle', 'AnalysisNewsArticle', 'OpinionNewsArticle', 'LiveBlogPosting',
];

export function detectPageType(pageData: PageData): PageType {
  // Every type of every node — a node typed ["NewsArticle", "FAQPage"] is an article
  const schemaTypes = new Set(pageData.schema.flatMap(schemaTypesOf));

  if (schemaTypes.has('Product')) return 'product';
  if (ARTICLE_SCHEMA_TYPES.some((t) => schemaTypes.has(t))) return 'article';

  const ogType = (pageData.openGraph.type || pageData.meta.ogType || '').toLowerCase();
  if (ogType === 'article') return 'article';
  if (ogType.startsWith('product')) return 'product';

  try {
    const path = new URL(pageData.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || /^\/(index|home|start)\.(html?|php)$/i.test(path)) {
      return 'homepage';
    }
  } catch {
    // unparseable URL — stay conservative
  }

  return 'other';
}
