// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeHighlightTargets } from '../highlight-targets';
import { GEO_CONFIG } from '../../config/geo-config';
import { setLang } from '../i18n';
import type { HighlightTarget } from '../../types/analysis';

const LONG_THRESHOLD = GEO_CONFIG.contentClarity.scoring.paragraphLengthChars.ok;

const ALL_KEYS = new Set([
  'images_missing_alts',
  'bad_hierarchy',
  'low_scanability',
  'no_h1',
  'low_readability',
  'no_sourced_claims',
  'no_key_info_upfront',
]);
const ELEMENT_ERROR_KEYS = new Set([
  'images_missing_alts',
  'bad_hierarchy',
  'low_scanability',
  'no_h1',
  'low_readability',
  'no_sourced_claims',
]);

function setBody(html: string) {
  document.body.innerHTML = html;
}

function resolve(targets: HighlightTarget[]): Element[] {
  return targets.map((target) => {
    const el = document.querySelector(target.selector);
    expect(el, `selector should resolve: ${target.selector}`).not.toBeNull();
    expect(target.label.length, 'label must not be empty').toBeGreaterThan(0);
    return el!;
  });
}

describe('computeHighlightTargets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLang('en');
  });

  it('runs no collectors when nothing fired', () => {
    setBody('<h1>Top</h1><h4>Jump</h4><img src="a.png">');
    expect(computeHighlightTargets(document, new Set())).toEqual({});
  });

  it('returns an empty map for a clean page', () => {
    setBody(`
      <article>
        <h1>A perfectly fine title</h1>
        <h2>Sub</h2>
        <p>Short paragraph with enough characters to count.</p>
        <img src="a.png" alt="described">
        <img src="b.png" alt="">
      </article>
    `);
    expect(computeHighlightTargets(document, ELEMENT_ERROR_KEYS)).toEqual({});
  });

  describe('images_missing_alts', () => {
    it('targets images without alt attribute, mirroring extractImages', () => {
      setBody(`
        <img src="no-alt.png">
        <img src="with-alt.png" alt="ok">
        <img src="decorative.png" alt="">
        <img data-src="lazy.png">
        <img>
      `);
      const targets = computeHighlightTargets(document, ALL_KEYS)['images_missing_alts'];
      const els = resolve(targets);
      // no-alt.png + lazy.png; alt="" is decorative, no src doesn't count
      expect(els).toHaveLength(2);
      expect(els.map((e) => e.getAttribute('src') || e.getAttribute('data-src'))).toEqual([
        'no-alt.png',
        'lazy.png',
      ]);
    });
  });

  describe('bad_hierarchy', () => {
    it('targets headings that skip a level, explaining element, context and missing level', () => {
      setBody('<h1>A perfectly fine title</h1><h3>Skipped h2</h3><h4>Fine after h3</h4>');
      const targets = computeHighlightTargets(document, ALL_KEYS)['bad_hierarchy'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(els[0].tagName).toBe('H3');
      expect(targets[0].label).toContain('H3'); // what the element is
      expect(targets[0].label).toContain('H1'); // what it follows
      expect(targets[0].label).toContain('H2'); // what it should be
    });

    it('targets every h1 after the first with a distinct label', () => {
      setBody('<h1>First main title</h1><h2>Sub</h2><h1>Second main title</h1>');
      const targets = computeHighlightTargets(document, ALL_KEYS)['bad_hierarchy'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(els[0].textContent).toBe('Second main title');
    });

    it('ignores empty headings like extractHeadings does', () => {
      setBody('<h1>A perfectly fine title</h1><h2>  </h2><h3>After h1 and empty h2</h3>');
      // Visible sequence is h1 → h3 (empty h2 is filtered) = one skip
      const targets = computeHighlightTargets(document, ALL_KEYS)['bad_hierarchy'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(els[0].tagName).toBe('H3');
    });
  });

  describe('low_scanability', () => {
    it('targets paragraphs above the configured length tier and reports the length', () => {
      const long = 'x'.repeat(LONG_THRESHOLD + 1);
      const short = 'A short but countable paragraph text.';
      setBody(`<main><p>${short}</p><p>${long}</p></main>`);
      const targets = computeHighlightTargets(document, ALL_KEYS)['low_scanability'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(els[0].textContent).toBe(long);
      expect(targets[0].label).toContain(String(LONG_THRESHOLD + 1));
    });

    it('scopes to article/main like extractParagraphs', () => {
      const long = 'x'.repeat(LONG_THRESHOLD + 1);
      setBody(`<main><p>Short enough paragraph in main.</p></main><p>${long}</p>`);
      // The long paragraph sits outside <main> → not part of the analysis
      expect(computeHighlightTargets(document, ALL_KEYS)['low_scanability']).toBeUndefined();
    });

    it('dedups identical paragraph texts like extractParagraphs', () => {
      const long = 'y'.repeat(LONG_THRESHOLD + 1);
      setBody(`<main><p>${long}</p><p>${long}</p></main>`);
      const targets = computeHighlightTargets(document, ALL_KEYS)['low_scanability'];
      expect(targets).toHaveLength(1);
    });
  });

  describe('no_h1', () => {
    it('flags a too-short h1 with length and minimum', () => {
      setBody('<h1>GEO</h1><p>Some paragraph that counts for the page.</p>');
      const targets = computeHighlightTargets(document, ALL_KEYS)['no_h1'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(targets[0].label).toContain('3');
      expect(targets[0].label).toContain(String(GEO_CONFIG.contentClarity.thresholds.h1MinLength));
    });

    it('flags a too-long h1', () => {
      setBody(`<h1>${'Very long title '.repeat(12)}</h1>`);
      const targets = computeHighlightTargets(document, ALL_KEYS)['no_h1'];
      expect(targets).toHaveLength(1);
      expect(targets[0].label).toContain(String(GEO_CONFIG.contentClarity.thresholds.h1MaxLength));
    });

    it('flags duplicate good-length h1s (all but the first)', () => {
      setBody('<h1>First good title</h1><h1>Second good title</h1>');
      const targets = computeHighlightTargets(document, ALL_KEYS)['no_h1'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(els[0].textContent).toBe('Second good title');
    });

    it('yields no targets when no h1 exists', () => {
      setBody('<h2>Only a subtitle</h2>');
      expect(computeHighlightTargets(document, ALL_KEYS)['no_h1']).toBeUndefined();
    });
  });

  describe('low_readability', () => {
    afterEach(() => setLang('en'));

    it('marks hard paragraphs with the formula value, leaving easy ones alone (LIX/de)', () => {
      setLang('de');
      const hard =
        'Die Umsetzungsverantwortlichen berücksichtigen ausschliesslich diejenigen Optimierungsmassnahmen, welche die Suchmaschinenkompatibilität nachhaltig gewährleisten und gleichzeitig sämtliche Barrierefreiheitsanforderungen vollumfänglich erfüllen.';
      const easy = 'Das geht gut. Wir sehen das oft. Es hilft uns sehr. Alle mögen das Tool gern.';
      setBody(`<main><p>${easy}</p><p>${hard}</p></main>`);
      const targets = computeHighlightTargets(document, ALL_KEYS)['low_readability'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(els[0].textContent).toBe(hard);
      expect(targets[0].label).toContain('LIX');
    });
  });

  describe('no_sourced_claims', () => {
    it('marks fact paragraphs without citation or external link', () => {
      setBody(`<main>
        <p>Laut einer Untersuchung steigen die Werte um 42 Prozent jedes Jahr deutlich an.</p>
        <p>Im Jahr 2025 wuchs der Markt stark, wie <a href="https://example.org/studie">die Studie</a> belegt.</p>
        <p>Rund 80% der Nutzer bestätigen das (Quelle: Branchenreport zur Marktentwicklung).</p>
        <p>Ein Absatz ohne jede Faktenaussage, einfach nur beschreibender Fliesstext hier.</p>
      </main>`);
      const targets = computeHighlightTargets(document, ALL_KEYS)['no_sourced_claims'];
      const els = resolve(targets);
      // Only the first paragraph: facts without link and without citation pattern
      expect(els).toHaveLength(1);
      expect(els[0].textContent).toContain('42 Prozent');
    });

    it('treats internal links as non-sources', () => {
      setBody(`<main>
        <p>Laut Erhebung von 2024 nutzen viele Teams das Werkzeug, siehe <a href="/details">Details</a>.</p>
      </main>`);
      const targets = computeHighlightTargets(document, ALL_KEYS)['no_sourced_claims'];
      expect(targets).toHaveLength(1);
    });
  });

  describe('no_key_info_upfront', () => {
    it('marks exactly the first countable paragraph as the place for the key statement', () => {
      setBody(`<article>
        <p>tiny</p>
        <p>The very first real paragraph of the page content area.</p>
        <p>The second real paragraph follows after it with more text.</p>
      </article>`);
      const targets = computeHighlightTargets(document, ALL_KEYS)['no_key_info_upfront'];
      const els = resolve(targets);
      expect(els).toHaveLength(1);
      expect(els[0].textContent).toContain('very first real paragraph');
    });

    it('yields no target without countable paragraphs', () => {
      setBody('<article><p>tiny</p></article>');
      expect(computeHighlightTargets(document, ALL_KEYS)['no_key_info_upfront']).toBeUndefined();
    });
  });

  it('all returned selectors resolve to exactly one element', () => {
    const long = 'z'.repeat(LONG_THRESHOLD + 1);
    setBody(`
      <h1>One</h1><h4>Jump</h4>
      <main><p>${long}</p><p>Laut Studie sind 42 Prozent betroffen und mehr.</p></main>
      <img src="a.png"><img src="b.png">
    `);
    const targets = computeHighlightTargets(document, ALL_KEYS);
    Object.values(targets)
      .flat()
      .forEach((target) => {
        expect(document.querySelectorAll(target.selector)).toHaveLength(1);
      });
  });
});
