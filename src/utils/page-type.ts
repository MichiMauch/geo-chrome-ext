import type { PageData, PageType } from '../types/analysis';

// Conservative page-type detection. Explicit author signals (Schema.org,
// og:type) beat URL heuristics; anything uncertain stays 'other' so the
// scoring behaves exactly as before detection existed. Only confident
// homepage/product/article detections may relax check expectations.

const ARTICLE_SCHEMA_TYPES = ['Article', 'NewsArticle', 'BlogPosting'];

export function detectPageType(pageData: PageData): PageType {
  const schemaTypes = new Set(
    pageData.schema.map((s) => String(s['@type'] ?? ''))
  );

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
