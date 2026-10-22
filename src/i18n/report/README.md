# Report texts

The HTML report explains every criterion in three parts. The texts live here,
one file per category, and are merged into the translations by `i18n.ts`.

| Part | Key | Source |
|---|---|---|
| What we found on this page | `ev_<criterion>_<case>` | `CategoryDetail.evidence` (key + params), set by the analyzer |
| Why it matters | `why_<criterion>` | static, one per criterion |
| How to fix it | `fix_<criterion>` or `CategoryDetail.fixKey` | static; shown only when the check is not fully met |

`<criterion>` is the criterion key without the `criterion_` prefix, e.g.
`why_schema` for `criterion_schema`.

## Audience

People who run a website but don't write code: communications, marketing,
editors. Every text must be understandable without knowing HTML.

## Rules

- **Evidence is concrete.** Name what was found on *this* page, with numbers
  and short examples: "Found: NewsArticle. Missing: FAQPage — the page has 52
  questions." Never just a score ("Score: 0%").
- **Explain jargon once, in passing.** "Schema.org (a hidden data block in the
  page that tells machines what the page is about)".
- **Why** says what an AI system or search engine does with it, in one or two
  sentences. Honest caveats belong here (e.g. Google only shows FAQ rich
  results for government and health sites since 2023).
- **Fix** is an action, and says who can do it: the editorial team in the CMS,
  or the web agency / developer in the template.
- Short sentences. No marketing language, no "crucial", "essential", "unlock".
- German: Swiss spelling (ss, not ß), formal "Sie", quotes «…».
- Placeholders `{name}` must exist in every language's version of a key.
- All six languages (en, de, fr, es, pt, it) carry exactly the same keys —
  the parity test fails otherwise.
