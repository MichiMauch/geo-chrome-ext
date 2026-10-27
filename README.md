# Paul AI GEO Analyzer

A Chrome extension that analyzes web pages for Generative Engine Optimization (GEO) and classic on-page SEO — with scores, fix snippets, in-page issue highlighting, and a per-domain dashboard.

## What is GEO?

Generative Engine Optimization prepares your content for AI-powered search engines and assistants. As AI systems like ChatGPT, Perplexity, and Google AI Overviews become primary information sources, your content needs to be structured for machine understanding — while still nailing the classic on-page SEO fundamentals.

## Features

- **Instant Analysis** — One click on the toolbar icon opens the Chrome side panel and scores the active tab
- **6 Categories, Score 0–30** — Content clarity, answerability, trust signals, machine readability, AI citation readiness, on-page SEO
- **AI Crawler View** — Every analysis re-fetches the page without cookies and without JavaScript, the way GPTBot, ClaudeBot and PerplexityBot receive it, and shows the difference: text, headings and JSON-LD blocks side by side, plus the headings a crawler never sees
- **In-Page Issue Highlighting** — "Show on page" buttons outline affected elements right on the page, with plain-language badges ("This H4 follows an H2 and should be an H3", "Missing alt text", "Paragraph too long (873 chars)")
- **One-Click Fix Snippets** — Ready-to-paste JSON-LD schemas, semantic HTML, llms.txt templates, robots.txt directives, canonical tags
- **Domain Dashboard** — All analyzed pages of a domain on one page: scores, trends, last analysis, sorted worst-first; entries removable per row
- **Score Tracking** — Per-URL history (up to 50 analyses), trend indicator, sparkline chart, smart content-hash caching
- **HTML Report Export** — Standalone, client-ready report with explanations and fix snippets ("Save as PDF" included)
- **Privacy-First** — All analysis runs locally; `activeTab` model, no host permissions, no install warning, no tracking
- **6 Languages** — German, English, French, Spanish, Portuguese, Italian (auto-detected, manually switchable)

## Analysis Criteria

| Category | What's Checked |
|----------|----------------|
| Content Clarity | H1 presence & quality, heading hierarchy, scannability, readability (Flesch/LIX) |
| Answerability | Definitions, lists, structured sections |
| Trust & Sources | Author info, dates, external references |
| Machine Readability | Schema.org presence **and completeness**, entities, semantic HTML, llms.txt, AI crawler access in robots.txt (matched per URL path), content without JavaScript |
| AI Citation Readiness | Citable facts, FAQ/Q&A sections, sourced claims, key info upfront |
| On-Page SEO | Title & meta description quality, image alt coverage, indexability (`noindex`), mobile viewport, Open Graph/Twitter cards, canonical tag |

## Installation

### From Chrome Web Store
[Install Paul AI GEO Analyzer](https://chrome.google.com/webstore/detail/...)

### Manual Installation (Development)
1. Clone this repository
2. Run `npm install && npm run build`
3. Open `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the `dist` folder

## Usage

1. Navigate to any webpage
2. Click the extension icon — the side panel opens and analyzes the active tab
3. Work through the prioritized recommendations: copy fix snippets, or click "Show on page" to see the affected elements highlighted on the page
4. Edit your page, click the icon again to re-analyze, and track progress via trend and history
5. Open the domain overview to compare all analyzed pages of the site

## Command line (`geo`)

The same analyzers run in the terminal, on the HTML the server sends — what a JavaScript-less AI crawler sees. Built for Claude Code, Kraftwerk workflows and CI.

```bash
npm run build:cli && npm link     # builds dist-cli/geo.mjs and puts `geo` on the PATH

geo example.com                   # one page, every criterion, findings with owner and effort
geo --sitemap 30 example.com --snapshot run.json --label release-5.2
geo localhost:3000/artikel        # a dev server before the deploy
geo --file page.html --url example.com/neu   # a local file under its future address
geo example.com --json            # raw GEOAnalysisResult
geo example.com --findings        # flat findings with fingerprint geo:<key>:<path>
geo example.com --min 18          # exit code 1 below the score

geo diff before.json after.json   # compare two runs (text, --md, --json, --html report.html)
geo --sitemap 30 staging.example.com --baseline prod.json --fail-on-regression

geo tickets run.json --baseline before.json   # ticket plan: one ticket per finding and site
```

- **Snapshot** (`geo-snapshot/1`): every page with scores per category, met criteria, findings and the analyzer version. `geo diff` and `geo tickets` only read snapshots.
- **Comparison** matches pages by path, so it covers both "last month against today" and "staging against production". New, removed and failed pages are listed apart and never move the average. A different analyzer version is flagged, so a stricter rule is not read as a worse site.
- **Ticket plan** (`geo-tickets/1`): per recommendation the affected pages, owner, effort, fix snippet and a marker `geo:<host>:<key>`. The plan states what the run found (`open` or `resolved`); whoever executes it looks the marker up in the tracker to decide between creating, commenting and reopening.
- Unlike the extension the CLI cannot see content rendered by JavaScript; a client-rendered page scores what crawlers get. robots.txt, llms.txt and sitemaps are fetched once per origin, the firewall probe with AI-crawler User-Agents once per origin (`--no-bot-probe` to skip).

## Development

```bash
npm install
npm run build        # full build into dist/ (popup, content, background, report)
npm run type-check   # tsc --noEmit
npm test             # vitest
npm run package      # build + zip for the Chrome Web Store
npm run build:cli    # CLI bundle into dist-cli/geo.mjs (see above)
```

Local test pages with deliberately planted issues live in `testpage/` (serve with `python3 -m http.server 8765` from that folder): `index.html` triggers heading/alt/scanability findings, `extra.html` triggers H1-quality, readability, unsourced-claims and key-info findings, `spa.html` is an empty shell filled entirely by JavaScript and is disallowed for GPTBot only — it exercises the crawler-view check and the path-specific robots.txt evaluation.

Issue tracking uses [beads](https://github.com/steveyegge/beads) (`bd ready`, `bd show <id>`); issues are versioned in `.beads/issues.jsonl`.

## Tech Stack

- TypeScript
- Vite
- Chrome Extension Manifest V3 (side panel, `activeTab` — no host permissions)
- Tailwind CSS (panel) / standalone CSS (report & dashboard)
- Vitest (110+ tests, jsdom for DOM utilities)

## License

MIT

## Credits

Developed by [geo.mauch.rocks](https://geo.mauch.rocks)
