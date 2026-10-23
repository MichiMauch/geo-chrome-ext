import { defineConfig } from '@playwright/test';

// End-to-end test of the built extension in a real Chromium (see
// e2e/extension.e2e.ts). Not picked up by vitest: the file name does not end
// in .test/.spec.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
