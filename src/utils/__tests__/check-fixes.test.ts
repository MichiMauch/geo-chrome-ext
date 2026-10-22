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
