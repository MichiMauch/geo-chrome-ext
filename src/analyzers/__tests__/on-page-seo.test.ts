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
    canonical: { href: 'https://example.com' },
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
      expect(d.value).toBe('6/6');
      expect(r.recommendations).not.toContain('social_cards_missing');
    });

    const social = (overrides: Partial<PageData>) =>
      analyzer.analyze(makePage(overrides)).details.find((x) => x.criterionKey === 'criterion_social_cards')!;
    const fullOg = { title: 'T', description: 'D', image: 'https://ex.com/hero.jpg', url: 'https://ex.com/a', type: 'article' };

    it('does not count og:title as a twitter:card fallback', () => {
      const d = social({ openGraph: fullOg });
      expect(d.progress).toMatchObject({ current: 5, target: 6 });
      expect(d.value).toBe('value_socialCardsMissing');
      expect(d.valueParams?.missing).toBe('twitter:card');
    });

    it('fails with og:title alone — no more 4/4 without any twitter tag', () => {
      const d = social({ openGraph: { title: 'T', description: null, image: null, url: null, type: null } });
      expect(d.found).toBe(false);
      expect(d.progress?.current).toBe(1);
    });

    it('flags og:type=website on an article page', () => {
      const d = social({
        schema: [{ '@type': 'NewsArticle' }],
        openGraph: { ...fullOg, type: 'website' },
        twitterCard: { card: 'summary', title: null, description: null, image: null },
      });
      expect(d.progress?.current).toBe(5);
      expect(d.valueParams?.missing).toBe('og:type=article');
    });

    it('accepts og:type=website on a non-article page', () => {
      const d = social({
        openGraph: { ...fullOg, type: 'website' },
        twitterCard: { card: 'summary', title: null, description: null, image: null },
      });
      expect(d.progress?.current).toBe(6);
    });

    it('does not count a logo or placeholder as og:image', () => {
      const d = social({ openGraph: { ...fullOg, image: 'https://ex.com/assets/site-logo.png' } });
      expect(d.valueParams?.missing).toContain('og:image (logo/default)');
      expect(social({ openGraph: { ...fullOg, image: 'https://ex.com/img/catalogo-2024.jpg' } }).valueParams?.missing).not.toContain('og:image');
    });
  });

  describe('canonical tag', () => {
    it('flags a missing canonical', () => {
      const r = analyzer.analyze(makePage({ canonical: { href: null } }));
      const d = r.details.find((x) => x.criterionKey === 'criterion_canonical')!;
      expect(d.found).toBe(false);
      expect(d.value).toBe('value_notPresent');
      expect(r.recommendations).toContain('canonical_missing');
      expect(r.recommendations).not.toContain('canonical_mismatch');
    });

    it('flags a canonical pointing to a different URL', () => {
      const r = analyzer.analyze(
        makePage({ canonical: { href: 'https://other-domain.com/some-page' } })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_canonical')!;
      expect(d.found).toBe(false);
      expect(d.value).toBe('value_canonical_mismatch');
      expect(r.recommendations).toContain('canonical_mismatch');
      expect(r.recommendations).not.toContain('canonical_missing');
    });

    it('flags a canonical pointing to a different path on the same host', () => {
      const r = analyzer.analyze(
        makePage({
          url: 'https://example.com/page-b',
          canonical: { href: 'https://example.com/page-a' },
        })
      );
      expect(r.recommendations).toContain('canonical_mismatch');
    });

    it('accepts a self-referencing canonical', () => {
      const r = analyzer.analyze(
        makePage({
          url: 'https://example.com/artikel/geo-guide',
          canonical: { href: 'https://example.com/artikel/geo-guide' },
        })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_canonical')!;
      expect(d.found).toBe(true);
      expect(d.value).toBe('value_present');
      expect(r.recommendations).not.toContain('canonical_missing');
      expect(r.recommendations).not.toContain('canonical_mismatch');
    });

    it('ignores trailing slash, host case, query string and hash when comparing', () => {
      const r = analyzer.analyze(
        makePage({
          url: 'https://Example.com/artikel/?utm_source=newsletter#abschnitt',
          canonical: { href: 'https://example.com/artikel' },
        })
      );
      const d = r.details.find((x) => x.criterionKey === 'criterion_canonical')!;
      expect(d.found).toBe(true);
      expect(r.recommendations).not.toContain('canonical_mismatch');
    });
  });
});

