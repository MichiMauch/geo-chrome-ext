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
