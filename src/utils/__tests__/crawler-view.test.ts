// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeCrawlerView, compareDocuments, extractText } from '../crawler-view';

const META = { httpStatus: 200, rawBytes: 1000 };

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

// Long enough that the "difference is noise" shortcut doesn't kick in
const LOREM = 'Sentence with enough words to matter. '.repeat(60);

describe('extractText', () => {
  it('ignores scripts, styles and the noscript notice', () => {
    const d = doc(`<body>
      <script>var hidden = "script text";</script>
      <style>.a { color: red }</style>
      <noscript>Please enable JavaScript</noscript>
      <p>Real content</p>
    </body>`);
    expect(extractText(d)).toBe('Real content');
  });

  it('ignores the extension own in-page badges', () => {
    const d = doc(`<body><p>Real content</p><div id="geoa-highlight-badges"><span>Missing alt text</span></div></body>`);
    expect(extractText(d)).toBe('Real content');
  });

  it('collapses whitespace', () => {
    expect(extractText(doc('<body><p>a\n\n   b</p></body>'))).toBe('a b');
  });
});

describe('compareDocuments', () => {
  it('reports ok when the crawler gets the same content', () => {
    const html = `<body><h1>Title</h1><p>${LOREM}</p></body>`;
    const result = compareDocuments(doc(html), doc(html), META);
    expect(result.status).toBe('ok');
    expect(result.coverage).toBe(1);
    expect(result.missingHeadings).toEqual([]);
  });

  it('reports js-only when the crawler gets an empty shell', () => {
    const rendered = doc(`<body><h1>Title</h1><p>${LOREM}</p></body>`);
    const raw = doc('<body><div id="root"></div></body>');
    const result = compareDocuments(rendered, raw, META);
    expect(result.status).toBe('js-only');
    expect(result.rawChars).toBe(0);
    expect(result.coverage).toBe(0);
    expect(result.rawHasH1).toBe(false);
    expect(result.renderedHasH1).toBe(true);
  });

  it('reports partial when roughly half the text needs JavaScript', () => {
    const rendered = doc(`<body><p>${LOREM}</p><p>${LOREM}</p></body>`);
    const raw = doc(`<body><p>${LOREM}</p></body>`);
    const result = compareDocuments(rendered, raw, META);
    expect(result.status).toBe('partial');
    expect(result.coverage).toBeGreaterThan(0.4);
    expect(result.coverage).toBeLessThan(0.6);
  });

  it('treats a small difference as noise, not as missing content', () => {
    const rendered = doc(`<body><p>${LOREM}</p><p>Cookie banner injected by a script</p></body>`);
    const raw = doc(`<body><p>${LOREM}</p></body>`);
    expect(compareDocuments(rendered, raw, META).status).toBe('ok');
  });

  it('lists the headings a crawler never sees', () => {
    const rendered = doc(
      `<body><h1>Shared</h1><h2>Client rendered</h2><h2>Also client rendered</h2><p>${LOREM}</p></body>`
    );
    const raw = doc('<body><h1>Shared</h1></body>');
    const result = compareDocuments(rendered, raw, META);
    expect(result.missingHeadings).toEqual(['Client rendered', 'Also client rendered']);
    expect(result.renderedHeadings).toBe(3);
    expect(result.rawHeadings).toBe(1);
  });

  it('caps the list of missing headings at five', () => {
    const many = Array.from({ length: 9 }, (_, i) => `<h2>Heading ${i}</h2>`).join('');
    const rendered = doc(`<body>${many}<p>${LOREM}</p></body>`);
    expect(compareDocuments(rendered, doc('<body></body>'), META).missingHeadings).toHaveLength(5);
  });

  it('counts JSON-LD blocks on both sides', () => {
    const rendered = doc(
      '<body><script type="application/ld+json">{}</script><script type="application/ld+json">{}</script></body>'
    );
    const raw = doc('<body></body>');
    const result = compareDocuments(rendered, raw, META);
    expect(result.renderedSchemaBlocks).toBe(2);
    expect(result.rawSchemaBlocks).toBe(0);
  });

  it('does not divide by zero on an empty rendered page', () => {
    const result = compareDocuments(doc('<body></body>'), doc('<body></body>'), META);
    expect(result.status).toBe('ok');
    expect(result.coverage).toBe(1);
  });
});

describe('analyzeCrawlerView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
      )
    );
  }

  function htmlResponse(html: string, init: Partial<Response> = {}) {
    return {
      ok: true,
      status: 200,
      url: 'https://example.com/page',
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: () => Promise.resolve(html),
      ...init,
    };
  }

  it('compares the fetched HTML with the rendered page', async () => {
    stubFetch(htmlResponse('<body><div id="root"></div></body>'));
    const rendered = doc(`<body><h1>Title</h1><p>${LOREM}</p></body>`);
    const result = await analyzeCrawlerView(rendered, 'https://example.com/page');
    expect(result?.status).toBe('js-only');
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/page',
      expect.objectContaining({ credentials: 'omit' })
    );
  });

  it('reports an auth wall on 403 instead of missing content', async () => {
    stubFetch(htmlResponse('', { ok: false, status: 403 }));
    const result = await analyzeCrawlerView(doc(`<body><p>${LOREM}</p></body>`), 'https://example.com/page');
    expect(result?.status).toBe('auth-wall');
  });

  it('reports an auth wall when the cookie-less fetch lands on a login form', async () => {
    stubFetch(htmlResponse('<body><form><input type="password"></form></body>'));
    const result = await analyzeCrawlerView(doc(`<body><p>${LOREM}</p></body>`), 'https://example.com/page');
    expect(result?.status).toBe('auth-wall');
  });

  it('reports an auth wall when the fetch is redirected to a login URL', async () => {
    stubFetch(htmlResponse('<body><p>Sign in to continue</p></body>', { url: 'https://example.com/login' }));
    const result = await analyzeCrawlerView(doc(`<body><p>${LOREM}</p></body>`), 'https://example.com/page');
    expect(result?.status).toBe('auth-wall');
  });

  it('does not cry auth wall when the rendered page has a password field too', async () => {
    stubFetch(htmlResponse(`<body><form><input type="password"></form><p>${LOREM}</p></body>`));
    const rendered = doc(`<body><form><input type="password"></form><p>${LOREM}</p></body>`);
    const result = await analyzeCrawlerView(rendered, 'https://example.com/page');
    expect(result?.status).toBe('ok');
  });

  it('stays silent on a failed request', async () => {
    stubFetch(new Error('network down'));
    expect(await analyzeCrawlerView(doc('<body></body>'), 'https://example.com/page')).toBeUndefined();
  });

  it('stays silent on a server error', async () => {
    stubFetch(htmlResponse('', { ok: false, status: 500 }));
    expect(await analyzeCrawlerView(doc('<body></body>'), 'https://example.com/page')).toBeUndefined();
  });

  it('stays silent when the response is not HTML', async () => {
    stubFetch(htmlResponse('{}', { headers: new Headers({ 'content-type': 'application/json' }) }));
    expect(await analyzeCrawlerView(doc('<body></body>'), 'https://example.com/page')).toBeUndefined();
  });
});
