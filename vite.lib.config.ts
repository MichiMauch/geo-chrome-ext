import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

// The analyzer as one browser ES module (dist-lib/geo-core.mjs) for websites
// that embed it; types come from tsconfig.lib.json.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Languages the embedding sites need. The extension keeps all six; the
// library drops the others, which are a good part of its size.
const LIB_LANGS = ['de', 'fr', 'it', 'en'];
const ALL_LANGS = ['en', 'de', 'fr', 'es', 'pt', 'it'];
const TRANSLATION_FILES = /src\/(utils\/i18n|i18n\/report\/[^/]+)\.ts$/;

// Removes the top-level `  xx: {` … `  },` blocks of unused languages from the
// translation files. A block that does not close as expected fails the build.
function dropLanguages(): Plugin {
  const dropped = ALL_LANGS.filter((lang) => !LIB_LANGS.includes(lang));
  return {
    name: 'geo-drop-languages',
    enforce: 'pre',
    transform(code, id) {
      if (!TRANSLATION_FILES.test(id)) return null;
      const lines = code.split('\n');
      const out: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const start = lines[i].match(/^ {2}([a-z]{2}): \{$/);
        if (start && dropped.includes(start[1])) {
          const end = lines.findIndex((line, j) => j > i && /^ {2}\},?$/.test(line));
          if (end === -1) this.error(`Unclosed "${start[1]}" block in ${id}`);
          i = end;
          continue;
        }
        out.push(lines[i]);
      }
      return { code: out.join('\n'), map: null };
    },
  };
}

export default defineConfig({
  define: { __GEO_VERSION__: JSON.stringify(version) },
  plugins: [dropLanguages()],
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    target: 'es2020',
    minify: false,
    lib: {
      entry: 'lib/index.ts',
      formats: ['es'],
      fileName: () => 'geo-core.mjs',
    },
  },
});
