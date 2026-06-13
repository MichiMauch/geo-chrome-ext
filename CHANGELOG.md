# Changelog

## [4.0.1] - 2026-06-13

### Fixed

- **Sitemap batch analyzed sitemap files instead of content pages:** On sites whose sitemap index is declared as a plain `<urlset>` with `<url><loc>…sitemap-*.xml</loc>` entries (instead of the standard `<sitemapindex>`/`<sitemap>` — e.g. netnode.ch), the batch treated those nested `.xml` files as if they were HTML pages and scored every one of them as "Critical" (~6.1/30), never reaching the actual articles/pages behind them. The sitemap parser now recognizes a `<url><loc>` that points at an `.xml` sitemap and expands it instead of analyzing it, and index nesting is now resolved recursively (up to 3 levels, capped at 50 sitemap fetches) rather than a single level.

## [4.0.0] - 2026-06-12

> **In short:** The new domain overview shows every analyzed page of a website at a glance — the weakest one at the top. In the panel, the recommendations now sit directly below the score, a focus line names the biggest lever, and when you switch pages the extension explains what to do in a friendly way instead of showing an error.

### Added

- **Internal linking check:** New sub-check in Machine Readability — enough internal links (≥3) and a high share of descriptive anchor texts (no "click here"/"mehr", multilingual generic-anchor detection). Recommendation with a ready-to-paste example snippet showing a contextual link with a descriptive anchor.
- **Page-type detection:** The analyzer now detects whether a page is a homepage, an article, a product page or "other" (Schema.org/og:type signals beat URL heuristics; anything uncertain stays "other" and behaves exactly as before). Checks that don't apply to the detected type are excluded from the score and shown as "not relevant" instead of failing: homepages are no longer penalized for missing author/date, FAQ sections, upfront definitions; product pages skip author/date. A badge next to the URL shows the detected type.
- **Sitemap batch analysis:** A new button "Analyze sitemap (max. 10 pages)" fetches the site's sitemap.xml (with robots.txt Sitemap: fallback and one level of index nesting), analyzes up to 10 same-domain pages in the background and saves them to the history — then opens the domain dashboard with all results. Works entirely through same-origin fetches in the page context, so still **no host permissions**. Note: client-side-rendered SPAs are scored on their raw HTML — which is what AI crawlers without JavaScript see anyway. The batch keeps running even if the panel closes; re-analyzed pages respect the polite 300ms delay between requests.
- **Domain overview:** A new button in the panel footer ("Domain overview (N)") opens a dedicated dashboard page with all analyzed URLs of the current domain: path (clickable), last score (color-coded), rating badge, trend delta, date, number of analyses. Sorted by score ascending — the pages that need attention are at the top. Header area with page count, average score and overall rating. Runs through the existing report viewer, no new build target.
  - **Remove entries:** An ×-button per row with two-click inline confirmation (no `window.confirm`) deletes the history of the respective URL — e.g. after a project is finished. Counter and average score recalculate live.
  - Data storage: `chrome.storage.local`, no expiry; max. 50 analyses per URL (oldest is dropped).
- **Focus line:** Above the top recommendations, "🎯 Biggest lever: {Category} ({Score}/5)" names the weakest category — one actionable instruction instead of six numbers. Only appears when the weakest category is below 4/5.
- **"New page detected" state:** If you switch tabs with the panel open and click Refresh, the panel now shows the extension icon with a 👆 pointer and the instruction "Click the extension icon" — instead of a red error with a pointless retry button (a panel button technically cannot grant activeTab access, only the icon click can).
- Third local test page `testpage/best-practice.html`: a best-practice case (passes almost everything) with an intentional canonical mismatch — demonstrates the orange state of the canonical check and the score range in the domain dashboard.
- **Anonymous usage statistics (opt-out):** After each fresh analysis the extension sends an anonymous, URL-free payload (scores, fired recommendation keys, language, version, random install id) to `api.geo.mauch.rocks`. Strictly nothing URL- or content-derived leaves the browser — deduplication (one report per page per day) happens locally. A one-time notice explains it; a footer toggle disables it anytime. No new permissions (CORS-based fetch).
- **Agency CTA (lead generation):** A subtle link "Too much to fix? geo.mauch.rocks optimizes your website for AI search" to geo.mauch.rocks — in the panel only for "Critical"/"Needs improvement" ratings (pain moment), in the HTML report and domain dashboard as a footer card (these documents get shared with decision makers). UTM parameters per surface (panel/report/dashboard) for conversion measurement. Privacy-compliant: plain links, no data transmitted without a click. In 6 languages.

