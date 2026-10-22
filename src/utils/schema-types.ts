import type { SchemaData } from '../types/analysis';

// All types of a schema node; '@type' alone misses multi-typed nodes like
// ["NewsArticle", "FAQPage"].
export function schemaTypesOf(s: SchemaData): string[] {
  if (Array.isArray(s['@types']) && s['@types'].length > 0) return s['@types'];
  const raw = s['@type'] as unknown;
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) =>
      t
        .trim()
        .replace(/^https?:\/\/(www\.)?schema\.org\//i, '')
        .replace(/^schema:/i, '')
    );
}

export function hasSchemaType(s: SchemaData, types: readonly string[]): boolean {
  return schemaTypesOf(s).some((t) => types.includes(t));
}
