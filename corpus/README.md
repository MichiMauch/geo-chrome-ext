# Reference corpus

Real pages the analysis is checked against, so a rule change shows which
pages move and how. Run with `npm run corpus`.

- `pages.json` — the pages: id, URL, what kind of page it is and why it is in
  the set. Committed.
- `snapshots/<id>/` — the raw HTML plus robots.txt / llms.txt as fetched on a
  given day (`npm run corpus:fetch`). **Not committed**: the repository is
  public and the pages belong to their owners. The fetch only downloads
  pages that have no snapshot yet, so results stay stable; delete a folder
  to refresh it.
- `expected/<id>.json` — the analysis result per page (scores, every
  criterion, recommendations). Committed. Written by
  `npm run corpus:update`; review the diff before committing.
- `src/__corpus__/known-findings.test.ts` — findings checked by hand on the
  live page, as explicit assertions.

The analysis runs on the raw HTML, the way a crawler without JavaScript (and
the sitemap batch) sees the page. Live-only checks (crawler comparison,
sitemap, bot probe) are not part of it. The clock is set to the fetch date,
so date freshness does not drift.

Without snapshots the corpus tests are skipped.
