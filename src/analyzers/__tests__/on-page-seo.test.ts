import { describe, it, expect } from 'vitest';
import { OnPageSeoAnalyzer } from '../on-page-seo';
import type { PageData } from '../../types/analysis';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com',
    headings: [],
    paragraphs: [],
    lists: [],
    links: [],
    meta: { title: 'A reasonable page title', description: '', author: '', publishDate: null, modifiedDate: null, ogType: null },
    schema: [],
    author: null,
    dates: [],
    semanticElements: { hasArticle: false, hasMain: false, hasNav: false, hasAside: false, hasHeader: false, hasFooter: false, hasSection: false },
    llmsTxt: { exists: false },
    robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
    images: [],
    openGraph: { title: null, description: null, image: null, url: null, type: null },
    twitterCard: { card: null, title: null, description: null, image: null },
    robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
    viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: 'width=device-width, initial-scale=1' },
    ...overrides,
  };
}

describe('OnPageSeoAnalyzer', () => {
  const analyzer = new OnPageSeoAnalyzer();

  describe('title quality', () => {
    it('flags missing title', () => {
      const r = analyzer.analyze(makePage({ meta: { ...makePage().meta, title: '' } }));
      const d = r.details.find((x) => x.criterionKey === 'criterion_title_quality')!;
      expect(d.found).toBe(false);
      expect(r.recommendations).toContain('title_missing');
    });

    it('flags too-short title', () => {
      const r = analyzer.analyze(makePage({ meta: { ...makePage().meta, title: 'Tiny' } }));
      expect(r.recommendations).toContain('title_too_short');
    });

    it('flags too-long title', () => {
      const long = 'A'.repeat(120);
      const r = analyzer.analyze(makePage({ meta: { ...makePage().meta, title: long } }));
      expect(r.recommendations).toContain('title_too_long');
    });

    it('accepts a title in the ideal range', () => {
      const ok = 'A clear and helpful 45-character page title!';
      const r = analyzer.analyze(makePage({ meta: { ...makePage().meta, title: ok } }));
      const d = r.details.find((x) => x.criterionKey === 'criterion_title_quality')!;
      expect(d.found).toBe(true);
      expect(r.recommendations).not.toContain('title_missing');
    });
  });

  describe('meta description', () => {
    it('flags missing description', () => {
      const r = analyzer.analyze(makePage());
      expect(r.recommendations).toContain('description_missing');
    });

    it('accepts a 140-char description', () => {
      const d140 = 'X'.repeat(140);
      const r = analyzer.analyze(
        makePage({ meta: { ...makePage().meta, description: d140 } })
      );
      const det = r.details.find((x) => x.criterionKey === 'criterion_meta_description')!;
      expect(det.found).toBe(true);
    });
  });

  describe('image alts', () => {
    it('treats pages with no images as a pass', () => {
      const r = analyzer.analyze(makePage());
      const d = r.details.find((x) => x.criterionKey === 'criterion_image_alts')!;
      expect(d.found).toBe(true);
      expect(r.recommendations).not.toContain('images_missing_alts');
    });

    it('flags page where most images lack alt', () => {
      const r = analyzer.analyze(
        makePage({
          images: [
            { src: 'a.jpg', alt: 'good', hasAltAttribute: true },
            { src: 'b.jpg', alt: null, hasAltAttribute: false },
            { src: 'c.jpg', alt: null, hasAltAttribute: false },
            { src: 'd.jpg', alt: null, hasAltAttribute: false },
          ],
        })
      );
      expect(r.recommendations).toContain('images_missing_alts');
    });

    it('counts decorative empty alt as handled', () => {
      const r = analyzer.analyze(
        makePage({
          images: [
            { src: 'a.jpg', alt: 'caption', hasAltAttribute: true },
            { src: 'b.jpg', alt: '', hasAltAttribute: true }, // decorative
            { src: 'c.jpg', alt: 'caption', hasAltAttribute: true },
          ],
        })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_image_alts')!;
      expect(d.found).toBe(true);
      expect(r.recommendations).not.toContain('images_missing_alts');
    });
  });

  describe('indexability', () => {
    it('warns loudly when noindex is set', () => {
      const r = analyzer.analyze(
        makePage({
          robotsMeta: { hasNoIndex: true, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: 'noindex, nofollow' },
        })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_indexability')!;
      expect(d.found).toBe(false);
      expect(r.recommendations).toContain('page_is_noindex');
    });

    it('passes when no robots-meta or no noindex', () => {
      const r = analyzer.analyze(makePage());
      const d = r.details.find((x) => x.criterionKey === 'criterion_indexability')!;
      expect(d.found).toBe(true);
      expect(r.recommendations).not.toContain('page_is_noindex');
    });
  });

  describe('mobile viewport', () => {
    it('flags missing viewport meta tag', () => {
      const r = analyzer.analyze(
        makePage({
          viewport: { hasViewport: false, hasDeviceWidth: false, userScalableNo: false, rawContent: null },
        })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_viewport')!;
      expect(d.found).toBe(false);
      expect(r.recommendations).toContain('viewport_missing');
      expect(r.recommendations).not.toContain('viewport_misconfigured');
    });

    it('flags viewport tag missing width=device-width', () => {
      const r = analyzer.analyze(
        makePage({
          viewport: { hasViewport: true, hasDeviceWidth: false, userScalableNo: false, rawContent: 'initial-scale=1' },
        })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_viewport')!;
      expect(d.found).toBe(false);
      expect(r.recommendations).toContain('viewport_misconfigured');
      expect(r.recommendations).not.toContain('viewport_missing');
    });

    it('passes with width=device-width set', () => {
      const r = analyzer.analyze(makePage()); // default fixture has good viewport
      const d = r.details.find((x) => x.criterionKey === 'criterion_viewport')!;
      expect(d.found).toBe(true);
      expect(r.recommendations).not.toContain('viewport_missing');
      expect(r.recommendations).not.toContain('viewport_misconfigured');
    });
  });

  describe('social cards', () => {
    it('flags missing social cards', () => {
      const r = analyzer.analyze(makePage());
      expect(r.recommendations).toContain('social_cards_missing');
    });

    it('passes with full OG + twitter:card', () => {
      const r = analyzer.analyze(
        makePage({
          openGraph: { title: 'T', description: 'D', image: 'i.jpg', url: 'u', type: 'article' },
          twitterCard: { card: 'summary_large_image', title: 'T', description: 'D', image: 'i.jpg' },
        })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_social_cards')!;
      expect(d.found).toBe(true);
      expect(r.recommendations).not.toContain('social_cards_missing');
    });
  });
});