describe('OnPageSeoAnalyzer — report evidence', () => {
  const analyzer = new OnPageSeoAnalyzer();
  const detail = (page: PageData, key: string) =>
    analyzer.analyze(page).details.find((d) => d.criterionKey === key)!;
  const meta = makePage().meta;

  it('title: shows the text and length, and what Google cuts off', () => {
    const ok = detail(makePage({ meta: { ...meta, title: 'Stromversorgung in der Schweiz: FAQ | economiesuisse' } }), 'criterion_title_quality');
    expect(ok.evidence).toEqual([
      { key: 'ev_title_quality_text', params: { text: 'Stromversorgung in der Schweiz: FAQ | economiesuisse', len: 52, min: 30, max: 60 } },
    ]);
    expect(ok.fixKey).toBeUndefined();
    const long = detail(makePage({ meta: { ...meta, title: 'A'.repeat(70) } }), 'criterion_title_quality');
    expect(long.evidence?.[1]).toEqual({ key: 'ev_title_quality_long', params: { over: 10, visible: `${'A'.repeat(60)}…` } });
    expect(long.fixKey).toBe('fix_title_quality_long');
    const missing = detail(makePage({ meta: { ...meta, title: '' } }), 'criterion_title_quality');
    expect(missing.evidence).toEqual([{ key: 'ev_title_quality_missing', params: { min: 30, max: 60 } }]);
    expect(missing.fixKey).toBe('fix_title_quality_missing');
  });

  it('meta description: short description with its length', () => {
    const d = detail(makePage({ meta: { ...meta, description: 'Kurz.' } }), 'criterion_meta_description');
    expect(d.evidence).toEqual([
      { key: 'ev_meta_description_text', params: { text: 'Kurz.', len: 5, min: 120, max: 160 } },
      { key: 'ev_meta_description_short', params: { len: 5, min: 120 } },
    ]);
    expect(d.fixKey).toBe('fix_meta_description_short');
  });

  it('image alts: counts, decorative images and example file names', () => {
    const images = [
      { src: 'https://example.com/img/team-photo.jpg', alt: null, hasAltAttribute: false },
      { src: 'data:image/svg+xml,<svg/>', alt: null, hasAltAttribute: false },
      { src: 'https://example.com/a.png', alt: '', hasAltAttribute: true },
      { src: 'https://example.com/b.png', alt: 'Chart', hasAltAttribute: true },
    ];
    expect(detail(makePage({ images }), 'criterion_image_alts').evidence).toEqual([
      { key: 'ev_image_alts_count', params: { withAlt: 2, total: 4 } },
      { key: 'ev_image_alts_decorative', params: { count: 1 } },
      { key: 'ev_image_alts_missing', params: { count: 2, examples: '«team-photo.jpg»' } },
    ]);
    const none = detail(makePage(), 'criterion_image_alts');
    expect(none.evidence).toEqual([{ key: 'ev_image_alts_none' }]);
    expect(none.fixKey).toBe('fix_image_alts_none');
  });

  it('indexability: shows the robots setting', () => {
    const robotsMeta = { hasNoIndex: true, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: true, rawContent: 'noindex, nosnippet' };
    expect(detail(makePage({ robotsMeta }), 'criterion_indexability').evidence).toEqual([
      { key: 'ev_indexability_noindex', params: { raw: 'noindex, nosnippet' } },
      { key: 'ev_indexability_nosnippet' },
    ]);
    expect(detail(makePage(), 'criterion_indexability').evidence).toEqual([{ key: 'ev_indexability_ok' }]);
  });

  it('viewport: content of the tag, missing device width, zoom lock', () => {
    const viewport = { hasViewport: true, hasDeviceWidth: false, userScalableNo: true, rawContent: 'width=1024, user-scalable=no' };
    const d = detail(makePage({ viewport }), 'criterion_viewport');
    expect(d.evidence).toEqual([
      { key: 'ev_viewport_no_device_width', params: { content: 'width=1024, user-scalable=no' } },
      { key: 'ev_viewport_no_zoom' },
    ]);
    expect(d.fixKey).toBe('fix_viewport_device_width');
    expect(detail(makePage(), 'criterion_viewport').evidence).toEqual([
      { key: 'ev_viewport_ok', params: { content: 'width=device-width, initial-scale=1' } },
    ]);
  });

  it('social cards: present and missing tags and what a shared link looks like', () => {
    const page = makePage({
      schema: [{ '@type': 'NewsArticle' }],
      openGraph: { title: 'T', description: 'D', image: 'https://example.com/og-image-default.jpg', url: null, type: 'website' },
      twitterCard: { card: null, title: null, description: null, image: null },
    });
    expect(detail(page, 'criterion_social_cards').evidence).toEqual([
      { key: 'ev_social_cards_present', params: { tags: 'og:title, og:description' } },
      { key: 'ev_social_cards_missing', params: { tags: 'og:image (logo/default), og:url, og:type=article, twitter:card' } },
      { key: 'ev_social_cards_generic_image', params: { file: 'og-image-default.jpg' } },
      { key: 'ev_social_cards_type', params: { type: 'website' } },
      { key: 'ev_social_cards_preview_noimage' },
      { key: 'ev_social_cards_preview_x' },
      { key: 'ev_social_cards_preview_nourl' },
    ]);
    const full = makePage({
      openGraph: { title: 'T', description: 'D', image: 'https://example.com/hero.jpg', url: 'https://example.com', type: 'website' },
      twitterCard: { card: 'summary_large_image', title: null, description: null, image: null },
    });
    expect(detail(full, 'criterion_social_cards').evidence?.slice(-1)[0]).toEqual({ key: 'ev_social_cards_preview_ok' });
  });

  it('canonical: canonical URL against page URL', () => {
    expect(detail(makePage(), 'criterion_canonical').evidence).toEqual([
      { key: 'ev_canonical_self', params: { canonical: 'https://example.com' } },
    ]);
    const d = detail(makePage({ url: 'https://example.com/a', canonical: { href: 'https://example.com/' } }), 'criterion_canonical');
    expect(d.evidence).toEqual([
      { key: 'ev_canonical_mismatch', params: { canonical: 'https://example.com/', page: 'https://example.com/a' } },
    ]);
    expect(d.fixKey).toBe('fix_canonical_mismatch');
  });

  it('German report text carries the concrete data and no raw placeholder', async () => {
    const { setLang } = await import('../../utils/i18n');
    const { mapAnalysisResult } = await import('../../utils/analysis-mapper');
    setLang('de');
    const mapped = mapAnalysisResult(
      analyzer.analyze(makePage({ url: 'https://example.com/a', meta: { ...meta, title: 'Kurz' }, canonical: { href: 'https://example.com/' } }))
    );
    const all = mapped.details.flatMap((d) => [...(d.evidenceText ?? []), d.whyText ?? '', d.fixText ?? '']);
    expect(all).toContain('Seitentitel: «Kurz» (4 Zeichen, empfohlen 30–60).');
    expect(all).toContain('Das Canonical zeigt auf eine andere Adresse: https://example.com/. Diese Seite: https://example.com/a.');
    for (const line of all) expect(line).not.toMatch(/\{[a-zA-Z]+\}/);
    // No images: no fix text to show
    expect(mapped.details.find((d) => d.criterionKey === 'Bild-Alt-Texte')?.fixText).toBeUndefined();
    setLang('en');
  });
});
