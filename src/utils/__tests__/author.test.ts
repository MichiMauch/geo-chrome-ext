// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractAuthorInfo } from '../dom-helpers';

function withJsonLd(json: unknown, body = '<body><p>Text.</p></body>'): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
      json
    )}</script></head>${body}</html>`,
    'text/html'
  );
}

describe('extractAuthorInfo — JSON-LD', () => {
  it('reads a plain string author', () => {
    const a = extractAuthorInfo(withJsonLd({ '@type': 'Article', author: 'Jane Doe' }));
    expect(a).toEqual({ name: 'Jane Doe', source: 'schema' });
  });

  it('reads an author node', () => {
    const a = extractAuthorInfo(
      withJsonLd({ '@type': 'Article', author: { '@type': 'Person', name: 'Jane Doe' } })
    );
    expect(a?.name).toBe('Jane Doe');
  });

  it('reads an author array', () => {
    const a = extractAuthorInfo(
      withJsonLd({
        '@type': 'Article',
        author: [
          { '@type': 'Person', name: 'Jane Doe' },
          { '@type': 'Person', name: 'John Roe' },
        ],
      })
    );
    expect(a?.name).toBe('Jane Doe');
  });

  it('skips an empty entry and takes the next usable one', () => {
    const a = extractAuthorInfo(
      withJsonLd({ '@type': 'Article', author: [{ '@type': 'Person' }, 'John Roe'] })
    );
    expect(a?.name).toBe('John Roe');
  });

  it('resolves an @id reference into @graph (Yoast/Drupal style)', () => {
    const a = extractAuthorInfo(
      withJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            '@id': 'https://example.com/post/#article',
            author: { '@id': 'https://example.com/#/schema/person/abc' },
          },
          {
            '@type': 'Person',
            '@id': 'https://example.com/#/schema/person/abc',
            name: 'Jane Doe',
          },
        ],
      })
    );
    expect(a).toEqual({ name: 'Jane Doe', source: 'schema' });
  });

  it('resolves an @id written as a bare string', () => {
    const a = extractAuthorInfo(
      withJsonLd({
        '@graph': [
          { '@type': 'BlogPosting', author: 'https://example.com/#person' },
          { '@type': 'Person', '@id': 'https://example.com/#person', name: 'Jane Doe' },
        ],
      })
    );
    expect(a?.name).toBe('Jane Doe');
  });

  it('does not report an unresolvable reference as the author name', () => {
    const a = extractAuthorInfo(
      withJsonLd({ '@type': 'Article', author: { '@id': 'https://example.com/#missing' } })
    );
    expect(a).toBeNull();
  });

  it('survives a reference cycle', () => {
    const a = extractAuthorInfo(
      withJsonLd({
        '@graph': [
          { '@type': 'Article', author: { '@id': '#a' } },
          { '@type': 'Person', '@id': '#a', author: { '@id': '#b' } },
          { '@type': 'Person', '@id': '#b', author: { '@id': '#a' } },
        ],
      })
    );
    expect(a).toBeNull();
  });

  it('falls back to publisher when no author is credited', () => {
    const a = extractAuthorInfo(
      withJsonLd({
        '@type': 'WebPage',
        publisher: { '@type': 'Organization', name: 'FISBA AG' },
      })
    );
    expect(a).toEqual({ name: 'FISBA AG', source: 'publisher' });
  });

  it('resolves a publisher given as an @id reference', () => {
    const a = extractAuthorInfo(
      withJsonLd({
        '@graph': [
          { '@type': 'WebPage', publisher: { '@id': 'https://example.com/#org' } },
          { '@type': 'Organization', '@id': 'https://example.com/#org', name: 'Example AG' },
        ],
      })
    );
    expect(a?.source).toBe('publisher');
    expect(a?.name).toBe('Example AG');
  });

  it('ignores a standalone Organization node without publisher role', () => {
    const a = extractAuthorInfo(
      withJsonLd({ '@type': 'Organization', name: 'Example AG' })
    );
    expect(a).toBeNull();
  });
});

describe('extractAuthorInfo — source precedence', () => {
  it('prefers a credited author over the meta tag', () => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><head>
        <meta name="author" content="Meta Author">
        <script type="application/ld+json">{"@type":"Article","author":{"name":"Schema Author"}}</script>
      </head><body></body></html>`,
      'text/html'
    );
    expect(extractAuthorInfo(doc)).toEqual({ name: 'Schema Author', source: 'schema' });
  });

  it('prefers the meta author over a publisher organization', () => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><head>
        <meta name="author" content="Meta Author">
        <script type="application/ld+json">{"@type":"WebPage","publisher":{"@type":"Organization","name":"Example AG"}}</script>
      </head><body></body></html>`,
      'text/html'
    );
    expect(extractAuthorInfo(doc)).toEqual({ name: 'Meta Author', source: 'meta' });
  });

  it('prefers a publisher organization over a DOM byline guess', () => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><head>
        <script type="application/ld+json">{"@type":"WebPage","publisher":{"@type":"Organization","name":"Example AG"}}</script>
      </head><body><div class="author-teaser">Read more from our authors</div></body></html>`,
      'text/html'
    );
    expect(extractAuthorInfo(doc)?.source).toBe('publisher');
  });

  it('still falls back to a DOM byline', () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><body><span class="byline">von Jane Doe</span></body></html>',
      'text/html'
    );
    expect(extractAuthorInfo(doc)).toEqual({ name: 'Jane Doe', source: 'dom' });
  });

  it('ignores a whitespace-only meta author', () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><head><meta name="author" content="   "></head><body></body></html>',
      'text/html'
    );
    expect(extractAuthorInfo(doc)).toBeNull();
  });
});