### Changed

- **Panel order:** Recommendations (including the focus line) now sit directly below the score, the category cards follow as the detail section. Reading flow: How good? → What to do? → Why? Previously, important recommendations (e.g. canonical, priority 7) were buried three scroll-heights down behind the six category cards.
- README brought fully up to date (was stuck on the v1.x state from January).

### Fixed

- **Refresh on a non-analyzed tab:** The refresh button used to reload the foreign page without asking when the activeTab grant was missing, then showed the raw English Chrome error message ("Cannot access contents of url …"). The reload-recovery path now only runs on the page that was already analyzed (orphaned content script after an extension update); on other tabs the new "New page detected" state appears immediately.

### Technical

- `getDomainOverview()` in history.ts, generator `export-domain-html.ts`, delete handler in the report viewer; new panel state `needs-click`; all DOM extractors accept a `Document` + URL parameter (enables batch analysis on DOMParser documents); cache prefix `v8`; 138 tests.

## [3.2.0] - 2026-06-11

### Added

- **Canonical tag check (7th sub-check in On-Page SEO, weight 1.0):** Three states analogous to the viewport check: missing/broken `<link rel="canonical">` = red (recommendation `canonical_missing` with copy-paste snippet), canonical pointing to a **different** URL = orange with partial points (recommendation `canonical_mismatch` with a tip box — canonicals pointing elsewhere can be intentional, e.g. syndication), self-referencing = green. The URL comparison ignores query string and hash on both sides (a canonical that strips tracking parameters is correct usage) and normalizes trailing slash as well as host casing. Relative hrefs are resolved. Report explanations and all strings in 6 languages.

### Technical

- `PageData.canonical` (`extractCanonical()` in dom-helpers), new recommendation keys `canonical_missing` (prio 6) / `canonical_mismatch` (prio 7), cache prefix `v6`, 103 tests (5 new).

## [3.1.0] - 2026-06-11

### Added

