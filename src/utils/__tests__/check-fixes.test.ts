// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  extractAuthorInfo,
  extractDates,
  extractQuestionAnswers,
  isWithinLastYear,
} from '../dom-helpers';
import { detectPageType } from '../page-type';
import type { PageData } from '../../types/analysis';

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html>${html}</html>`, 'text/html');
}

const TEXT = 'Wir begleiten Unternehmen seit vielen Jahren bei der Planung und Umsetzung ihrer Projekte.';

describe('Fragen ohne Fragezeichen', () => {
  it('zählt gewöhnliche Zwischentitel mit Fragewort nicht als Frage', () => {
    const doc = parse(`<body><main><h1>Agentur</h1>
      <h2>Was wir bieten</h2><p>${TEXT}</p>
      <h2>Wie wir arbeiten</h2><p>${TEXT} Mehr.</p>
      <h2>Warum ist das wichtig?</h2><p>${TEXT} Noch mehr.</p></main></body>`);
    expect(extractQuestionAnswers(doc).map((q) => q.question)).toEqual(['Warum ist das wichtig?']);
  });

  it('zählt ein Fragewort ohne Fragezeichen innerhalb eines FAQ-Blocks', () => {
    const doc = parse(`<body><main><h1>Hilfe</h1>
      <div class="faq"><h3>Wie man ein Konto eröffnet</h3><p>${TEXT}</p></div></main></body>`);
    expect(extractQuestionAnswers(doc).map((q) => q.question)).toEqual(['Wie man ein Konto eröffnet']);
  });
});

describe('Datum der Seite', () => {
  it('ignoriert Daten in Seitenleiste und Teaser-Links', () => {
    const doc = parse(`<body><main><article><h1>Alter Artikel</h1>
      <time datetime="2019-03-01">1.3.2019</time><p>${TEXT}</p>
      <a href="/neu"><time datetime="2026-01-05">5.1.2026</time> Neuer Beitrag</a></article></main>
      <aside><h3>Neuste News</h3><time datetime="2026-01-10">10.1.2026</time></aside></body>`);
    expect(extractDates(doc).map((d) => d.date.toISOString().slice(0, 10))).toEqual(['2019-03-01']);
  });

  it('behält ein Aktualisierungsdatum im Seitenfuss', () => {
    const doc = parse(`<body><main><h1>Seite</h1><p>${TEXT}</p></main>
      <footer><span>Zuletzt aktualisiert: 11. August 2025</span></footer></body>`);
    expect(extractDates(doc).map((d) => d.source)).toEqual(['text']);
  });

  it('verwirft Daten in der Zukunft', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const doc = parse(`<body><main><h1>Event</h1><time datetime="${future}">bald</time><p>${TEXT}</p></main></body>`);
    expect(extractDates(doc)).toEqual([]);
    expect(isWithinLastYear(new Date(future))).toBe(false);
  });
});

describe('Autor', () => {
  it('nimmt keinen Kommentar-Autor als Seitenautor', () => {
    const doc = parse(`<body><article><h1>Beitrag</h1><p>${TEXT}</p>
      <section id="comments"><div class="comment-author vcard">Peter Muster</div><p>Toll!</p></section>
      </article></body>`);
    expect(extractAuthorInfo(doc)).toBeNull();
  });

  it('erkennt die Byline weiterhin', () => {
    const doc = parse(`<body><article><h1>Beitrag</h1><div class="author-name">Jana Beispiel</div>
      <p>${TEXT}</p></article></body>`);
    expect(extractAuthorInfo(doc)).toEqual({ name: 'Jana Beispiel', source: 'dom' });
  });
});

describe('Startseite mit Sprachpräfix', () => {
  const type = (url: string) =>
    detectPageType({ url, schema: [], openGraph: {}, meta: {} } as unknown as PageData);

  it.each(['https://x.ch/', 'https://x.ch/de/', 'https://x.ch/fr', 'https://x.ch/de-ch/', 'https://x.ch/en/index.html'])(
    '%s ist eine Startseite',
    (url) => expect(type(url)).toBe('homepage')
  );

  it.each(['https://x.ch/ai', 'https://x.ch/de/artikel', 'https://x.ch/deutsch'])(
    '%s ist keine Startseite',
    (url) => expect(type(url)).toBe('other')
  );
});

describe('Fliesstext ohne <p>', () => {
  it('erfasst Text in div-Blättern, aber keine Labels', async () => {
    const { extractParagraphs } = await import('../dom-helpers');
    const doc = parse(`<body><main><h1>Seite</h1>
      <div class="text">${TEXT} Und noch ein zweiter Satz zum Thema.</div>
      <div class="meta">5 Minuten Lesezeit</div>
      <div><p>${TEXT} Mit p.</p></div>
      <div class="card"><a href="/x"><div>${TEXT} Teaser im Link.</div></a></div></main></body>`);
    expect(extractParagraphs(doc)).toEqual([
      `${TEXT} Und noch ein zweiter Satz zum Thema.`,
      `${TEXT} Mit p.`,
    ]);
  });
});

describe('X-Robots-Tag', async () => {
  const { parseXRobotsTag, withXRobotsTag } = await import('../x-robots-tag');
  const base = { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null };

  it('liest allgemeine und bot-spezifische Anweisungen', () => {
    expect(parseXRobotsTag('noindex, nofollow')).toEqual(['noindex', 'nofollow']);
    expect(parseXRobotsTag('googlebot: noindex, nofollow')).toEqual(['noindex', 'nofollow']);
    expect(parseXRobotsTag('otherbot: noindex, nofollow')).toEqual([]);
    expect(parseXRobotsTag('max-snippet: 20, GPTBot: noindex')).toEqual(['max-snippet: 20', 'noindex']);
  });

  it('macht die Seite per Header nicht indexierbar', () => {
    const merged = withXRobotsTag(base, 'noindex');
    expect(merged.hasNoIndex).toBe(true);
    expect(merged.headerContent).toBe('noindex');
    expect(withXRobotsTag(base, null)).toBe(base);
  });
});

describe('robots.txt mit Serverfehler', () => {
  it('gilt nach RFC 9309 als komplette Sperre', async () => {
    const { checkRobotsTxt } = await import('../dom-helpers');
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('oops', { status: 503 })) as typeof fetch;
    try {
      const r = await checkRobotsTxt(['GPTBot', 'ClaudeBot'], 'https://x.ch', '/');
      expect(r.unreachable).toBe(true);
      expect(r.blockedBots).toEqual(['GPTBot', 'ClaudeBot']);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('404 erlaubt weiterhin alles', async () => {
    const { checkRobotsTxt } = await import('../dom-helpers');
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    try {
      const r = await checkRobotsTxt(['GPTBot'], 'https://x.ch', '/');
      expect(r.blockedBots).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('Snippet-Einschränkungen', async () => {
  const { extractRobotsMeta } = await import('../dom-helpers');
  const { withXRobotsTag } = await import('../x-robots-tag');
  const { OnPageSeoAnalyzer } = await import('../../analyzers/on-page-seo');
  const index = (robotsMeta: PageData['robotsMeta']) => {
    const page = {
      url: 'https://x.ch/a', headings: [], paragraphs: [], lists: [], links: [], schema: [], images: [],
      meta: { title: '', description: '' }, openGraph: {}, twitterCard: {}, robotsMeta,
      viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: '' },
      canonical: { href: null },
    } as unknown as PageData;
    const r = new OnPageSeoAnalyzer().analyze(page);
    return { d: r.details.find((x) => x.criterionKey === 'criterion_indexability')!, recs: r.recommendations };
  };

  it('liest max-snippet aus Meta-Tag und Header, die strengere Grenze gilt', () => {
    const doc = parse(`<head><meta name="robots" content="index, max-snippet:120"></head><body><p>${TEXT}</p></body>`);
    const meta = extractRobotsMeta(doc);
    expect(meta.maxSnippet).toBe(120);
    expect(withXRobotsTag(meta, 'max-snippet: 30').maxSnippet).toBe(30);
    expect(extractRobotsMeta(parse(`<head><meta name="robots" content="max-snippet:-1"></head>`)).maxSnippet).toBe(-1);
  });

  it('misst data-nosnippet am Inhalt, nicht am Cookie-Banner', () => {
    const banner = parse(`<body><div data-nosnippet>Cookies akzeptieren</div><main><h1>T</h1><p>${TEXT}</p></main></body>`);
    expect(extractRobotsMeta(banner).noSnippetShare).toBeUndefined();
    const body = parse(`<body><main><h1>T</h1><div data-nosnippet><p>${TEXT}</p></div></main></body>`);
    expect(extractRobotsMeta(body).noSnippetShare).toBeGreaterThan(0.9);
  });

  it('wertet nosnippet, kleines max-snippet und data-nosnippet ab', () => {
    const base = { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null };
    expect(index(base).d.found).toBe(true);
    const nos = index({ ...base, hasNoSnippet: true });
    expect(nos.d.value).toBe('value_snippetLimited');
    expect(nos.d.fixKey).toBe('fix_indexability_snippet');
    expect(nos.recs).toContain('snippet_restricted');
    expect(index({ ...base, maxSnippet: 20 }).d.evidence).toContainEqual({ key: 'ev_indexability_max_snippet', params: { limit: 20 } });
    expect(index({ ...base, maxSnippet: 160 }).d.found).toBe(true);
    expect(index({ ...base, noSnippetShare: 0.7 }).d.evidence).toContainEqual({ key: 'ev_indexability_data_nosnippet', params: { percent: 70 } });
    // noindex stays the headline problem
    expect(index({ ...base, hasNoIndex: true, hasNoSnippet: true }).recs).not.toContain('snippet_restricted');
  });
});

describe('Abruf mit Bot-Kennung', async () => {
  const { probeBotAccess, isBlockedResponse, PROBE_MARKER_HEADER } = await import('../bot-access');

  it('erkennt Sperren an Status und Cloudflare-Challenge', () => {
    expect(isBlockedResponse(403, new Headers())).toBe(true);
    expect(isBlockedResponse(200, new Headers({ 'cf-mitigated': 'challenge' }))).toBe(true);
    expect(isBlockedResponse(200, new Headers())).toBe(false);
  });

  it('meldet nur Bots, deren Anfrage die Kennung wirklich trug', async () => {
    let current = '';
    const g = globalThis as unknown as { chrome: unknown; fetch: typeof fetch };
    const originalFetch = g.fetch;
    g.chrome = {
      runtime: {
        sendMessage: async (m: { action: string; bot?: string }) => {
          if (m.action === 'bot-probe-rule') current = m.bot ?? '';
          return { ok: true };
        },
      },
    };
    g.fetch = (async () => {
      // The rule "did not apply" for ClaudeBot: no marker header
      const headers: Record<string, string> = current === 'ClaudeBot' ? {} : { [PROBE_MARKER_HEADER]: current };
      return new Response('x', { status: current === 'GPTBot' ? 403 : 200, headers });
    }) as typeof fetch;
    try {
      const r = await probeBotAccess('https://x.ch/a');
      expect(r?.checked).toEqual(['OAI-SearchBot', 'GPTBot', 'PerplexityBot']);
      expect(r?.blocked).toEqual([{ bot: 'GPTBot', status: 403 }]);
    } finally {
      g.fetch = originalFetch;
      delete (g as { chrome?: unknown }).chrome;
    }
  });
});

describe('Sitemap', async () => {
  const { checkSitemap, pageKey, sitemapsFromRobots } = await import('../sitemap-check');
  const { MachineReadabilityAnalyzer } = await import('../../analyzers/machine-readability');
  const files: Record<string, string> = {
    'https://x.ch/sitemap_index.xml': `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://x.ch/post-sitemap.xml</loc></sitemap></sitemapindex>`,
    'https://x.ch/post-sitemap.xml': `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://www.x.ch/blog/a/</loc><lastmod>2026-09-01T10:00:00+00:00</lastmod></url>
      <url><loc>https://x.ch/blog/b/</loc></url></urlset>`,
  };
  const fetchFn = (async (url: string) =>
    files[url] ? new Response(files[url], { status: 200 }) : new Response('', { status: 404 })) as unknown as typeof fetch;

  it('liest Sitemap-Zeilen und vergleicht Seiten ohne www. und Schrägstrich', () => {
    expect(sitemapsFromRobots('User-agent: *\nSitemap: https://x.ch/sitemap_index.xml # yoast\nsitemap: /rel.xml')).toEqual([
      'https://x.ch/sitemap_index.xml',
    ]);
    expect(pageKey('https://www.x.ch/blog/a/')).toBe(pageKey('http://x.ch/blog/a?utm=1'));
  });

  it('findet die Seite samt lastmod über den Index aus der robots.txt', async () => {
    const r = await checkSitemap('https://x.ch/blog/a', 'Sitemap: https://x.ch/sitemap_index.xml', fetchFn);
    expect(r).toMatchObject({ exists: true, declaredInRobots: true, listed: true, pageLastmod: '2026-09-01T10:00:00+00:00', entries: 2 });
    expect(r.lastmodShare).toBe(0.5);
  });

  it('meldet eine fehlende Seite und eine fehlende Sitemap', async () => {
    const missing = await checkSitemap('https://x.ch/blog/c', 'Sitemap: https://x.ch/sitemap_index.xml', fetchFn);
    expect(missing.listed).toBe(false);
    const none = await checkSitemap('https://x.ch/blog/a', '', fetchFn);
    expect(none.exists).toBe(false);
  });

  it('bewertet die Sitemap als eigenes Kriterium', () => {
    const page: PageData = {
      url: 'https://x.ch/blog/a', headings: [], paragraphs: [], lists: [], links: [], schema: [], images: [],
      meta: { title: '', description: '', author: '', publishDate: null, modifiedDate: null, ogType: null },
      author: null, dates: [],
      semanticElements: { hasArticle: false, hasMain: false, hasNav: false, hasAside: false, hasHeader: false, hasFooter: false, hasSection: false },
      llmsTxt: { exists: false },
      robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
      robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
      openGraph: { title: null, description: null, image: null, url: null, type: null },
      twitterCard: { card: null, title: null, description: null, image: null },
      viewport: { hasViewport: false, hasDeviceWidth: false, userScalableNo: false, rawContent: null },
      canonical: { href: null },
    };
    const analyzer = new MachineReadabilityAnalyzer();
    const detail = (p: PageData) => analyzer.analyze(p).details.find((d) => d.criterionKey === 'criterion_sitemap');
    expect(detail(page)).toBeUndefined();
    const base = { exists: true, declaredInRobots: true, listed: true, pageLastmod: '2026-09-01', entries: 20, lastmodShare: 1, lastmodUniform: false };
    expect(detail({ ...page, sitemap: base })?.found).toBe(true);
    const notListed = analyzer.analyze({ ...page, sitemap: { ...base, listed: false, pageLastmod: null } });
    const d = notListed.details.find((x) => x.criterionKey === 'criterion_sitemap')!;
    expect(d.progress?.current).toBe(60);
    expect(d.fixKey).toBe('fix_sitemap_listed');
    expect(notListed.recommendations).toContain('sitemap_page_missing');
    expect(detail({ ...page, sitemap: { ...base, lastmodUniform: true } })?.evidence).toContainEqual({ key: 'ev_sitemap_lastmod_uniform' });
  });
});

