# Chrome Web Store screenshots

Five 1280×800 screenshots in `screenshots/`, made from the real extension.

1. `npm run build`
2. `node store/capture.mjs` — runs dist/ in Chromium against a local demo
   article (`demo-site/article.mjs`, a fictional magazine on the reserved
   domain `northwind-journal.example`), first before and then after the
   fixes, with a CDN rule that blocks OpenAI's crawlers. Raw captures go to
   `raw/` (not committed). Usage statistics are switched off for the run.
3. `node store/compose.mjs` — frames the captures with headline and browser
   window into `screenshots/`.
