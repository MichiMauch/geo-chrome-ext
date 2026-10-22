// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  extractLinks,
  registrableDomain,
  extractSchemaData,
  extractMicrodata,
  parseRobotsTxt,
  extractPageData,
} from '../dom-helpers';
import { schemaTypesOf } from '../schema-types';

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html>${html}</html>`, 'text/html');
}

const PAGE_URL = 'https://www.economiesuisse.ch/de/artikel/faq';

describe('extractLinks', () => {
  it('keeps only http(s) links', () => {
    const doc = parse(`<body><main>
      <a href="tel:+41444213535">Tel</a><a href="mailto:a@b.ch">Mail</a>
      <a href="javascript:void(0)">JS</a><a href="data:text/plain,x">Data</a>
      <a href="#top">Top</a><a href="/de/kontakt">Kontakt</a><a href="https://admin.ch/x">Bund</a>
    </main></body>`);
    expect(extractLinks(doc, PAGE_URL).map((l) => l.text)).toEqual(['Kontakt', 'Bund']);
  });

  it('treats subdomains of the own site as internal', () => {
    const doc = parse(`<body><main>
      <a href="https://backend.economiesuisse.ch/files/a.pdf">PDF</a>
      <a href="https://economiesuisse.ch/">Apex</a>
      <a href="https://www.bfe.admin.ch/">BFE</a>
    </main></body>`);
    expect(extractLinks(doc, PAGE_URL).map((l) => [l.text, l.isExternal])).toEqual([
      ['PDF', false],
      ['Apex', false],
      ['BFE', true],
    ]);
  });

  it('marks links in site chrome, share widgets and /cdn-cgi/ as navigational', () => {
    const doc = parse(`<body>
      <header><a href="/de/aktuell">Aktuell</a></header>
      <main>
        <a href="https://www.iea.org/report">Quelle</a>
        <div class="share-buttons"><a href="https://example.com/x">Teilen</a></div>
        <div aria-label="Artikel teilen"><a href="https://example.org/y">Y</a></div>
        <a href="https://www.facebook.com/sharer/sharer.php?u=">FB</a>
        <a href="https://twitter.com/intent/tweet?url=">X</a>
        <a href="/cdn-cgi/l/email-protection#abc">[email protected]</a>
        <nav aria-label="breadcrumb"><a href="/de">Home</a></nav>
      </main>
      <aside><a href="/de/dossier">Dossier</a></aside>
      <footer><a href="https://www.instagram.com/x">Insta</a></footer>
    </body>`);
    const nav = Object.fromEntries(extractLinks(doc, PAGE_URL).map((l) => [l.text, l.isNavigational]));
    expect(nav).toEqual({
      Aktuell: true,
      Quelle: false,
      Teilen: true,
      Y: true,
      FB: true,
      X: true,
      '[email protected]': true,
      Home: true,
      Dossier: true,
      Insta: true,
    });
  });
});

describe('registrableDomain', () => {
  it.each([
    ['www.economiesuisse.ch', 'economiesuisse.ch'],
    ['backend.economiesuisse.ch', 'economiesuisse.ch'],
    ['shop.example.co.uk', 'example.co.uk'],
    ['example.com.au', 'example.com.au'],
    ['a.b.example.com', 'example.com'],
    ['localhost', 'localhost'],
    ['192.168.1.10', '192.168.1.10'],
  ])('%s → %s', (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });
});

describe('extractSchemaData normalization', () => {
  const withJsonLd = (...blocks: unknown[]) =>
    parse(
      `<head>${blocks
        .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
        .join('')}</head><body></body>`
    );

  it('turns a type array into "@type" (first) plus "@types"', () => {
    const [node] = extractSchemaData(withJsonLd({ '@type': ['NewsArticle', 'FAQPage'] }));
    expect(node['@type']).toBe('NewsArticle');
    expect(node['@types']).toEqual(['NewsArticle', 'FAQPage']);
  });

  it('strips schema.org prefixes', () => {
    const [node] = extractSchemaData(
      withJsonLd({ '@type': ['https://schema.org/Article', 'http://schema.org/WebPage', 'schema:Thing'] })
    );
    expect(node['@types']).toEqual(['Article', 'WebPage', 'Thing']);
  });

  it("uses '' for a node without type", () => {
    const [node] = extractSchemaData(withJsonLd({ name: 'x' }));
    expect(node['@type']).toBe('');
    expect(node['@types']).toEqual([]);
  });

  it('unwraps @graph inside a JSON-LD array', () => {
    const types = extractSchemaData(
      withJsonLd([{ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'Person' }] }])
    ).map((s) => s['@type']);
    expect(types).toEqual(['WebPage', 'Person']);
  });

  it('counts an identical node emitted twice once', () => {
    const node = { '@type': 'Article', headline: 'Same' };
    expect(extractSchemaData(withJsonLd(node, node))).toHaveLength(1);
  });

  it('keeps schemaTypesOf working on the normalized nodes', () => {
    const [node] = extractSchemaData(withJsonLd({ '@type': ['NewsArticle', 'FAQPage'] }));
    expect(schemaTypesOf(node)).toContain('FAQPage');
  });
});

describe('extractMicrodata', () => {
  it('yields exactly one node for one Microdata Article', () => {
    const doc = parse(`<body><article itemscope itemtype="https://schema.org/Article">
      <h1 itemprop="headline">T</h1><meta itemprop="datePublished" content="2026-01-02">
    </article></body>`);
    const nodes = extractMicrodata(doc);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ '@type': 'Article', headline: 'T', datePublished: '2026-01-02' });
  });

  it('keeps nested scopes as type-only nodes, once each', () => {
    const doc = parse(`<body><div itemscope itemtype="https://schema.org/FAQPage">
      <div itemprop="mainEntity" itemscope itemtype="https://schema.org/Question"><span itemprop="name">Q?</span></div>
    </div></body>`);
    const types = extractMicrodata(doc).map((s) => s['@type']);
    expect(types).toEqual(['FAQPage', 'Question']);
  });

  it('reads several itemtype URLs', () => {
    const doc = parse(`<body><div itemscope itemtype="https://schema.org/Article https://schema.org/NewsArticle"></div></body>`);
    expect(extractMicrodata(doc)[0]['@types']).toEqual(['Article', 'NewsArticle']);
  });
});

describe('parseRobotsTxt groups (RFC 9309)', () => {
  const BOTS = ['GPTBot', 'ClaudeBot'];

  it('does not end a group at a blank line between User-agent and its rules', () => {
    const txt = `User-agent: GPTBot

