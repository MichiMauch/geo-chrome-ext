import type { HighlightTarget } from '../types/analysis';
import { cssPath } from './selector';
import { GEO_CONFIG } from '../config/geo-config';
import { computeReadabilityScore, readabilityBand } from './readability';
import { getLang, t } from './i18n';

// Maps recommendation keys to the page elements they refer to, as CSS
// selectors plus a localized per-element label (rendered as a badge next to
// the marker, so the user sees WHY each element is highlighted). Runs in the
// content script right after the analysis, so selectors and labels describe
// the exact DOM state the scores were computed from.
//
// Collectors only run for recommendations the analysis actually fired
// (`fired`), so they may assume "the check failed" and don't have to
// re-derive the pass/fail decision. Each collector MUST mirror the
// corresponding extract/analyzer logic (same queries, same filters) —
// otherwise highlights and scores diverge. The mirrored source is noted on
// every collector.

export type HighlightTargets = Record<string, HighlightTarget[]>;

export function computeHighlightTargets(
  doc: Document,
  fired: ReadonlySet<string>
): HighlightTargets {
  const targets: HighlightTargets = {};
  const add = (key: string, collect: () => HighlightTarget[]) => {
    if (!fired.has(key)) return;
    const found = collect();
    if (found.length > 0) targets[key] = found;
  };

  add('images_missing_alts', () => collectImagesWithoutAlt(doc));
  add('bad_hierarchy', () => collectHierarchyBreaks(doc));
  add('low_scanability', () => collectLongParagraphs(doc));
  add('no_h1', () => collectH1Issues(doc));
  add('low_readability', () => collectHardParagraphs(doc));
  add('no_sourced_claims', () => collectUnsourcedClaims(doc));
  add('no_key_info_upfront', () => collectKeyInfoSpot(doc));

  return targets;
}

// Mirrors extractParagraphs() (dom-helpers.ts) scoping and filters:
// article/main/body scope, >30 chars after whitespace collapse, dedup.
// Shared base for all paragraph-level collectors.
function countableParagraphs(doc: Document): { el: Element; text: string }[] {
  const mainContent =
    doc.querySelector('article') || doc.querySelector('main') || doc.body;
  if (!mainContent) return [];

  const seen = new Set<string>();
  const result: { el: Element; text: string }[] = [];
  mainContent.querySelectorAll('p').forEach((p) => {
    const text = (p.textContent || '').trim().replace(/\s+/g, ' ');
    if (text.length <= 30 || seen.has(text)) return;
    seen.add(text);
    result.push({ el: p, text });
  });
  return result;
}

// Mirrors extractImages() (dom-helpers.ts): only imgs with src/data-src
// count; a missing alt attribute is the issue (alt="" is decorative and ok).
function collectImagesWithoutAlt(doc: Document): HighlightTarget[] {
  return Array.from(doc.querySelectorAll('img'))
    .filter((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      return src !== '' && !img.hasAttribute('alt');
    })
    .map((img) => ({ selector: cssPath(img), label: t('hl_missing_alt') }));
}

// Mirrors extractHeadings() (dom-helpers.ts) for the element set and
// ContentClarityAnalyzer.evaluateHeadingHierarchy for the issues: headings
// that skip a level vs. the previous heading, plus every H1 after the first.
function collectHierarchyBreaks(doc: Document): HighlightTarget[] {
  const headings = Array.from(
    doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
  ).filter((h) => (h.textContent || '').trim().length > 0);

  const result: HighlightTarget[] = [];
  const flagged = new Set<Element>();
  let h1Seen = false;

  for (let i = 0; i < headings.length; i++) {
    const level = parseInt(headings[i].tagName[1], 10);
    if (level === 1 && h1Seen && !flagged.has(headings[i])) {
      flagged.add(headings[i]);
      result.push({ selector: cssPath(headings[i]), label: t('hl_extra_h1') });
    }
    if (level === 1) h1Seen = true;

    if (i > 0 && !flagged.has(headings[i])) {
      const prevLevel = parseInt(headings[i - 1].tagName[1], 10);
      if (level - prevLevel > 1) {
        flagged.add(headings[i]);
        result.push({
          selector: cssPath(headings[i]),
          // e.g. "This H3 follows an H1 and should be an H2": names what the
          // element is, what it follows, and the level it should have.
          label: t('hl_heading_jump')
            .replace('{to}', String(level))
            .replace('{from}', String(prevLevel))
            .replace('{mid}', String(prevLevel + 1)),
        });
      }
    }
  }

  return result;
}