- **In-page issue highlighting (overlay mode):** Each recommendation with visible DOM targets gets a "Show on page (n)" button in the panel. A click marks the affected elements directly on the analyzed page (outline + explanatory badge) and scrolls smoothly to the first match. Toggle behavior: one active finding at a time; re-analysis cleans up markers. Seven highlightable findings:
  - **Heading hierarchy** (`bad_hierarchy`, red): level jumps with an actionable instruction in the badge ("This H4 follows an H2 and should be an H3") plus duplicate H1s
  - **H1 quality** (`no_h1`, red): too short/too long H1s with character count and threshold in the badge
  - **Image alt texts** (`images_missing_alts`, orange): images without an `alt` attribute; decorative ones (`alt=""`) correctly excluded
  - **Overly long paragraphs** (`low_scanability`, orange): paragraphs above the scanability threshold, character count in the badge
  - **Hard-to-read paragraphs** (`low_readability`, orange): per paragraph with a Flesch/LIX value in the badge, same formula choice as the score
  - **Unsourced factual claims** (`no_sourced_claims`, orange): paragraphs with number/"according to" patterns without a citation pattern and without an external link
  - **Key info upfront** (`no_key_info_upfront`, **blue dashed**): marks the spot (first paragraph) where the definition should be — deliberately a different style, because nothing is broken here, something is missing
  - Badges are standalone, absolutely positioned elements (images can't carry CSS pseudo-elements), localized in 6 languages, generated at analysis time in the page context
  - **No new permissions:** everything runs through the existing activeTab + messaging; the `permissions` block in the manifest is unchanged
  - Error case (tab navigated, activeTab grant gone): the button briefly shows "Page not reachable — click the icon again"

### Changed

- **Recommendation layout:** Each recommendation is now its own card with a fixed order text → hint → buttons → snippet preview. Previously CSS (`order: -1`) lifted the button row above the text, which made buttons visually stick to the wrong recommendation.
- **"No code snippet" hint replaced:** The gray hint boxes now say directly what to do ("💡 Tip: …") without developer jargon. For the hierarchy tip the alternative is explained (change the level or add an intermediate heading), since the badge only names the most common fix.
- **Cache fingerprint extended:** The content hash now includes the number of images without `alt` — adding alt texts now invalidates the cache, previously score and markers stayed stale.
- **Scanability length thresholds** (300/500/800 characters) centralized from `content-clarity.ts` into `geo-config.ts`; highlight collector and score use the same constant.

### Technical

- Three new modules: `src/utils/selector.ts` (unique CSS paths), `src/utils/highlight-targets.ts` (collector map, runs only for fired recommendations), `src/utils/highlight.ts` (overlay rendering in the page context).
- `GEOAnalysisResult.highlightTargets?: Record<string, HighlightTarget[]>` (`{selector, label}`); message protocol `highlight`/`clear-highlights`; cache prefix `v3` → `v5`.
- Test suite: 98 tests (up from 71); new jsdom tests for selector generation and all seven collectors; `jsdom` as a devDependency.
- Local test pages under `testpage/` (not in the build): page 1 for the element-error trio, page 2 for H1/readability/sources/key-info.

## [3.0.2] - 2026-05-27

### Fixed

- **"Extension manifest must request permission to access this host":** 3.0.1 still injected the content script from the side-panel context (`chrome.scripting.executeScript`). However, Chrome does not reliably propagate the `activeTab` grant from an action click into side-panel API calls — so the inject failed with "Extension manifest must request permission". Fix: the service worker now injects the content script directly in the `onClicked` handler (in the same user-gesture stack as the click), synchronously alongside `sidePanel.open()`. The side panel itself only does `sendMessage`. The inject fallback in the popup now only exists for the popup-window mode (sidePanel API not available).

## [3.0.1] - 2026-05-26

### Fixed

- **Side panel doesn't open / "Content script not reachable":** In 3.0.0, `chrome.sidePanel.open()` was called after an `await chrome.sidePanel.setOptions(...)`. That consumes the user gesture, and `open()` threw silently in Chrome ("may only be called in response to a user gesture"), landing in the fallback popup window — where `chrome.tabs.query({ currentWindow: true })` returned the popup window itself and showed "Not supported". Fix: `sidePanel.open()` is now called synchronously in the `chrome.action.onClicked` handler; `setOptions`/messaging run in `.then()` chains.
- **Upgraders from 2.x never saw the new flow:** v2.x had set `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, and Chrome persists that setting across updates. This kept suppressing `chrome.action.onClicked`, so the new logic never ran for upgraders. Fix: the service worker now explicitly resets the setting to `false` on `onInstalled`/`onStartup`.
- **Popup-window fallback now finds the right tab:** When the sidePanel API isn't available or `open()` does fail, the service worker passes the tab ID via `?tabId=…` to the popup URL. The popup reads it via `chrome.tabs.get()` instead of incorrectly querying its own window tab.
- **Meaningful error message instead of "Content script not reachable":** `chrome.scripting.executeScript` errors are no longer silently swallowed — when the injection fails (typically a missing activeTab grant), the panel shows the original Chrome error message plus a hint to click the icon again.

## [3.0.0] - 2026-05-18

### Added

- **Side-panel mode:** Clicking the extension icon now opens the Chrome side panel instead of a popup. The panel stays open when switching tabs, so the "edit page → re-analyze → compare" workflow works without closing and reopening. When switching to another tab, the panel shows an informative hint banner ("Click the extension icon to analyze this page"). The layout is responsive: the side panel fills the full width and height, the footer sits at the bottom.
  - Manifest: new permissions `sidePanel` and `tabs` — **no** `host_permissions` needed, the extension still runs with `activeTab`, which is granted automatically on the icon click (no permission dialog on install, no re-activation on update)
  - Service worker: the `chrome.action.onClicked` handler opens the side panel via `chrome.sidePanel.open()` and sends the panel an `analyze-tab` message so it re-analyzes for the tab where the icon was clicked (the click freshly grants `activeTab` for exactly that tab)
  - Banner string in 6 languages (`ui_otherPageDetected`)

- **One-click fix snippets:** Each recommendation now has a "Show snippet" and a "Copy" button. Generates concrete code snippets (JSON-LD schema for Article/FAQPage/Person/Organization, semantic HTML, llms.txt template, robots.txt directives etc.) that go to the clipboard with one click. Turns the extension from a diagnostic into an implementation tool. 16 snippets + 2 no-snippet hints for all 18 recommendation keys. Works in the popup and in the HTML report. UI strings in 6 languages.

- **Readability score (Flesch / LIX):** New sub-check in the "Content clarity & structure" category. Automatically picks the right formula based on the active UI language: Flesch Reading Ease for EN/FR/ES/PT/IT (higher = easier; ≥60 is plain English), LIX for DE (lower = easier; ≤30 very easy, ≥60 very hard; well suited for long German compounds). Shows the raw value directly in the criterion ("42 Flesch" / "45 LIX") plus an explanation in the HTML report. For texts that are too complex, there's the recommendation "Simplify the text: shorter sentences, simpler words, fewer long compounds." in 6 languages.

- **Schema.org completeness validation:** In addition to the existing `@type` presence check, the machine-readability analysis now also checks the required fields per schema type. An empty `Article` schema without `author` and `datePublished` is no longer counted as "Pass". Validated are Article / NewsArticle / BlogPosting (headline, author, datePublished), FAQPage (mainEntity), HowTo (name, step), Product (name, offers), Organization (name, url), Person (name), BreadcrumbList (itemListElement), WebPage (name). Shallow schemas from microdata/RDFa extraction (only `@type` without properties) are fairly skipped. Shows specifically which fields are missing in the sub-criterion ("Article: author, datePublished"). New recommendation `rec_schema_incomplete` in 6 languages.

- **6th analysis category: On-Page SEO:** A new category extends the tool from GEO-only to a combined GEO+SEO audit. The total score now goes from 0–30 (instead of 0–25); rating thresholds scaled accordingly (Excellent ≥25, Good ≥19, Needs improvement ≥12). Six sub-checks:
  - **Page title quality** (required, length 30–60 characters, weight 2.0)
  - **Meta description** (required, length 120–160 characters, weight 1.5)
  - **Image alt texts** (share of images with an `alt` attribute; `alt=""` for decorative images counts correctly; pages without images = full points, weight 1.5)
  - **Indexability** (`<meta name="robots">` with `noindex` triggers a critical recommendation with priority 12 — higher than anything else in the system; weight 2.5)
  - **Mobile viewport** (three states: no tag = red/0, tag without `width=device-width` = orange/0.4, correct = green/1; weight 1.5)
  - **Open Graph & Twitter Cards** (og:title + og:description + og:image + twitter:card with OG fallback, weight 1.0)

### Changed

- **Category layout in the popup:** Sub-criteria are now each shown on their own line (previously horizontal with a `•` separator and flex-wrap). Better readability especially for long criterion names and many sub-checks per category.
- **Recommendation bullet position:** The orange bullet now sits correctly at the height of the first text line — even when the snippet buttons ("Show snippet", "Copy") are above it. Previously the bullet was slightly off for items with snippet buttons.
- **Score range 0–30 instead of 0–25:** Due to the new 6th category. The total score display in the popup, history list and HTML report now shows `X/30`.
- **`schemaOrg` weight in machine readability:** Reduced from 2.5 to 2.0 to make room for the new `schemaCompleteness` (weight 1.5) without distorting the category total score.
- **Header title:** "Paul AI GEO Analyzer 2.0" → "Paul AI GEO Analyzer 3.0".

### Technical

- Complete test suite: 71 tests (up from 8 before the release cycle). New test files: `readability.test.ts` (13), `machine-readability.test.ts` (6), `on-page-seo.test.ts` (16), `fix-snippets.test.ts`.
- Manifest v3-compliant side-panel setup without `default_popup` (so that `sidePanel.setPanelBehavior` takes effect).
- Cache prefix in `src/utils/cache.ts` bumped twice: `v1` → `v2` (fix-snippets integration changed `topRecommendations` from text to keys) → `v3` (the new On-Page SEO category changed the result shape). Old caches are automatically ignored.
- `PageData` type extended with `ImageData[]`, `OpenGraphData`, `TwitterCardData`, `RobotsMetaData`, `ViewportData`; new extract functions `extractImages`, `extractOpenGraph`, `extractTwitterCard`, `extractRobotsMeta`, `extractViewport` in `dom-helpers.ts`.

## [2.0.0] - 2026-04-05

### Added

- **Full internationalization (i18n):** The entire extension interface is now automatically displayed in the user's browser language. Supported languages: German, English, French, Spanish, Portuguese and Italian. Language detection happens automatically via `navigator.language` with a fallback to English.
  - All UI texts (loading, errors, not supported, history etc.)
  - Scoring labels (Excellent/Exzellent/Eccellente etc.)
  - Category names and criterion labels
  - All 13 recommendation texts
  - Trend display and time information
  - Localized date formats in the analysis history

- **Opt-in analytics:** Analysis data can optionally be sent to your own server. Toggle in the footer with explanatory text ("No personal data or page content is sent"). Fire-and-forget with a 5s timeout. Default: disabled. If the toggle is enabled after an analysis, the last result is sent immediately.

- **HTML report export:** Analysis results can be opened as a professional HTML report in a new tab. Contains the total score, all category cards with progress bars, and top recommendations. Fully localized in 6 languages. Includes a "Save as PDF" button.

- **Detailed error explanations:** In the HTML report, each criterion explains why it passed or failed. Color-coded boxes (green/yellow/red) with concrete improvement hints. All explanations in 6 languages.

- **5th analysis category: AI Citation Readiness:** A new analyzer checks how well content can be cited by AI systems. The total score now goes from 0–25 (instead of 0–20). Rating thresholds adjusted (Excellent ≥21, Good ≥16, Needs improvement ≥10). Four criteria:
  - Citable factual statements (numbers, statistics, "according to" patterns)
  - FAQ / question-answer sections (FAQPage schema + heading patterns)
  - Statements with source references (citation patterns, external links)
  - Key information upfront (definition in the first 150 words)

- **Dark mode:** Automatic detection via system setting + a manual toggle (moon/sun icon) at the top right of the header. The setting is saved. All popup elements, category cards, history panel and footer are dark-mode compatible.

- **Trend sparkline:** A mini chart in the history panel shows the score progression over time as a turquoise line with area fill. Appears from 2+ entries. Canvas-based, dark-mode compatible.

- **Clear history:** A trash-can icon next to "Analysis history" lets you clear the entire history for the current URL.

- **Manual language selection:** A dropdown in the header (e.g. `DE ▼`) lets you manually switch between all 6 languages — with flag emojis. The setting is saved and overrides browser detection.

- **Comparison view:** Compare the current page with any URL. A "Compare" button next to the export opens a URL input field. The second page is analyzed in the background, then a side-by-side comparison opens with the total score, all categories next to each other and a summary (strengths/weaknesses per page).

- **Accessibility:** ARIA labels on all interactive elements (buttons, toggles, dropdowns, progress bars). Correct roles (role="menu", role="alert", role="status", role="progressbar"). aria-expanded on dropdowns and the history panel. Keyboard navigation: Escape closes dropdowns. Screen-reader compatible.

- **Modern SaaS design for report & comparison:** Both export pages were redesigned with the Inter font, a mesh-gradient header, glass-effect cards, a 2-column bento grid, line icons per category, animated count-up for scores, sliding progress bars and flash animations on delta badges.

### Changed

- The analytics toggle now shows "Improve GEO Analyzer" with explanatory text instead of a plain checkbox
- Export button and analytics toggle are split into separate areas
- The history list has spacing to the scrollbar (pr-2)
- The comparison logic now runs in the background service worker (the popup can close without aborting the process)
- Added `host_permissions` for all URLs (for background analysis during comparison)

## [1.1.0]

- Score tracking, trend analysis and history
- Badge on extension icon with auto-clear

## [1.0.0]

- Initial release
- GEO analysis with 4 categories
- Top 5 recommendations
- Privacy-first local analysis
