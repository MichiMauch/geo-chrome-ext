import { describe, it, expect } from 'vitest';
import { ContentClarityAnalyzer } from '../content-clarity';
import { PageData } from '../../types/analysis';

describe('ContentClarityAnalyzer', () => {
  const analyzer = new ContentClarityAnalyzer();

  it('should give a high score for a perfect page', () => {
    const mockPage: PageData = {
      url: 'https://example.com',
      headings: [
        { level: 1, text: 'A perfect GEO optimized headline' },
        { level: 2, text: 'Section 1' },
        { level: 2, text: 'Section 2' },
        { level: 3, text: 'Subsection 1' },
        { level: 3, text: 'Subsection 2' },
      ],
      paragraphs: [
        'This is a high quality paragraph with good length.',
        'Another high quality paragraph that is concise.',
        'A third paragraph to meet the minimum requirement.',
      ],
      lists: [
        { type: 'ul', itemCount: 3, items: ['Item 1', 'Item 2', 'Item 3'] },
        { type: 'ol', itemCount: 3, items: ['Step 1', 'Step 2', 'Step 3'] },
      ],
      links: [],
      meta: { title: 'Title', description: 'Desc', author: 'Author', publishDate: null, modifiedDate: null, ogType: null },
      schema: [],
      author: null,
      dates: [],
      semanticElements: { hasArticle: true, hasMain: true, hasNav: true, hasAside: true, hasHeader: true, hasFooter: true, hasSection: true },
      llmsTxt: { exists: true },
      robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
      images: [],
      openGraph: { title: null, description: null, image: null, url: null, type: null },
      twitterCard: { card: null, title: null, description: null, image: null },
      robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
      viewport: { hasViewport: false, hasDeviceWidth: false, userScalableNo: false, rawContent: null },
      canonical: { href: null },
    };

    const result = analyzer.analyze(mockPage);
    expect(result.score).toBeGreaterThan(4);
    expect(result.details.find(d => d.criterionKey === 'criterion_h1')?.found).toBe(true);
  });

  it('should penalize missing H1', () => {
    const mockPage: PageData = {
      url: 'https://example.com',
      headings: [
        { level: 2, text: 'No H1 here' },
      ],
      paragraphs: ['Some text'],
      lists: [],
      links: [],
      meta: { title: 'Title', description: 'Desc', author: 'Author', publishDate: null, modifiedDate: null, ogType: null },
      schema: [],
      author: null,
      dates: [],
      semanticElements: { hasArticle: true, hasMain: true, hasNav: true, hasAside: true, hasHeader: true, hasFooter: true, hasSection: true },
      llmsTxt: { exists: true },
      robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
      images: [],
      openGraph: { title: null, description: null, image: null, url: null, type: null },
      twitterCard: { card: null, title: null, description: null, image: null },
      robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
      viewport: { hasViewport: false, hasDeviceWidth: false, userScalableNo: false, rawContent: null },
      canonical: { href: null },
    };

    const result = analyzer.analyze(mockPage);
    expect(result.details.find(d => d.criterionKey === 'criterion_h1')?.found).toBe(false);
    expect(result.recommendations).toContain('no_h1');
  });

  it('should accept shorter H1s based on relaxed config', () => {
    const mockPage: PageData = {
      url: 'https://example.com',
      headings: [
        { level: 1, text: 'Short' }, // 5 chars - should be OK now
      ],
      paragraphs: ['Some text'],
      lists: [],
      links: [],
      meta: { title: 'Title', description: 'Desc', author: 'Author', publishDate: null, modifiedDate: null, ogType: null },
      schema: [],
      author: null,
      dates: [],
      semanticElements: { hasArticle: true, hasMain: true, hasNav: true, hasAside: true, hasHeader: true, hasFooter: true, hasSection: true },
      llmsTxt: { exists: true },
      robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
      images: [],
      openGraph: { title: null, description: null, image: null, url: null, type: null },
      twitterCard: { card: null, title: null, description: null, image: null },
      robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
      viewport: { hasViewport: false, hasDeviceWidth: false, userScalableNo: false, rawContent: null },
      canonical: { href: null },
    };

    const result = analyzer.analyze(mockPage);
    expect(result.details.find(d => d.criterionKey === 'criterion_h1')?.found).toBe(true);
  });
});
