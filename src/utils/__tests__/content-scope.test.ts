// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  extractHeadings,
  extractParagraphs,
  extractLists,
  extractFaqQuestions,
  countHiddenFaqAnswers,
  extractPageData,
  getContentScope,
} from '../dom-helpers';

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html lang="de-CH">${html}</html>`, 'text/html');
}

const LONG = (s: string) => `${s} ${'mit genug Text für einen echten Absatz. '.repeat(2)}`;

// Shape of economiesuisse.ch (Next.js + shadcn/Radix accordion, Tailwind
// classes only): site header with nav lists, breadcrumb nav inside <main>,
// H1 rendered as <h1><p>…</p></h1>, share box and newsletter teaser without
// semantic class names, closed accordion items whose region is empty and
// `hidden`, one open item with text, related-articles grid, footer lists.
const RADIX_PAGE = `
<head><title>Stromversorgung</title></head>
<body>
  <header class="sticky top-0">
    <nav><ul><li><a href="/de/aktuell">Aktuell</a></li><li><a href="/de/themen">Themen</a></li></ul></nav>
    <button type="button" id="radix-lang" aria-haspopup="menu" aria-expanded="false" data-state="closed">DE?</button>
  </header>
  <main>
    <div class="w-full">
      <h1 class="text-5xl"><p>Stromversorgung in der Schweiz: Fragen und Antworten</p></h1>
    </div>
    <nav aria-label="breadcrumb"><ol><li><a href="/de">Home</a></li><li>Energie</li></ol></nav>
    <div class="mx-auto">
      <section class="relative pt-0">
        <div class="flex flex-col">
          <h3 class="text-xl">Artikel teilen</h3>
          <div class="flex"><a href="https://www.facebook.com/sharer/sharer.php?u=" aria-label="Facebook">f</a></div>
          <a href="/de/person/jane"><p class="text-sm">${LONG('Bereichsleiterin Energie und Umwelt')}</p></a>
        </div>
      </section>
      <section class="pt-8">
        <p class="text-base">${LONG('Die Schweiz steht vor zentralen energiepolitischen Fragen.')}</p>
      </section>
      <div>
        <h2 class="text-2xl"><p><span>Unsere heutige Versorgung</span></p></h2>
        <div class="w-full" data-orientation="vertical">
          <div data-state="closed" data-orientation="vertical" class="border-b">
            <h3 data-state="closed" class="flex"><button type="button" aria-expanded="false" data-state="closed" id="t1"><span>Woher hat die Schweiz ihren Strom?</span></button></h3>
            <div data-state="closed" id="c1" hidden role="region" aria-labelledby="t1"></div>
          </div>
          <div data-state="closed" data-orientation="vertical" class="border-b">
            <h3 data-state="closed" class="flex"><button type="button" aria-expanded="false" data-state="closed" id="t2"><span>Ist Schweizer Strom klimaneutral?</span></button></h3>
            <div data-state="closed" id="c2" hidden role="region" aria-labelledby="t2"></div>
          </div>
          <div data-state="open" data-orientation="vertical" class="border-b">
            <h3 data-state="open" class="flex"><button type="button" aria-expanded="true" aria-controls="c3" data-state="open" id="t3"><span>Wie hoch ist das Blackout-Risiko?</span></button></h3>
            <div data-state="open" id="c3" role="region" aria-labelledby="t3"><p>${LONG('Das Risiko eines Blackouts ist gering.')}</p></div>
          </div>
          <div data-state="closed" data-orientation="vertical" class="border-b">
            <h3 data-state="closed" class="flex"><button type="button" aria-expanded="false" data-state="closed" id="t4"><span>Winterstrom im Überblick</span></button></h3>
            <div data-state="closed" id="c4" hidden role="region" aria-labelledby="t4"></div>
          </div>
        </div>
      </div>
    </div>
    <section class="relative pt-8">
      <div><h2 class="text-5xl">Passende Artikel</h2></div>
      <a href="/de/artikel/a"><h3>Ohne Kernkraft keine Versorgungssicherheit</h3></a>
      <p>${LONG('Teaser eines verwandten Artikels.')}</p>
    </section>
    <div class="mx-auto">
      <div><h2 class="text-5xl">Newsletter abonnieren</h2></div>
      <p>${LONG('Jetzt hier zum Newsletter eintragen.')}</p>
    </div>
  </main>
  <footer>
    <ul><li><a href="/de/impressum">Impressum</a></li></ul>
    <p>${LONG('Footer-Adresse und Kontaktangaben der Organisation.')}</p>
  </footer>
