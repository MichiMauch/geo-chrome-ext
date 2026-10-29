// Types next to the bundle, so `import … from './geo-core.mjs'` resolves them.
import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist-lib/geo-core.d.mts', import.meta.url), "export * from './types/lib/index';\n");
