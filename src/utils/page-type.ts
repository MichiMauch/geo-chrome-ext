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

// Language roots of multilingual sites (/de, /fr-ch/, /en/index.html) are
// homepages too. Only known language codes, so a short slug such as /ai or
// /go stays an ordinary page.
export const LANGUAGE_CODES =
  'de|en|fr|it|es|pt|nl|rm|pl|cs|sk|sl|hr|sr|bs|hu|ro|bg|el|tr|ru|uk|sv|da|no|nb|nn|fi|is|et|lv|lt|ga|ca|eu|gl|ja|zh|ko|ar|he|hi|th|vi|id|ms';
const HOMEPAGE_PATH = new RegExp(
  `^(?:/(?:${LANGUAGE_CODES})(?:[-_][a-z]{2,4})?)?(?:/(?:index|home|start)\\.(?:html?|php))?$`,
  'i'
);

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
    if (path === '/' || HOMEPAGE_PATH.test(path)) {
      return 'homepage';
    }
  } catch {
    // unparseable URL — stay conservative
  }

  return 'other';
}
