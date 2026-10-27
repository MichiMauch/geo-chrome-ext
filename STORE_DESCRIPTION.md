Paul AI GEO Analyzer — Check Whether AI Search Can Read, Understand and Quote Your Pages

More and more people get their answers from AI assistants and AI search instead of a list of links. Whether your page shows up in those answers depends on things you can check: Can the crawler read the content without JavaScript? Is it allowed in? Does the page state its facts clearly, name its sources and say who is behind it? Is the structured data complete?

Paul AI GEO Analyzer checks this for the page you are looking at. Click the toolbar icon, and the side panel shows a score from 0 to 30 across six categories, a prioritized list of what to fix, copy-paste code for each fix, and markers right on the page where the problems are. Everything is computed in your browser, from the page source. No account, no AI model in the loop, no running costs.

---

HOW IT WORKS

1. Open the page you want to check.
2. Click the Paul AI GEO Analyzer icon. The side panel opens and analyzes the page.
3. Read the score and the recommendations, sorted by impact. Each one says who can fix it (editorial team or web agency) and roughly how long it takes.
4. Copy the code snippet, or click "Show on page" to see the affected elements outlined on the page.
5. Fix the page, click the icon again, and see which findings are fixed and which are new.

---

WHAT THE ANALYSIS LOOKS AT

The analysis reads the main content of the page. Menus, footers, sidebars, share buttons, newsletter boxes and teaser lists are left out, so they cannot inflate the result. The page type (start page, article, product page) is detected, and checks that make no sense for a type are marked "not relevant" instead of failing.

Content Clarity & Structure (0–5)
- One clear H1 and a heading hierarchy without skipped levels, with an outline in the panel that marks every jump
- Paragraph length, subheadings and lists
- Readability in the language of the page: Flesch for English, LIX for all other languages

Answerability (0–5)
- Clear definitions and direct answers, including questions answered right below their heading
- Lists, enumerations and data tables
- Clearly separated thematic sections
- Question and definition patterns are recognized in German, English, French, Spanish, Portuguese and Italian

Trust & Sources (0–5)
- Author or organization behind the page
- Publication and update date, and whether readers can actually see it
- Links to real external sources (social profiles, share buttons and the site's own subdomains don't count)
- On start pages and product pages: whether the publisher is recognizable through structured data and links to imprint, contact and "About us"

Machine Readability (0–5)
- Schema.org structured data, checked for completeness per type, not just presence
- Product data on product pages: price, availability, identifiers, brand, ratings, shipping and returns
- Location data for local businesses: address, phone, opening hours, coordinates
- Entities, semantic HTML and internal linking with descriptive link texts
- robots.txt: whether search crawlers, on-demand fetchers and training crawlers of AI providers are allowed, weighted by what each type does, plus Content-Signal opt-outs
- Blocks by a CDN or firewall that robots.txt doesn't show
- XML sitemap, hreflang on multilingual pages, and llms.txt / llms-full.txt

AI Citation Readiness (0–5)
- Citable facts: numbers, percentages, measurements and "according to" statements
- FAQ sections, counted by questions that actually have an answer on the page
- Claims backed by sources
- The key information in the first 150 words

On-Page SEO (0–5)
- Page title and meta description
- Image alt texts
- Indexability, including noindex in the HTTP header and snippet limits that keep a page from being quoted
- Mobile viewport, canonical tag, Open Graph and Twitter Cards

---

WHAT A CRAWLER REALLY GETS

Many AI crawlers don't run JavaScript. They see the HTML the server sends, not the page you see in the browser. On sites that build their content with JavaScript, those are two very different documents.

Every analysis fetches the page a second time, without cookies and without scripts, and compares both versions: amount of text, headings, structured data, and a list of headings a crawler never sees. Pages behind a login are recognized and left out of the scoring.

The analysis also checks whether the server or CDN turns AI crawlers away, even when robots.txt allows them. Such a block is reported with a note to verify it, because the check imitates the crawler and cannot prove what the real one gets.

---

SCORE

The total ranges from 0 to 30:

- Excellent (25–30)
- Good (19–24)
- Needs improvement (12–18)
- Critical (0–11)

Each category is scored from 0 to 5, so you can see where the work is.

---

RECOMMENDATIONS YOU CAN ACT ON

- Sorted by impact. The most serious problems, such as an accidental noindex or missing structured data, come first. All recommendations are listed, the first five directly and the rest one click away.
- Each recommendation names who can fix it: the editorial team (text and CMS fields) or the web agency (template, server, configuration), with a rough effort estimate.
- "Show snippet" reveals ready-to-paste code (JSON-LD, HTML, robots.txt, llms.txt, meta tags), "Copy" puts it in your clipboard.
- "Show on page" outlines the affected elements on the page and explains each one with a short label, for example "This H4 follows an H2 and should be an H3", "Missing alt text", "Paragraph too long" or "Factual claim without a source link". Readability markers are colored from easy to very hard.

---

TRACK YOUR PROGRESS

- The score appears as a colored badge on the toolbar icon.
- A trend arrow shows how the score changed since the last analysis of the same page.
- After a round of fixes, the panel lists which criteria are now fixed and which newly fail.
- The history keeps up to 50 analyses per page, with a small trend chart.
- Unchanged pages are served from the cache. A refresh button forces a new analysis.

---

WHOLE SITES, NOT JUST PAGES

- Sitemap batch: reads the site's sitemap and analyzes up to 10 pages in the background, with live progress.
- Domain overview: every analyzed page of the domain with score, rating, trend and date, worst first, so you know where to start.

---

THE DETAILED REPORT

"Open detailed report" opens the full analysis in a new tab:

- An overview of all six categories at the top, the recommendations right after it, split into a list for the editorial team and one for the web agency.
- One line per criterion. A click opens what was found on this page, why it matters and how to fix it, in plain language.
- What changed since the last check.
- "Save as PDF" produces a print layout made for A4: a title page with score and categories, the recommendations with their code, then the criteria in detail, with page numbers. Useful for client reviews and handovers.

---

PRIVACY

- The analysis runs in your browser. Page contents never leave it.
- No permanent access to your websites: the extension uses Chrome's activeTab model and only reads the tab you click it on. No "read your data on all websites" warning.
- During an analysis, the extension only requests files from the site you are analyzing: the page itself (for the crawler view and the CDN check), robots.txt, the sitemap, llms.txt and llms-full.txt.
- Optional anonymous usage statistics: scores and check results only, no URLs, not even hashed. A one-time notice explains them, and you can switch them off in the panel footer at any time.
- No account, no sign-up, no subscription.

---

WHO IT IS FOR

- Editors and copywriters who want their articles to be found and quoted by AI search
- SEO specialists who add Generative Engine Optimization to their work
- Agencies that need a fast audit and a report to hand to clients
- Developers who want to verify structured data, semantic HTML, indexability and crawler access in one pass
- Site owners who want to know how ready their site is for AI search

---

WHAT IS GEO?

Generative Engine Optimization (GEO) means preparing web content so that AI search and large language models can understand, use and cite it. Much of it builds on classic SEO: a page that cannot be crawled or indexed won't appear in AI answers either. On top of that come clear structure, direct answers, visible sources and dates, complete structured data, and content a crawler can read without running JavaScript.

The interface is available in German, English, French, Spanish, Portuguese and Italian.

---

SUPPORT & FEEDBACK

Website and contact: https://geo.mauch.rocks

Feedback and feature ideas are welcome. If the extension helps you, a rating in the Chrome Web Store helps others find it.
