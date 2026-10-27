import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// The CLI as one ESM file for Node (dist-cli/geo.mjs). jsdom stays an
// external dependency; everything from src/ is bundled in.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __GEO_VERSION__: JSON.stringify(version) },
  build: {
    ssr: 'cli/bin.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: {
      output: { entryFileNames: 'geo.mjs', banner: '#!/usr/bin/env node' },
    },
  },
});
