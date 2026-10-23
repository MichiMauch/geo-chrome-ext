// @vitest-environment jsdom
// Golden-file comparison over the reference corpus (corpus/README.md).
// UPDATE_CORPUS=1 rewrites corpus/expected/ — review that diff, it shows
// exactly which pages a rule change moves.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setLang } from '../utils/i18n';
import { CORPUS_DIR, analyzeSnapshot, corpusPages, hasSnapshot, summarize } from './corpus';

const update = process.env.UPDATE_CORPUS === '1';
const available = corpusPages.filter((p) => hasSnapshot(p.id));

describe.skipIf(available.length === 0)('Referenzkorpus', () => {
  it.each(available.map((p) => [p.id]))('%s', async (id) => {
    setLang('en');
    const summary = summarize(await analyzeSnapshot(id));
    const file = join(CORPUS_DIR, 'expected', `${id}.json`);
    if (update || !existsSync(file)) {
      writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);
      return;
    }
    expect(summary).toEqual(JSON.parse(readFileSync(file, 'utf8')));
  }, 30000);
});
