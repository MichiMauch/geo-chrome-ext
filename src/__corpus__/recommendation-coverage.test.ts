// Every recommendation an analyzer can fire needs an entry in
// RECOMMENDATION_KEYS — without one it is silently dropped from the panel
// and report (js_only_content was, until 4.12). Reads the analyzer sources,
// hence here with the Node-typed tests.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { recommendationMeta } from '../utils/recommendations';

describe('Empfehlungsschlüssel', () => {
  it('jede ausgelöste Empfehlung hat Priorität, Zuständigkeit und Aufwand', () => {
    const dir = join(__dirname, '../analyzers');
    const keys = new Set<string>();
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      for (const m of readFileSync(join(dir, file), 'utf8').matchAll(/recommendations\.push\('([a-z_]+)'\)/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(40);
    expect([...keys].filter((k) => recommendationMeta(k) === null)).toEqual([]);
  });
});
