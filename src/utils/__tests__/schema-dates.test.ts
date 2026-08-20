// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractDates, isWithinLastYear } from '../dom-helpers';

function mitJsonLd(json: unknown): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
      json
    )}</script></head><body><p>Text.</p></body></html>`,
    'text/html'
  );
}

/** Ein Datum, das garantiert innerhalb des letzten Jahres liegt. */
function vorTagen(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  return d.toISOString();
}

describe('extractDates — Schema.org', () => {
  it('nimmt dateModified auf, auch wenn datePublished daneben steht', () => {
    // Der Fall von fisba.com: 2021 veröffentlicht, heute geändert. Vorher
    // gewann datePublished, die Seite galt als älter als ein Jahr.
    const doc = mitJsonLd({
      '@type': 'Article',
      datePublished: '2021-03-15T09:42:36+0100',
      dateModified: vorTagen(2),
    });

    const dates = extractDates(doc);
    const jahre = dates.map((d) => d.date.getFullYear());

    expect(jahre).toContain(2021);
    expect(dates.some((d) => isWithinLastYear(d.date))).toBe(true);
  });

  it('stellt das Änderungsdatum vor das Veröffentlichungsdatum', () => {
    const doc = mitJsonLd({
      '@type': 'Article',
      datePublished: '2021-03-15',
      dateModified: '2026-01-20',
    });

    const schemaDaten = extractDates(doc).filter((d) => d.source === 'schema');
    expect(schemaDaten[0].formatted).toBe('2026-01-20');
    expect(schemaDaten[1].formatted).toBe('2021-03-15');
  });

  it('nimmt datePublished, wenn kein dateModified da ist', () => {
    const doc = mitJsonLd({ '@type': 'Article', datePublished: '2021-03-15' });
    const schemaDaten = extractDates(doc).filter((d) => d.source === 'schema');
    expect(schemaDaten).toHaveLength(1);
    expect(schemaDaten[0].formatted).toBe('2021-03-15');
  });

  it('zählt dasselbe Datum aus mehreren Schema-Blöcken nur einmal', () => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><head>
       <script type="application/ld+json">{"@type":"Article","dateModified":"2026-01-20"}</script>
       <script type="application/ld+json">{"@type":"WebPage","dateModified":"2026-01-20"}</script>
       </head><body><p>Text.</p></body></html>`,
      'text/html'
    );

    const schemaDaten = extractDates(doc).filter((d) => d.source === 'schema');
    expect(schemaDaten).toHaveLength(1);
  });

  it('ignoriert ein unbrauchbares Datum, ohne das andere zu verlieren', () => {
    const doc = mitJsonLd({
      '@type': 'Article',
      dateModified: 'irgendwann',
      datePublished: '2021-03-15',
    });

    const schemaDaten = extractDates(doc).filter((d) => d.source === 'schema');
    expect(schemaDaten).toHaveLength(1);
    expect(schemaDaten[0].formatted).toBe('2021-03-15');
  });
});
