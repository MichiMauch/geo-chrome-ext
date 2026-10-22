# Changelog

## [4.7.1] - 2026-10-22

### Changed

- **"Export report" is now "Open detailed report", as a primary button:** The label promised an export, but the button opens the report in a new tab, and exporting only happens there via "Save as PDF". It also sat as a small text link among the site-wide tools, although the report is where findings, causes and fixes are explained. It is now a filled button above the domain overview and sitemap links, which stay secondary, with a document icon instead of the external-link arrow. Translated in all six languages.

### Fixed

- **The panel header said "4.0":** The version was hard-coded. It now comes from the manifest (major.minor).

## [4.7.0] - 2026-10-22

### Changed

- **A clearer report layout:** With the detailed explanations from 4.6 the report had grown to over 8,000 pixels, every criterion fully expanded in two narrow columns, with the recommendations at the very end. It is now built for scanning:
  - **Overview at the top:** the score card shows all six categories with their score and a bar, each linking to its section.
  - **Recommendations first:** what to do comes right after the score, before the details.
  - **One line per criterion:** status, name, value and the one finding that sums it up. A click opens what was found, how to fix it (highlighted) and why it matters. The summary line is chosen per criterion, e.g. "Missing: FAQPage" rather than "Found: NewsArticle", or "LIX 63: very hard" rather than the formula note.
  - **Problems first:** within each category, criteria that aren't met come before partial and passed ones. The header counts them, e.g. "2 not met · 1 partly met".
  - **Full width:** categories span the whole page, so the explanations get a readable line length. An "Expand all" button opens everything at once.
  - **Printing and PDF:** everything expands automatically, and page breaks fall between blocks instead of leaving half pages empty.
  - On phones the overview uses two columns and the snippet buttons wrap below the recommendation text.

## [4.6.1] - 2026-10-22

### Fixed

- **Updates showed cached results from the previous version:** The analysis cache used a fixed key prefix (`geo_cache_v10`) that had to be bumped by hand, and 4.5.0 and 4.6.0 didn't. A page analyzed before the update was served from the cache as long as its content hadn't changed. It therefore showed neither the 4.5 rules (promo boxes, question/answer pairs) nor the 4.6 report texts, and the report fell back to the old one-liner, e.g. "The heading hierarchy is clean" next to 80%. The cache key now contains the extension version, and entries of other versions are removed on install and update.

## [4.6.0] - 2026-10-22

### Added

- **The HTML report explains every criterion in three parts:** what was found on this page, why it matters, and how to fix it. The report used to give one generic sentence per criterion, e.g. "Few citable fact statements found (Score: 0%)", which left non-technical readers guessing what exactly was wrong.
  - **What we found** lists concrete findings with numbers and short examples from the page. Examples: "Found: NewsArticle. Missing: FAQPage, the page contains 52 questions in FAQ format, e.g. «Woher hat die Schweiz ihren Strom?»", "Skipped levels: H1 → H3 «Auf einen Blick»", "Checked paragraphs: 1, with a number, percentage or source: 0", and which parts of "Key information upfront" were met, each with its share of the score. Passing criteria show what was found too, so it is clear why they are green.
  - **Why it matters** explains in plain words what search engines and AI systems do with it. It explains jargon in passing and states caveats honestly: Google only shows FAQ rich results for government and health sites since 2023, and the effect of llms.txt is unproven.
  - **How to fix it** is an action and says who can do it: the editorial team in the CMS, or the web agency in the template. Where a copy-paste template exists, it points to it. Several criteria have case-specific fixes, e.g. FAQ answers missing from the HTML vs. no FAQ at all.
  - All texts exist in all six interface languages. They live in one file per category under `src/i18n/report/`, with writing rules in its README. Analyses stored before this version keep the previous one-line explanation.
- **FAQPage template when only FAQPage is missing:** A page whose only missing schema type is FAQPage got the recommendation and snippet for an Article block. It now gets `no_faq_schema` with the FAQPage template.

### Fixed

- **Green tick on a failing check:** "Structured sections" could show 3/3 with a green tick in the panel and the report while failing for lack of text under the subheadings. A full progress bar on a failing check now shows as partial.
- **Raw value keys:** The value mapper treated every value containing a digit as finished text, so `value_h1Optimal` appeared verbatim. It now translates every value that is a known key.
- **"52 chars" in German and other languages:** Title and meta description lengths were hard-coded in English. They are now translated.
- **Dates shown as raw timestamps:** "2026-09-10T09:01:46+00:00" is now shown as "2026-09-10".
- **Words glued together:** Link texts, list items and accordion panels built from several `<div>`s were read with `textContent`, so an author card read "Lukas FedererBereichsleiter". Block elements now separate words.