</body>`;

describe('content scope on a Radix/shadcn FAQ page', () => {
  const doc = parse(RADIX_PAGE);

  it('keeps headings of the content and drops header, share box, teaser grid and newsletter', () => {
    const texts = extractHeadings(doc).map((h) => h.text);
    expect(texts).toEqual([
      'Stromversorgung in der Schweiz: Fragen und Antworten',
      'Unsere heutige Versorgung',
      'Woher hat die Schweiz ihren Strom?',
      'Ist Schweizer Strom klimaneutral?',
      'Wie hoch ist das Blackout-Risiko?',
      'Winterstrom im Überblick',
    ]);
  });

  it('keeps body paragraphs and open answers, drops H1 copy, author card, teaser, newsletter and footer', () => {
    const paragraphs = extractParagraphs(doc);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatch(/^Die Schweiz steht vor zentralen/);
    expect(paragraphs[1]).toMatch(/^Das Risiko eines Blackouts/);
  });

  it('drops navigation, breadcrumb and footer lists', () => {
    expect(extractLists(doc)).toEqual([]);
  });

  it('detects accordion questions, including a heading without "?"', () => {
    expect(extractFaqQuestions(doc)).toEqual([
      'Woher hat die Schweiz ihren Strom?',
      'Ist Schweizer Strom klimaneutral?',
      'Wie hoch ist das Blackout-Risiko?',
      'Winterstrom im Überblick',
    ]);
  });

  it('ignores the language dropdown trigger in the header', () => {
    expect(extractFaqQuestions(doc)).not.toContain('DE?');
  });

  it('counts the closed items with an empty region as hidden answers', () => {
    expect(countHiddenFaqAnswers(doc)).toBe(3);
  });

  it('puts lang and faqAnswersHidden into the page data', async () => {
    const data = await extractPageData(doc, 'https://www.example.ch/de/faq', {
      llmsTxt: { exists: false, fullExists: false },
      robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
    });
    expect(data.lang).toBe('de');
    expect(data.faqAnswersHidden).toBe(3);
    expect(data.faqQuestions).toHaveLength(4);
  });
});

describe('content root selection', () => {
  it('prefers a single <article> over <main>', () => {
    const doc = parse(`<body><main><article><h1>Titel</h1><p>${LONG('Artikeltext')}</p></article>
      <div><p>${LONG('Ausserhalb des Artikels')}</p></div></main></body>`);
    expect(getContentScope(doc).root.tagName).toBe('ARTICLE');
    expect(extractParagraphs(doc)).toHaveLength(1);
  });

  it('widens the root when the H1 sits outside the article', () => {
    const doc = parse(`<body><main><h1>Titel</h1><article><h2>Abschnitt</h2></article></main></body>`);
    expect(extractHeadings(doc).map((h) => h.text)).toEqual(['Titel', 'Abschnitt']);
  });

  it('uses <main> on a listing page with several articles', () => {
    const doc = parse(`<body><main><h1>Blog</h1>
      <article><h2>Post A</h2></article><article><h2>Post B</h2></article></main></body>`);
    expect(getContentScope(doc).root.tagName).toBe('MAIN');
    expect(extractHeadings(doc)).toHaveLength(3);
  });

  it('keeps an article <header> with the title and byline', () => {
    // Only page-level header/footer are chrome (HTML-AAM banner/contentinfo).
    const doc = parse(`<body><article><header><h1>Titel</h1><p>${LONG('Lead im Artikelkopf')}</p></header>
      <footer><p>${LONG('Quellenangaben am Artikelende')}</p></footer></article></body>`);
    expect(extractHeadings(doc).map((h) => h.text)).toEqual(['Titel']);
    expect(extractParagraphs(doc)).toHaveLength(2);
  });

  it('still counts a page title H1 placed in the site header when the content has none', () => {
    const doc = parse(`<body><header><h1>Seitentitel</h1><nav><a href="/">Home</a></nav></header>
      <main><h2>Abschnitt</h2></main></body>`);
    expect(extractHeadings(doc).map((h) => h.text)).toEqual(['Seitentitel', 'Abschnitt']);
  });

  it('excludes asides and role=complementary inside the content', () => {
    const doc = parse(`<body><main><h1>T</h1><aside><ul><li>Promo</li></ul></aside>
      <div role="complementary"><p>${LONG('Seitenleiste')}</p></div><ul><li>Echt</li></ul></main></body>`);
    expect(extractLists(doc).map((l) => l.items[0])).toEqual(['Echt']);
    expect(extractParagraphs(doc)).toEqual([]);
  });
});

describe('class/id heuristics for boilerplate blocks', () => {
  it('drops newsletter, share, related and cookie blocks by class or id token', () => {
    const doc = parse(`<body><main><h1>T</h1>
      <div class="newsletter-signup"><p>${LONG('Newsletter')}</p></div>
      <div id="share_box"><ul><li>Facebook</li></ul></div>
      <section class="related"><h2>Mehr</h2></section>
      <div class="cookie-banner"><p>${LONG('Cookies')}</p></div>
      <p>${LONG('Inhalt')}</p></main></body>`);
    expect(extractParagraphs(doc)).toHaveLength(1);
    expect(extractLists(doc)).toEqual([]);
    expect(extractHeadings(doc).map((h) => h.text)).toEqual(['T']);
  });

  it('matches whole tokens only — "shared-layout" and "unrelated" stay content', () => {
    const doc = parse(`<body><main><div class="shared-layout unrelated"><h1>T</h1>
      <p>${LONG('Inhalt')}</p></div></main></body>`);
    expect(extractParagraphs(doc)).toHaveLength(1);
  });

  it('never treats the wrapper holding the H1 as boilerplate', () => {
    const doc = parse(`<body class="page-related"><main class="social-theme"><h1>T</h1>
      <p>${LONG('Inhalt')}</p></main></body>`);
    expect(extractParagraphs(doc)).toHaveLength(1);
  });

  it('does not swallow content that precedes a share heading', () => {
    // The block must *start* with the boilerplate heading.
    const doc = parse(`<body><main><div><h1>T</h1></div><div class="content">
      <p>${LONG('Haupttext ohne Zwischentitel')}</p><h3>Teilen</h3><a href="https://x.com/intent/tweet">X</a>
      </div></main></body>`);
    expect(extractParagraphs(doc)).toHaveLength(1);
  });
});

describe('FAQ answer containers', () => {
  it('applies the chrome exclusions to the global answer selectors', () => {
    const doc = parse(`<body><main><h1>T</h1></main>
      <footer><dl><dt>Adresse</dt><dd>${LONG('Bahnhofstrasse 1, 8001 Zürich')}</dd></dl></footer></body>`);
    expect(extractParagraphs(doc)).toEqual([]);
  });

  it('still finds FAQ answers rendered outside <main>', () => {
    const doc2 = parse(`<body><main><h1>T</h1></main>
      <div class="faq"><details><summary>Was ist das?</summary><div>${LONG('Eine Antwort')}</div></details></div></body>`);
    expect(extractParagraphs(doc2)).toHaveLength(1);
  });

  it('counts a <details> with an empty body as a hidden answer', () => {
    const doc = parse(`<body><main><details><summary>Was ist das?</summary> </details>
      <details><summary>Und das?</summary><p>Antwort.</p></details></main></body>`);
    expect(extractFaqQuestions(doc)).toEqual(['Was ist das?', 'Und das?']);
    expect(countHiddenFaqAnswers(doc)).toBe(1);
  });

  it('counts a trigger whose aria-controls target is missing as hidden', () => {
    const doc = parse(`<body><main><h3><button aria-expanded="false" aria-controls="nope">Gibt es das Panel?</button></h3></main></body>`);
    expect(extractFaqQuestions(doc)).toEqual(['Gibt es das Panel?']);
    expect(countHiddenFaqAnswers(doc)).toBe(1);
  });

  it('does not count a closed panel that still carries its text', () => {
    // `hidden` with text in the DOM is readable for crawlers
    const doc = parse(`<body><main><h3><button aria-expanded="false" aria-controls="p">Ist das sichtbar?</button></h3>
      <div id="p" role="region" hidden>Ja, im HTML.</div></main></body>`);
    expect(countHiddenFaqAnswers(doc)).toBe(0);
  });
});

describe('lang', () => {
  it('falls back to schema inLanguage without <html lang>', async () => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><head><script type="application/ld+json">{"@type":"WebPage","inLanguage":"fr-CH"}</script></head><body></body></html>`,
      'text/html'
    );
    const { extractLang } = await import('../dom-helpers');
    expect(extractLang(doc)).toBe('fr');
  });

  it('is undefined when nothing declares a language', async () => {
    const doc = new DOMParser().parseFromString('<!doctype html><html><body></body></html>', 'text/html');
    const { extractLang } = await import('../dom-helpers');
    expect(extractLang(doc)).toBeUndefined();
  });
});
