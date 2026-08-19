// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractSchemaData,
  extractAuthorInfo,
  extractRobotsMeta,
  extractParagraphs,
  extractFaqQuestions,
} from '../dom-helpers';

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html>${html}</html>`, 'text/html');
}

// The sitemap batch runs inside the content script of some page and feeds
// DOMParser documents of *other* URLs to the extractors. Everything the live
// page carries here must stay out of those results.
const LIVE_PAGE = `
  <head>
    <script type="application/ld+json">{"@type":"Article","author":{"name":"Live Author"}}</script>
    <meta name="author" content="Live Meta Author">
    <meta property="article:author" content="Live Article Author">
    <meta name="robots" content="noindex, nofollow">
  </head>
  <body>
    <p>${'Paragraph text of the live page. '.repeat(4)}</p>
    <div itemscope itemtype="https://schema.org/Question"><span itemprop="name">Live question?</span></div>
  </body>`;

const BATCH_PAGE = `
  <head>
    <script type="application/ld+json">{"@type":"BlogPosting","author":{"name":"Batch Author"}}</script>
    <meta name="robots" content="index, follow">
  </head>
  <body>
    <p>${'Paragraph text of the analyzed page. '.repeat(4)}</p>
    <div itemscope itemtype="https://schema.org/Question"><span itemprop="name">Batch question?</span></div>
  </body>`;

describe('extractors honor the document they are given', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = LIVE_PAGE;
  });

  it('reads JSON-LD from the passed document, not the live page', () => {
    const types = extractSchemaData(parse(BATCH_PAGE)).map((s) => s['@type']);
    expect(types).toContain('BlogPosting');
    expect(types).not.toContain('Article');
  });

  it('reads the author from the passed document', () => {
    expect(extractAuthorInfo(parse(BATCH_PAGE))?.name).toBe('Batch Author');
  });

  it('does not fall back to the live page meta author', () => {
    const author = extractAuthorInfo(parse('<head></head><body><p>No author here.</p></body>'));
    expect(author).toBeNull();
  });

  it('reads the robots meta from the passed document', () => {
    const robots = extractRobotsMeta(parse(BATCH_PAGE));
    expect(robots.hasNoIndex).toBe(false);
    expect(robots.hasNoFollow).toBe(false);
    expect(robots.rawContent).toBe('index, follow');
  });

  it('reads paragraphs from the passed document', () => {
    const paragraphs = extractParagraphs(parse(BATCH_PAGE));
    expect(paragraphs.join(' ')).toContain('analyzed page');
    expect(paragraphs.join(' ')).not.toContain('live page');
  });

  it('reads FAQ questions from the passed document', () => {
    const questions = extractFaqQuestions(parse(BATCH_PAGE));
    expect(questions).toContain('Batch question?');
    expect(questions).not.toContain('Live question?');
  });

  it('still defaults to the live document when no document is passed', () => {
    expect(extractAuthorInfo()?.name).toBe('Live Author');
    expect(extractRobotsMeta().hasNoIndex).toBe(true);
  });
});