Disallow: /`;
    expect(parseRobotsTxt(txt, BOTS).allowedBots).toEqual({ GPTBot: false, ClaudeBot: true });
  });

  it('keeps several User-agent lines separated by blank lines in one group', () => {
    const txt = `User-agent: GPTBot

User-agent: ClaudeBot
Disallow: /private/`;
    const result = parseRobotsTxt(txt, BOTS, undefined, '/private/x');
    expect(result.blockedBots).toEqual(['GPTBot', 'ClaudeBot']);
  });

  it('starts a new group at a User-agent line after rules', () => {
    const txt = `User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Allow: /`;
    expect(parseRobotsTxt(txt, BOTS).allowedBots).toEqual({ GPTBot: false, ClaudeBot: true });
  });
});

describe('extractPageData origin', () => {
  it('fetches llms.txt from the analyzed page origin, not the window', async () => {
    const requested: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response('', { status: 404 });
    }) as typeof fetch;
    try {
      await extractPageData(parse('<body></body>'), 'https://other.example.org/page');
    } finally {
      globalThis.fetch = original;
    }
    expect(requested).toContain('https://other.example.org/llms.txt');
    expect(requested).toContain('https://other.example.org/robots.txt');
  });
});

describe('source links from extractLinks', () => {
  it('counts a protocol-relative external link as a source', async () => {
    const { extractLinks } = await import('../dom-helpers');
    const { getSourceLinks } = await import('../source-links');
    const doc = new DOMParser().parseFromString(
      '<main><p>Gemäss <a href="//www.bfe.admin.ch/statistik">BFE-Statistik</a> sind es 60 %.</p></main>',
      'text/html'
    );
    const links = extractLinks(doc, 'https://www.economiesuisse.ch/de/artikel/x');
    expect(links[0].href).toBe('https://www.bfe.admin.ch/statistik');
    expect(getSourceLinks(links)).toHaveLength(1);
  });
});

describe('readable text', () => {
  it('keeps words apart across block elements in links and answer panels', async () => {
    const { extractLinks, extractParagraphs } = await import('../dom-helpers');
    const doc = new DOMParser().parseFromString(
      `<main><h1>Titel</h1>
        <a href="/de/team/lukas-federer"><div>Lukas Federer</div><div>Bereichsleiter Energie</div></a>
        <div data-state="open"><h3><button aria-expanded="true" aria-controls="p1" id="t1">Frage?</button></h3>
          <div id="p1" role="region" aria-labelledby="t1"><div>Rund 60 Prozent stammen aus Wasserkraft.</div><div>Der Rest aus Kernenergie.</div></div></div>
      </main>`,
      'text/html'
    );
    expect(extractLinks(doc, 'https://www.example.ch/')[0].text).toBe('Lukas Federer Bereichsleiter Energie');
    expect(extractParagraphs(doc)).toContain('Rund 60 Prozent stammen aus Wasserkraft. Der Rest aus Kernenergie.');
  });
});