## [4.5.0] - 2026-10-22

### Changed

- **Readability formula follows the content language for every language:** 4.4.0 only told German from English. A Dutch, Swedish or Polish page fell back to the UI language and was measured with English Flesch under an English browser. Now any declared page language counts (`<html lang>` or schema `inLanguage`, `und`/`x-default` ignored). Undeclared text falls back to a German/English stopword guess and no longer to the UI language. Flesch is used for English only. LIX for every other language, including French, Spanish, Portuguese and Italian, which used to get English Flesch as an approximation. Their adapted Flesch variants (Kandel-Moles, Fernández-Huerta, Flesch-Vacca, Martins) each need language-specific syllable rules and their own scale. LIX needs no syllables at all and was validated across eleven European languages (Björnsson 1983).
- **Question headings answered right below them count as direct answers:** "Direct answers/definitions" only looked for definition sentences ("X ist ein …"). A FAQ whose question headings are each followed by a plain statement ("Woher hat die Schweiz ihren Strom?" → "Rund 60 Prozent stammen aus Wasserkraft …") now gets credit for those answers. An answer that is also a definition is counted once.
- **FAQ answers are counted per question:** The FAQ criterion counted at most one answered question per long paragraph *anywhere* on the page, so five question headings plus five unrelated paragraphs read as five answered questions. Each question is now paired with the text between it and the next heading or accordion trigger, and only questions with a substantive answer count. Analyses stored before this version keep the old approximation.
- **Unlabeled promo boxes are no longer content:** Sidebar boxes like "Dossierpolitik – das Neuste zum Thema Energiepolitik" carry no semantic markup and no telling class names, so 4.4.0 still counted them as headings and paragraphs. A block with a heading, at most 1,500 characters and at least half of its text in links to the site itself is now treated as a promo block. Links to other sites don't count towards that share, so a "Sources" section with a list of citations stays content.

### Added

- `PageData.questionAnswers`: every question heading and accordion question in the content area with its answer text (empty when the answer is not in the DOM).

### Performance

- **The content area is computed once per pass:** Every extractor recomputed the content scope, about five times per analysis plus once per highlight collector. `withContentScope()` pins one scope for the whole extraction and for all highlight collectors. Outside such a pass the scope is still recomputed, because the live DOM may change between analyses.

## [4.4.0] - 2026-10-22

