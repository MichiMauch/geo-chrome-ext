import { describe, it, expect } from 'vitest';
import { getFixSnippet, getSnippetLanguageLabel } from '../fix-snippets';

// All 18 recommendation keys (incl. the AI-citation set) — must each resolve to
// a snippet or to an explicit 'no-snippet' explanation.
const ALL_RECOMMENDATION_KEYS = [
  'no_h1',
  'bad_hierarchy',
  'low_scanability',
  'no_definitions',
  'no_lists',
  'few_sections',
  'no_author',
  'no_date',
  'few_sources',
  'no_schema',
  'few_entities',
  'weak_semantic_html',
  'no_llms_txt',
  'ai_bots_blocked',
  'no_facts',
  'no_faq',
  'no_sourced_claims',
  'no_key_info_upfront',
];

describe('fix-snippets', () => {
  it.each(ALL_RECOMMENDATION_KEYS)('resolves a snippet entry for %s', (key) => {
    const result = getFixSnippet(key);
    expect(result).not.toBeNull();
    expect(['snippet', 'no-snippet']).toContain(result!.type);
    expect(result!.note.length).toBeGreaterThan(0);
  });

  it('returns null for unknown keys', () => {
    expect(getFixSnippet('totally_made_up_key')).toBeNull();
  });

  it('snippet entries carry placeholders in {{UPPER_CASE}} form', () => {
    const snippet = getFixSnippet('no_schema');
    expect(snippet?.type).toBe('snippet');
    if (snippet?.type === 'snippet') {
      expect(snippet.code).toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });

  it('language labels are non-empty for every variant', () => {
    expect(getSnippetLanguageLabel('html')).toBe('HTML');
    expect(getSnippetLanguageLabel('json-ld')).toBe('JSON-LD');
    expect(getSnippetLanguageLabel('txt')).toBe('llms.txt');
    expect(getSnippetLanguageLabel('robots')).toBe('robots.txt');
  });
});
