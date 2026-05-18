import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

const buildTarget = process.env.BUILD_TARGET; // 'content' | 'background' | 'report' | undefined (popup)

export default defineConfig({
  plugins: buildTarget ? [] : [tailwindcss()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: !buildTarget, // Only empty on popup build (first build)
    cssCodeSplit: false,
    rollupOptions:
      buildTarget === 'content'
        ? {
            // Content Script Build - IIFE with all deps inlined
            input: resolve(__dirname, 'src/content/content-script.ts'),
            output: {
              format: 'iife',
              entryFileNames: 'content/content-script.js',
              inlineDynamicImports: true,
            },
          }
        : buildTarget === 'background'
          ? {
              // Background Service Worker Build - IIFE
              input: resolve(__dirname, 'src/background/service-worker.ts'),
              output: {
                format: 'iife',
                entryFileNames: 'background/service-worker.js',
                inlineDynamicImports: true,
              },
            }
          : buildTarget === 'report'
            ? {
                // Report Viewer Build - IIFE
                input: resolve(__dirname, 'src/report/report.ts'),
                output: {
                  format: 'iife',
                  entryFileNames: 'report/report.js',
                  inlineDynamicImports: true,
                },
              }
          : {
                // Popup Build - ES modules OK
                input: resolve(__dirname, 'src/popup/popup.html'),
                output: {
                  entryFileNames: 'popup/popup.js',
                  chunkFileNames: 'popup/[name].js',
                  assetFileNames: (assetInfo) => {
                    if (assetInfo.name?.endsWith('.css')) {
                      return 'popup/popup.css';
                    }
                    return 'assets/[name].[ext]';
                  },
                },
              },
  },
});