An audit of every criterion against a real page (the economiesuisse.ch FAQ on Switzerland's power supply, a German Next.js site) showed that the unit tests all passed while many results were wrong or right for the wrong reason. This release fixes what the audit found. Scores change on most pages, usually downwards where site chrome used to be counted as content.

### Changed

- **Only the content area is analyzed:** Headings, paragraphs and lists used to be collected from the whole document, so menus, footers, share boxes, "Related articles" teasers and newsletter sign-ups counted as content. Two navigation lists and a footer list were enough for "Lists 3/3". The extractors now pick a content root (`article`, else `main`, else `body`), skip `nav`, `aside`, page-level `header`/`footer`, ARIA landmarks and blocks named or headed like share/newsletter/related/cookie/breadcrumb, and ignore teaser cards (headings and paragraphs inside links) and paragraphs that only repeat the H1. Highlights use the same element set, so markers point at exactly what was scored.
- **Readability follows the page language, not the UI language:** A German page analyzed with an English browser was measured with the English Flesch formula and showed "-10 Flesch"; with a German browser the same page showed "69 LIX". The formula is now chosen from `<html lang>` or schema `inLanguage`, falling back to a stopword guess and only then to the UI language. Each paragraph end counts as a sentence end (fragments without punctuation used to merge into one huge sentence), Flesch is clamped to 0–100, and the LIX scale was recalibrated for German, where compounds push typical non-fiction to 50–60: full points up to 40, zero from 65.
- **Source links are real sources:** "External sources" and "Claims with sources" counted `tel:` and `mailto:` links, the site's own subdomains, social profiles (x.com, TikTok, YouTube …) and LinkedIn share buttons. On the audited page 25 "external" links contained zero sources, yet the check passed. Links are now limited to http(s), compared by registrable domain, flagged when they sit in site chrome or share widgets, and social/messenger/tracker hosts are excluded by hostname. Both criteria share one filter (`source-links.ts`) and show the true count.
- **Facts, citations and definitions understand German:** "Prozent", "30 %", TWh/GW/kWh, CHF/Fr./€, Mio./Mrd., `1'200` and "gemäss/gemäß/laut/zufolge" are recognized as facts, a bare year ("Copyright 2024", "Energiestrategie 2050") no longer is. Citations like "(Bundesamt für Energie, 2024)" and "(Schärli, 2023)" are matched. A definition needs a real definition pattern ("X ist ein …", "Unter X versteht man …", "X bezeichnet …") instead of any "ist" anywhere. All patterns use Unicode-aware word boundaries.
- **FAQ scoring counts answered questions:** Accordion questions are detected in the WAI-ARIA/Radix/shadcn pattern (`h3 > button[aria-expanded]`), which found none of the 52 questions on the audited page before. A FAQ with five or more answered questions reaches full points without FAQPage schema, which remains a bonus.
- **Machine readability:**
  - Schema types are counted as distinct types. Two identical `NewsArticle` nodes no longer make 2/2, and a single Microdata item no longer counts twice. `@type` arrays, `schema.org/` prefixes and `@graph` inside a JSON-LD array are handled. The panel names the missing type (e.g. FAQPage on a FAQ page, an Article type on an article).
  - Schema completeness requires the author to have a name.
  - "Clear entities" now scores real entity signals: an organization with name, logo or sameAs, a named person with sameAs or url, `@id` links and about/mentions. It no longer double-counts the author or credits the meta description and a product-word regex.
  - Semantic HTML weights sum to 100% (they topped out at 90%). `nav` counts, `aside` is a bonus.
  - Internal linking counts distinct contextual links only, no navigation, footer or Cloudflare `/cdn-cgi/` links.
  - The AI crawler list adds OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, Perplexity-User, Applebot-Extended and meta-externalagent.
- **Social cards check six real tags:** og:title, og:description, og:image, og:url, twitter:card and og:type, which must be `article` on articles. Previously `og:title` alone satisfied the Twitter card check, so pages without any Twitter tag scored 4/4. A logo or placeholder og:image does not count.
- **Heading hierarchy and scannability:** The hierarchy bonus no longer offsets penalties (20 H3s before the H1 scored 100%), a page without H1 can no longer pass, and the penalty keys got names that match what they penalize. Scannability ignores paragraphs under 80 characters and caps the headings-per-block ratio, so short junk paragraphs no longer read as "well scannable". Partial credit for H1 and structured sections is proportional to the criterion weight.

### Added

- **Hidden FAQ answers are reported:** When accordion questions have no answer in the DOM, e.g. closed Radix accordions that only mount on click, so the text exists only in the JavaScript payload, the FAQ criterion says "52 of 52 answers missing from the HTML" and the new recommendation `faq_answers_hidden` explains that crawlers only see the questions. Previously this showed up only indirectly as low fact and answer scores.
- `PageData.lang` and `PageData.faqAnswersHidden`, plus `LinkData.isNavigational` and `SchemaData['@types']`. `LinkData.href` is now the resolved URL, so protocol-relative links (`//example.org/…`) count as sources like any other.
- The new texts are translated into all six interface languages.

### Fixed

- **Raw placeholders in values:** `{current}/{target} types ({types})`, `{current}/{target} lists`, `{current}/{target} subheadings` and `{count} H1` appeared verbatim in the panel and the HTML export. The mapper now fills `{current}`/`{target}` from each criterion's progress, and the remaining values carry explicit parameters.
- **robots.txt:** A blank line between `User-agent` and its rules ended the group, so a blocked bot read as allowed. Groups now end only at the next `User-agent` after a rule, per RFC 9309.
- **llms.txt** was requested from the open tab's origin rather than the analyzed URL's.
- **Cached results:** The cache prefix moves to `geo_cache_v10`, so pages analyzed before this version are re-scored with the new rules instead of showing old results.
- **Author:** Labels such as "Über den Autor" or "About the author" are no longer taken as the author's name, and a visible person byline now beats the publisher organization.

### Tests

- New suites for AiCitation, Answerability and TrustSources, which had no tests before, and for content scoping (a synthetic Radix accordion fixture modeled on the audited page), links, schema normalization, robots.txt groups and the value mapper, plus a parity test that every language has exactly the English translation keys. 243 tests became 444.
- `testpage/best-practice.html` now carries real facts, contextual internal links and publisher logo/about data, so it still demonstrates the ideal case under the stricter rules: 28.1/30, with only the deliberately wrong canonical failing.

## [4.3.2] - 2026-08-20

### Fixed

- **`dateModified` was hidden by `datePublished`:** The Schema.org step of `extractDates` read `schema.datePublished || schema.dateModified`, so the publication date always won and the modification date was only ever consulted when no publication date existed. A page published in 2021 and updated today was therefore scored on 2021 and counted as older than a year — a half-filled dot on the "Date present" criterion instead of a full one. Both dates are now collected, `dateModified` first, and identical timestamps from several schema blocks on one page are deduplicated. Pages that only carry `datePublished` are unaffected. Found on fisba.com, which publishes both in its JSON-LD.
- **The panel showed the first date found, not the newest:** The value next to "Date present" came from `dates[0]`. Since schema dates are collected before the visible text dates, a page could score a full freshness point from a current "Last updated" line in the footer while the panel displayed a publication date from years earlier. The newest of all found dates is now shown.
- **`{date}` appeared verbatim for stale pages:** The translation for a date older than a year reads `{date} (older than 1 year)`, but nothing ever substituted the placeholder — the panel printed the braces. `CategoryDetail` now carries an optional `valueParams`, which the mapping layer passes to `t()`, so the date is filled in. All six interface languages were already worded for it.

## [4.3.1] - 2026-08-19

### Fixed

- **Sitemap batch analyzed the open tab's markup instead of each URL's:** `extractSchemaData`, `extractAuthorInfo`, `extractRobotsMeta`, `extractParagraphs` and `extractFaqQuestions` all accept the document to work on, but queried the global `document` inside. On a live analysis both are the same object, so nothing looked wrong. The sitemap and domain batch parses every URL with `DOMParser` while running in the content script of whatever page happens to be open — so each analyzed URL inherited that page's JSON-LD, author meta, robots meta, paragraphs and FAQ questions. Schema types, schema completeness, entities, author and indexability were therefore wrong for every batch result. A regression test fills the live document with one set of markup and asserts the extractors return the parsed document's data.
- **Authors in JSON-LD were missed in three common shapes:** The author check only understood `author` as a plain string or as a node with a `name`. Now recognized as well:
  - `"author": [{…}]` — an array, the usual way to credit more than one person. Previously the whole entry was skipped.
  - `"author": {"@id": "…"}` — a reference to a `Person` node elsewhere in `@graph`, which is what Yoast SEO and the Drupal schema modules emit. References are resolved through `@graph` (bare-string `@id`s included), cycles are broken, and an unresolvable reference no longer ends up displayed as the author's name.
  - `"publisher": {…}` — an organization behind the content now counts, which is what the criterion "Author/organization identifiable" has always claimed to check. It ranks below a credited author and below `meta[name="author"]`, and standalone `Organization` nodes are ignored — nearly every site emits one.

## [4.3.0] - 2026-08-19

### Added

- **llms-full.txt is now checked alongside llms.txt:** The "llms.txt file" criterion only ever requested `/llms.txt`. Sites that also publish the long-form companion `/llms-full.txt` — the full page text instead of a link index — got no credit for it and no mention in the panel. Both files are now fetched in parallel and the result names what was found: "llms.txt + llms-full.txt", "llms.txt (no llms-full.txt)", "Only llms-full.txt" or "Not found", in all six interface languages.
  - Scoring stays anchored on llms.txt, so no site loses points: llms.txt alone is still full credit, llms-full.txt on top adds nothing, and llms-full.txt *without* an llms.txt index now earns partial credit (0.5) instead of zero. The progress bar mirrors the score rather than counting files, so a site with a proper llms.txt does not read as half done.
  - The HTML report explains each of the four cases separately. Analyses stored before this version fall back to the previous present/absent wording.
  - Both requests share one fetch helper that rejects the HTML a SPA or a custom 404 page returns for unknown paths, so a soft 404 no longer counts as a file.

## [4.2.1] - 2026-08-19

### Fixed

- **Dates printed as plain text were not recognized:** The freshness check ("Date present") only read `<time datetime>`, three meta tags and schema.org `datePublished`/`dateModified`. Many sites — Drupal and WordPress themes in particular — print their update date as plain text in the footer, e.g. `<div class="footer-updated">Last updated: August 11, 2026</div>` on fisba.com. AI crawlers read that line without trouble, but the analyzer reported "no date found" and docked the points. A fourth extraction step now scans the DOM for visible dates: ISO (`2026-08-11`), English and German month names (`August 11, 2026`, `11. März 2026`, `Aug 3rd, 2025`) and numeric formats (`11.08.2026` day-first, `08/11/2026` month-first unless the first number rules that out).
  - To keep years in body copy from counting as a publication date, a candidate is only accepted when the text carries a date label (`last updated`, `published on`, `zuletzt aktualisiert`, `Stand:` …) or the element or its parent has a date-ish class or id (`footer-updated`, `post-date`, `lastmod` …). Only leaf elements with at most 160 characters are considered, identical days are deduplicated, and at most five text dates are collected.
  - Structured dates keep their priority: markup-based entries stay first in the list, so the value shown in the panel is unchanged wherever markup exists.

## [4.2.0] - 2026-08-19

### Added

- **AI crawler view — what a bot without JavaScript actually gets:** The analysis has always run on the rendered DOM, which is what a person sees after hydration. GPTBot, ClaudeBot and PerplexityBot do not execute JavaScript; they index the HTML the server sent. On client-rendered sites those are two very different documents, and the score was far too kind. Every live analysis now re-fetches the same URL without cookies and without running scripts and compares both versions: characters of text, headings, JSON-LD blocks, plus a list of the headings a crawler never sees. A collapsible panel under "Machine readability" shows the comparison, and a new sub-check ("Content without JavaScript") scores it. A fully server-rendered page gains points; a page assembled in the browser loses them.
  - Same-origin fetch from the page context, so still **no host permissions** and no install warning. Spoofing the User-Agent is deliberately out of scope: `fetch` forbids that header and `declarativeNetRequest` would require host permissions. Servers that cloak by user agent are therefore not detected.
  - A cookie-less fetch of a members-only page lands on a login form. That case is detected (401/403, redirect to a login URL, or a password field the logged-in page does not have), reported as "no statement possible" and left out of the scoring — it must never look like missing content.
  - The check degrades silently: a failed request, a non-HTML response or a server error leaves the analysis exactly as it was. The sitemap batch already works on raw HTML, so it carries no comparison and its scores are unchanged.
- Fourth local test page `testpage/spa.html`: an empty shell whose entire content (headings, text, JSON-LD) is built by JavaScript — demonstrates the new check end to end.

### Fixed

- **robots.txt was evaluated for the site root only:** The AI crawler check asked "is this bot blocked on `/`?" and ignored the path of the page being analyzed. A site with `Allow: /` and `Disallow: /blog/` was reported as fully open while a blog article was on screen. Rules are now matched against the analyzed URL (path plus query) per RFC 9309: the longest matching rule wins, `Allow` wins ties, and `*` wildcards and the ` end anchor are honored. The sitemap batch still fetches robots.txt once per domain but re-evaluates it for every URL.
- **Rules split across several groups for the same bot were partly ignored:** A robots.txt listing `User-agent: GPTBot` twice (a common way to write these files by hand) only ever used the first group. All groups of a bot are now merged, and having a group of its own still suppresses the `*` fallback.

## [4.1.0] - 2026-06-13

### Added

- **Heading outline in the panel:** A collapsible, indented H1–H6 outline (like a table of contents) sits under the "Content clarity" category. Each heading shows its level and text; wherever the hierarchy jumps a level (e.g. H2 → H4) the entry is marked red with a "Level skipped" note — turning the previously abstract "skipped levels" finding into a concrete "here it is". Uses a native `<details>` element (no extra JS) and appears only for a fresh/cached analysis, not for history-only re-renders.
- **Readability markers now show the band, not just the value:** On-page readability markers used to label every flagged passage "Hard to read (N LIX)" in one flat color. They now classify each passage into a five-band scale (LIX: <30 very easy / 30–40 easy / 40–50 medium / 50–60 hard / ≥60 very hard, with an equivalent Flesch mapping for non-German pages) and color it accordingly — green → lime → yellow → amber → red. So a passage at 48 LIX reads "Medium (48 LIX)" in yellow while one at 66 reads "Very hard (66 LIX)" in red, making the classification visible at a glance. Band labels are localized in all six languages.

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