// Flags the paragraphs whose length drags the scanability average over the
// "ok" tier of GEO_CONFIG.contentClarity.scoring.paragraphLengthChars
// (mirrors ContentClarityAnalyzer.evaluateScanability's length tiers).
function collectLongParagraphs(doc: Document): HighlightTarget[] {
  const threshold = GEO_CONFIG.contentClarity.scoring.paragraphLengthChars.ok;
  return countableParagraphs(doc)
    .filter(({ text }) => text.length > threshold)
    .map(({ el, text }) => ({
      selector: cssPath(el),
      label: t('hl_long_paragraph').replace('{n}', String(text.length)),
    }));
}

// Mirrors ContentClarityAnalyzer check 1 (h1 count + length thresholds from
// GEO_CONFIG.contentClarity.thresholds). Runs when 'no_h1' fired, i.e. there
// is no single good H1: flags too-short/too-long H1s and duplicates. A page
// with zero H1s yields no targets — there is nothing to mark.
function collectH1Issues(doc: Document): HighlightTarget[] {
  const { h1MinLength, h1MaxLength } = GEO_CONFIG.contentClarity.thresholds;
  const h1s = Array.from(doc.querySelectorAll('h1')).filter(
    (h) => (h.textContent || '').trim().length > 0
  );

  const result: HighlightTarget[] = [];
  h1s.forEach((h1, index) => {
    const len = (h1.textContent || '').trim().length;
    if (len < h1MinLength) {
      result.push({
        selector: cssPath(h1),
        label: t('hl_h1_too_short')
          .replace('{n}', String(len))
          .replace('{min}', String(h1MinLength)),
      });
    } else if (len > h1MaxLength) {
      result.push({
        selector: cssPath(h1),
        label: t('hl_h1_too_long')
          .replace('{n}', String(len))
          .replace('{max}', String(h1MaxLength)),
      });
    } else if (index > 0) {
      result.push({ selector: cssPath(h1), label: t('hl_extra_h1') });
    }
  });
  return result;
}

// Mirrors ContentClarityAnalyzer check 4: same formula choice (Flesch/LIX via
// computeReadabilityScore + UI language) and the same readabilityScoreMin
// threshold, applied per paragraph to find the ones dragging the page down.
function collectHardParagraphs(doc: Document): HighlightTarget[] {
  const minScore = GEO_CONFIG.contentClarity.thresholds.readabilityScoreMin;
  const lang = getLang();

  const result: HighlightTarget[] = [];
  countableParagraphs(doc).forEach(({ el, text }) => {
    const readability = computeReadabilityScore([text], lang);
    if (readability === null || readability.score >= minScore) return;
    const value = `${Math.round(readability.raw)} ${readability.formula === 'lix' ? 'LIX' : 'Flesch'}`;
    // Label and color follow the passage's readability band, so the marker
    // shows WHERE on the scale it sits (e.g. "Medium (48 LIX)" amber vs.
    // "Very hard (66 LIX)" red) instead of a flat "Hard to read".
    const { i18nKey, color } = readabilityBand(readability.raw, readability.formula);
    result.push({
      selector: cssPath(el),
      label: `${t(i18nKey)} (${value})`,
      color,
    });
  });
  return result;
}

// AiCitationAnalyzer.evaluateSourcedClaims scores the page globally
// (citation patterns + external links). The per-element interpretation:
// paragraphs that contain a fact pattern (same patterns as the analyzer)
// but neither a citation pattern nor an external link — exactly the claims
// that lower the sourced-claims score.
function collectUnsourcedClaims(doc: Document): HighlightTarget[] {
  const factPatterns = GEO_CONFIG.aiCitation.patterns.facts;
  const citationPatterns = GEO_CONFIG.aiCitation.patterns.citations;
  const host = doc.location?.hostname ?? '';

  const hasExternalLink = (el: Element): boolean =>
    Array.from(el.querySelectorAll('a[href]')).some((a) => {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
      try {
        // Mirrors extractLinks(): external = different hostname.
        return new URL(href, doc.baseURI).hostname !== host;
      } catch {
        return false;
      }
    });

  return countableParagraphs(doc)
    .filter(
      ({ el, text }) =>
        factPatterns.some((p) => p.test(text)) &&
        !citationPatterns.some((p) => p.test(text)) &&
        !hasExternalLink(el)
    )
    .map(({ el }) => ({
      selector: cssPath(el),
      label: t('hl_unsourced_claim'),
    }));
}

// AiCitationAnalyzer.evaluateKeyInfoUpfront checks the first paragraphs for
// an upfront definition. Unlike the other collectors this marks the PLACE
// where something is missing (rendered with the 'info' style, dashed blue),
// not a broken element: the first content paragraph, where the key statement
// belongs.
function collectKeyInfoSpot(doc: Document): HighlightTarget[] {
  const first = countableParagraphs(doc)[0];
  if (!first) return [];
  return [{ selector: cssPath(first.el), label: t('hl_key_info') }];
}