describe('Bing Webmaster Tools', async () => {
  const { detectBingVerification } = await import('../sitemap-check');
  const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

  it('erkennt Meta-Tag und BingSiteAuth.xml', async () => {
    const withMeta = parse('<head><meta name="msvalidate.01" content="ABC123"></head><body></body>');
    expect(await detectBingVerification(withMeta, 'https://x.ch/a', notFound)).toBe('meta');
    const file = (async () => new Response('<?xml version="1.0"?><users><user>ABC</user></users>')) as unknown as typeof fetch;
    expect(await detectBingVerification(parse('<body></body>'), 'https://x.ch/a', file)).toBe('file');
    expect(await detectBingVerification(parse('<body></body>'), 'https://x.ch/a', notFound)).toBeNull();
  });
});

describe('hreflang', async () => {
  const { extractHreflang, extractPageData } = await import('../dom-helpers');
  const { OnPageSeoAnalyzer } = await import('../../analyzers/on-page-seo');
  const domain = {
    llmsTxt: { exists: false },
    robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
  } as never;
  const detail = async (html: string, url: string) => {
    const pd = await extractPageData(parse(html), url, domain);
    const r = new OnPageSeoAnalyzer().analyze(pd);
    return { d: r.details.find((x) => x.criterionKey === 'criterion_hreflang'), recs: r.recommendations };
  };

  it('erkennt einen Sprachwechsler ohne hreflang', () => {
    const doc = parse(`<html lang="de"><body><nav><a href="/fr/article">FR</a><a href="/it/articolo">IT</a><a href="/de/kontakt">Kontakt</a></nav></body></html>`);
    expect(extractHreflang(doc, 'https://x.ch/de/artikel').languageLinks).toEqual(['https://x.ch/fr/article', 'https://x.ch/it/articolo']);
    expect(extractHreflang(parse('<body><a href="/it/">IT-Support</a></body>'), 'https://x.ch/').languageLinks).toEqual([]);
  });

  it('bewertet fehlendes, unvollständiges und vollständiges hreflang', async () => {
    const missing = await detail(`<body><main><h1>A</h1></main><nav><a href="/fr/a">Français</a></nav></body>`, 'https://x.ch/de/a');
    expect(missing.d?.value).toBe('value_notPresent');
    expect(missing.recs).toContain('hreflang_missing');

    const partial = await detail(`<head><link rel="alternate" hreflang="fr-CH" href="https://x.ch/fr/a"><link rel="alternate" hreflang="de_CH" href="https://x.ch/de/a"></head><body></body>`, 'https://x.ch/de/a');
    expect(partial.d?.progress?.current).toBe(60);
    expect(partial.d?.evidence?.map((e) => e.key)).toEqual(['ev_hreflang_found', 'ev_hreflang_xdefault_missing', 'ev_hreflang_invalid']);

    const full = await detail(`<html lang="de-CH"><head><link rel="alternate" hreflang="de-CH" href="/de/a"><link rel="alternate" hreflang="fr-CH" href="/fr/a"><link rel="alternate" hreflang="x-default" href="/de/a"></head><body></body></html>`, 'https://www.x.ch/de/a/');
    expect(full.d?.found).toBe(true);

    expect((await detail('<body><p>Nur Deutsch.</p></body>', 'https://x.ch/a')).d).toBeUndefined();
  });
});
