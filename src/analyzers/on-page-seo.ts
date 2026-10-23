import { PageData, AnalysisCategory, CategoryDetail, EvidenceLine } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { hasSchemaType } from '../utils/schema-types';
import { ARTICLE_SCHEMA_TYPES } from '../utils/page-type';
import { pageKey } from '../utils/sitemap-check';

// og:image file names that point at a site-wide default rather than an image
// for this page (logo, placeholder). Only the last path segment is checked.
const GENERIC_OG_IMAGE = /(^|[-_.])(logo|default|placeholder|fallback)([-_.]|$)/i;

// Shape of a hreflang value: language (ISO 639), optional script, optional
// region (ISO 3166 or UN M.49), or x-default. Not a full registry check.
const HREFLANG_CODE = /^(?:x-default|[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?)$/i;

// Short text for evidence lines
function clip(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Last path segment of an image URL, for the report
function fileName(src: string): string {
  let path = src;
  try {
    path = new URL(src, 'https://x.invalid').pathname;
  } catch {
    // keep the raw value
  }
  const name = decodeURIComponentSafe(path.split('/').filter(Boolean).pop() ?? src);
  return clip(name || src, 50);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Length check shared by title and description: which case applies
function lengthCase(len: number, min: number, max: number): 'missing' | 'short' | 'long' | 'ok' {
  if (len === 0) return 'missing';
  if (len < min) return 'short';
  if (len > max) return 'long';
  return 'ok';
}

export class OnPageSeoAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_onPageSeo';

  analyze(pageData: PageData): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.onPageSeo;

    // Check 1: Page title quality
    const title = (pageData.meta.title || '').trim();
    const titleLen = title.length;
    const titleScore = this.scoreTitle(titleLen);
    const titleGood = titleScore >= 0.7;
    details.push({
      criterionKey: 'criterion_title_quality',
      found: titleGood,
      value: titleLen === 0 ? 'value_notPresent' : 'value_chars',
      valueParams: { count: String(titleLen) },
      weight: config.weights.titleQuality,
      progress: {
        current: Math.round(titleScore * 100),
        target: 100,
        unitKey: 'unit_percent',
      },
      ...this.lengthEvidence(
        'title_quality',
        title,
        config.thresholds.titleMinLength,
        config.thresholds.titleMaxLength
      ),
    });
    weightedScore += titleScore * config.weights.titleQuality;
    totalWeight += config.weights.titleQuality;

    // Check 2: Meta description quality
    const desc = (pageData.meta.description || '').trim();
    const descLen = desc.length;
    const descScore = this.scoreDescription(descLen);
    const descGood = descScore >= 0.7;
    details.push({
      criterionKey: 'criterion_meta_description',
      found: descGood,
      value: descLen === 0 ? 'value_notPresent' : 'value_chars',
      valueParams: { count: String(descLen) },
      weight: config.weights.metaDescription,
      progress: {
        current: Math.round(descScore * 100),
        target: 100,
        unitKey: 'unit_percent',
      },
      ...this.lengthEvidence(
        'meta_description',
        desc,
        config.thresholds.descriptionMinLength,
        config.thresholds.descriptionMaxLength
      ),
    });
    weightedScore += descScore * config.weights.metaDescription;
    totalWeight += config.weights.metaDescription;

    // Check 3: Image alt-text coverage
    const altResult = this.scoreImageAlts(pageData.images);
    const altsGood = altResult.score >= 0.8;
    details.push({
      criterionKey: 'criterion_image_alts',
      found: altsGood || altResult.totalImages === 0,
      value:
        altResult.totalImages === 0
          ? 'value_noImages'
          : `${altResult.withAlt}/${altResult.totalImages}`,
      weight: config.weights.imageAlts,
      progress: {
        current: altResult.withAlt,
        target: Math.max(altResult.totalImages, 1),
        unitKey: 'unit_images',
      },
      evidence: this.altEvidence(pageData.images),
      // Nothing to fix without images; the key has no text, so no fix shows
      ...(altResult.totalImages === 0 ? { fixKey: 'fix_image_alts_none' } : {}),
    });
    // No-images pages get full credit (nothing to fail on)
    const altWeightContribution = altResult.totalImages === 0 ? 1 : altResult.score;
    weightedScore += altWeightContribution * config.weights.imageAlts;
    totalWeight += config.weights.imageAlts;

    // Check 4: Indexability (robots-meta / noindex)
    const robots = pageData.robotsMeta;
    const indexable = !robots.hasNoIndex;
    const snippetScore = this.snippetScore(robots);
    const indexScore = indexable ? snippetScore : 0;
    const snippetLimited = indexable && snippetScore < 1;
    details.push({
      criterionKey: 'criterion_indexability',
      found: indexable && !snippetLimited,
      value: !indexable ? 'value_noindex' : snippetLimited ? 'value_snippetLimited' : 'value_indexable',
      weight: config.weights.indexability,
      progress: {
        current: indexable && !snippetLimited ? 1 : 0,
        target: 1,
        unitKey: 'unit_status',
      },
      evidence: this.indexEvidence(robots),
      ...(snippetLimited ? { fixKey: 'fix_indexability_snippet' } : {}),
    });
    weightedScore += indexScore * config.weights.indexability;
    totalWeight += config.weights.indexability;

    // Check 5: Mobile viewport
    const vp = pageData.viewport;
    let vpScore = 0;
    let vpValueKey: string;
    if (!vp.hasViewport) {
      vpScore = 0;
      vpValueKey = 'value_notPresent';
    } else if (!vp.hasDeviceWidth) {
      vpScore = 0.4;
      vpValueKey = 'value_viewport_misconfigured';
    } else {
      vpScore = 1;
      vpValueKey = 'value_present';
    }
    details.push({
      criterionKey: 'criterion_viewport',
      found: vpScore >= 0.99,
      value: vpValueKey,
      weight: config.weights.viewport,
      progress: {
        current: vp.hasViewport && vp.hasDeviceWidth ? 1 : 0,
        target: 1,
        unitKey: 'unit_status',
      },
      evidence: this.viewportEvidence(vp),
      ...(vp.hasViewport && !vp.hasDeviceWidth ? { fixKey: 'fix_viewport_device_width' } : {}),
    });
    weightedScore += vpScore * config.weights.viewport;
    totalWeight += config.weights.viewport;

    // Check 6: Social cards (OG + Twitter)
    const socialResult = this.scoreSocialCards(pageData);
    const socialGood = socialResult.score >= 0.75;
    details.push({
      criterionKey: 'criterion_social_cards',
      found: socialGood,
      value:
        socialResult.missing.length === 0
          ? `${socialResult.foundCount}/${socialResult.totalCount}`
          : 'value_socialCardsMissing',
      valueParams: { missing: socialResult.missing.join(', ') },
      weight: config.weights.socialCards,
      progress: {
        current: socialResult.foundCount,
        target: socialResult.totalCount,
        unitKey: 'unit_tags',
      },
      evidence: socialResult.evidence,
    });
    weightedScore += socialResult.score * config.weights.socialCards;
    totalWeight += config.weights.socialCards;

    // Check 7: Canonical tag (three states, like the viewport check)
    const canonicalHref = pageData.canonical.href;
    const isSelfCanonical =
      canonicalHref !== null &&
      this.normalizeForCanonical(canonicalHref) !== null &&
      this.normalizeForCanonical(canonicalHref) === this.normalizeForCanonical(pageData.url);
    let canonicalScore = 0;
    let canonicalValueKey: string;
    if (canonicalHref === null) {
      canonicalScore = 0;
      canonicalValueKey = 'value_notPresent';
    } else if (!isSelfCanonical) {
      // Pointing at a different URL: often intentional (syndication,
      // pagination consolidation) but frequently a CMS bug — partial credit
      // plus a hint, never a hard fail.
      canonicalScore = 0.4;
      canonicalValueKey = 'value_canonical_mismatch';
    } else {
      canonicalScore = 1;
      canonicalValueKey = 'value_present';
    }
    details.push({
      criterionKey: 'criterion_canonical',
      found: canonicalScore >= 0.99,
      value: canonicalValueKey,
      weight: config.weights.canonical,
      progress: {
        current: isSelfCanonical ? 1 : 0,
        target: 1,
        unitKey: 'unit_status',
      },
      evidence:
        canonicalHref === null
          ? [{ key: 'ev_canonical_missing', params: { page: pageData.url } }]
          : isSelfCanonical
            ? [{ key: 'ev_canonical_self', params: { canonical: canonicalHref } }]
            : [{ key: 'ev_canonical_mismatch', params: { canonical: canonicalHref, page: pageData.url } }],
      ...(canonicalHref !== null && !isSelfCanonical ? { fixKey: 'fix_canonical_mismatch' } : {}),
    });
    weightedScore += canonicalScore * config.weights.canonical;
    totalWeight += config.weights.canonical;

    // Check 8: hreflang — only on pages that exist in several languages
    const hreflang = this.evaluateHreflang(pageData);
    if (hreflang) {
      details.push({
        criterionKey: 'criterion_hreflang',
        found: hreflang.score >= 0.99,
        value: hreflang.missing ? 'value_notPresent' : hreflang.score >= 0.99 ? 'value_present' : 'value_hreflang_incomplete',
        weight: config.weights.hreflang,
        progress: { current: Math.round(hreflang.score * 100), target: 100, unitKey: 'unit_percent' },
        evidence: hreflang.evidence,
        ...(hreflang.missing ? {} : hreflang.score < 0.99 ? { fixKey: 'fix_hreflang_incomplete' } : {}),
      });
      weightedScore += hreflang.score * config.weights.hreflang;
      totalWeight += config.weights.hreflang;
    }

    const recommendations: string[] = [];
    if (hreflang?.missing) recommendations.push('hreflang_missing');
    if (titleLen === 0) recommendations.push('title_missing');
    else if (titleLen < config.thresholds.titleMinLength) recommendations.push('title_too_short');
    else if (titleLen > config.thresholds.titleMaxLength) recommendations.push('title_too_long');

    if (descLen === 0) recommendations.push('description_missing');
    else if (descLen < config.thresholds.descriptionMinLength)
      recommendations.push('description_too_short');
    else if (descLen > config.thresholds.descriptionMaxLength)
      recommendations.push('description_too_long');

    if (altResult.totalImages > 0 && altResult.score < 0.8) {
      recommendations.push('images_missing_alts');
    }
    if (!indexable) recommendations.push('page_is_noindex');
    else if (snippetLimited) recommendations.push('snippet_restricted');
    if (!vp.hasViewport) recommendations.push('viewport_missing');
    else if (!vp.hasDeviceWidth) recommendations.push('viewport_misconfigured');
    if (!socialGood) recommendations.push('social_cards_missing');
    if (canonicalHref === null) recommendations.push('canonical_missing');
    else if (!isSelfCanonical) recommendations.push('canonical_mismatch');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  // Title / description: the text itself, its length against the
  // recommended range and, when too long, what remains visible in a search
  // result.
  private lengthEvidence(
    id: 'title_quality' | 'meta_description',
    text: string,
    min: number,
    max: number
  ): { evidence: EvidenceLine[]; fixKey?: string } {
    const kind = lengthCase(text.length, min, max);
    if (kind === 'missing') {
      return { evidence: [{ key: `ev_${id}_missing`, params: { min, max } }], fixKey: `fix_${id}_missing` };
    }
    const evidence: EvidenceLine[] = [
      { key: `ev_${id}_text`, params: { text: clip(text, 90), len: text.length, min, max } },
    ];
    if (kind === 'short') evidence.push({ key: `ev_${id}_short`, params: { len: text.length, min } });
    if (kind === 'long') {
      evidence.push({
        key: `ev_${id}_long`,
        params: { over: text.length - max, visible: `${text.slice(0, max).trimEnd()}…` },
      });
    }
    return { evidence, ...(kind === 'ok' ? {} : { fixKey: `fix_${id}_${kind}` }) };
  }

  private altEvidence(images: PageData['images']): EvidenceLine[] {
    if (images.length === 0) return [{ key: 'ev_image_alts_none' }];
    const withAlt = images.filter((i) => i.hasAltAttribute);
    const without = images.filter((i) => !i.hasAltAttribute);
    const decorative = withAlt.filter((i) => (i.alt ?? '').trim() === '').length;
    const evidence: EvidenceLine[] = [
      { key: 'ev_image_alts_count', params: { withAlt: withAlt.length, total: images.length } },
    ];
    if (decorative > 0) evidence.push({ key: 'ev_image_alts_decorative', params: { count: decorative } });
    if (without.length > 0) {
      // Embedded images (data: URIs) have no file name worth showing
      const names = [
        ...new Set(without.filter((i) => i.src && !/^data:/i.test(i.src)).map((i) => fileName(i.src))),
      ];
      evidence.push(
        names.length > 0
          ? {
              key: 'ev_image_alts_missing',
              params: { count: without.length, examples: names.slice(0, 3).map((n) => `«${n}»`).join(', ') },
            }
          : { key: 'ev_image_alts_missing_embedded', params: { count: without.length } }
      );
    }
    return evidence;
  }

  // hreflang on a multilingual page: present, names this page itself, has an
  // x-default, uses valid codes, and the page's own entry matches <html lang>.
  // Whether the other versions link back cannot be seen from this page.
  private evaluateHreflang(
    pageData: PageData
  ): { score: number; missing: boolean; evidence: EvidenceLine[] } | null {
    const h = pageData.hreflang;
    if (!h || (h.alternates.length === 0 && h.languageLinks.length === 0)) return null;
    if (h.alternates.length === 0) {
      return {
        score: 0,
        missing: true,
        evidence: [{ key: 'ev_hreflang_missing', params: { count: h.languageLinks.length, example: clip(h.languageLinks[0], 80) } }],
      };
    }
    const own = pageKey(pageData.canonical.href ?? pageData.url);
    const self = h.alternates.find((a) => pageKey(a.href) === own || pageKey(a.href) === pageKey(pageData.url));
    const xDefault = h.alternates.some((a) => a.hreflang.toLowerCase() === 'x-default');
    const invalid = h.alternates.map((a) => a.hreflang).filter((c) => !HREFLANG_CODE.test(c));
    const pageLang = pageData.lang?.toLowerCase();
    const selfLang = self?.hreflang.toLowerCase().split('-')[0];
    const langMatch = !self || !pageLang || selfLang === 'x' || selfLang === pageLang;
    const score = (self ? 0.4 : 0) + (xDefault ? 0.2 : 0) + (invalid.length === 0 ? 0.2 : 0) + (langMatch ? 0.2 : 0);

    const langs = [...new Set(h.alternates.map((a) => a.hreflang))];
    const evidence: EvidenceLine[] = [
      { key: 'ev_hreflang_found', params: { count: langs.length, langs: langs.slice(0, 8).join(', ') } },
    ];
    if (!self) evidence.push({ key: 'ev_hreflang_self_missing' });
    if (!xDefault) evidence.push({ key: 'ev_hreflang_xdefault_missing' });
    if (invalid.length > 0) evidence.push({ key: 'ev_hreflang_invalid', params: { codes: invalid.slice(0, 5).join(', ') } });
    if (!langMatch && self) evidence.push({ key: 'ev_hreflang_lang_mismatch', params: { hreflang: self.hreflang, lang: pageLang ?? '' } });
    return { score, missing: false, evidence };
  }

  // Remaining share of the indexability score under snippet limits
  // (GEO_CONFIG.onPageSeo.snippetLimits); the strictest limit wins.
  private snippetScore(robots: PageData['robotsMeta']): number {
    const l = GEO_CONFIG.onPageSeo.snippetLimits;
    const max = robots.maxSnippet;
    const share = robots.noSnippetShare ?? 0;
    const scores = [1];
    if (robots.hasNoSnippet || max === 0) scores.push(l.noSnippet);
    else if (max !== undefined && max > 0 && max < l.shortMaxSnippet) scores.push(l.shortScore);
    if (share >= l.hiddenMajorShare) scores.push(l.hiddenMajorScore);
    else if (share >= l.hiddenPartShare) scores.push(l.hiddenPartScore);
    return Math.min(...scores);
  }

  private indexEvidence(robots: PageData['robotsMeta']): EvidenceLine[] {
    const meta = robots.rawContent?.trim();
    const header = robots.headerContent?.trim();
    const metaNoIndex = !!meta && /(^|,)\s*(noindex|none)\s*(,|$)/i.test(meta);
    // The noindex may sit only in the X-Robots-Tag header: quote that then.
    const raw = robots.hasNoIndex && !metaNoIndex && header ? `X-Robots-Tag: ${header}` : meta;
    const evidence: EvidenceLine[] = [];
    if (robots.hasNoIndex) evidence.push({ key: 'ev_indexability_noindex', params: { raw: clip(raw || 'noindex') } });
    else if (raw) evidence.push({ key: 'ev_indexability_ok_raw', params: { raw: clip(raw) } });
    else evidence.push({ key: 'ev_indexability_ok' });
    if (header && !(robots.hasNoIndex && raw?.startsWith('X-Robots-Tag'))) {
      evidence.push({ key: 'ev_indexability_header', params: { raw: clip(header) } });
    }
    if (robots.hasNoSnippet || robots.maxSnippet === 0) {
      evidence.push({ key: 'ev_indexability_nosnippet' });
    } else if (robots.maxSnippet !== undefined && robots.maxSnippet > 0) {
      evidence.push({ key: 'ev_indexability_max_snippet', params: { limit: robots.maxSnippet } });
    }
    const share = robots.noSnippetShare ?? 0;
    if (share >= GEO_CONFIG.onPageSeo.snippetLimits.hiddenPartShare) {
      evidence.push({ key: 'ev_indexability_data_nosnippet', params: { percent: Math.round(share * 100) } });
    }
    return evidence;
  }

  private viewportEvidence(vp: PageData['viewport']): EvidenceLine[] {
    const raw = clip(vp.rawContent ?? '');
    const evidence: EvidenceLine[] = [];
    if (!vp.hasViewport) evidence.push({ key: 'ev_viewport_missing' });
    else if (!vp.hasDeviceWidth) evidence.push({ key: 'ev_viewport_no_device_width', params: { content: raw } });
    else evidence.push({ key: 'ev_viewport_ok', params: { content: raw } });
    if (vp.hasViewport && vp.userScalableNo) evidence.push({ key: 'ev_viewport_no_zoom' });
    return evidence;
  }

  // Self-referencing comparison ignores query string and hash on both sides:
  // a canonical that strips tracking parameters (?utm_…) is correct usage,
  // not a mismatch. Trailing slashes and host case are normalized too.
  private normalizeForCanonical(url: string): string | null {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/+$/, '') || '/';
      return `${u.protocol}//${u.host.toLowerCase()}${path}`;
    } catch {
      return null;
    }
  }

  private scoreTitle(len: number): number {
    if (len === 0) return 0;
    const { titleMinLength: min, titleMaxLength: max } = GEO_CONFIG.onPageSeo.thresholds;
    if (len >= min && len <= max) return 1;
    if (len < min) return Math.max(0.3, len / min);
    // Over max — penalty grows with how far over
    const over = len - max;
    return Math.max(0.3, 1 - over / max);
  }

  private scoreDescription(len: number): number {
    if (len === 0) return 0;
    const { descriptionMinLength: min, descriptionMaxLength: max } = GEO_CONFIG.onPageSeo.thresholds;
    if (len >= min && len <= max) return 1;
    if (len < min) return Math.max(0.3, len / min);
    const over = len - max;
    return Math.max(0.3, 1 - over / max);
  }

  private scoreImageAlts(images: PageData['images']): {
    score: number;
    withAlt: number;
    totalImages: number;
  } {
    if (images.length === 0) return { score: 1, withAlt: 0, totalImages: 0 };
    // Decorative alt="" still counts as "intentionally handled".
    const withAlt = images.filter((img) => img.hasAltAttribute).length;
    return { score: withAlt / images.length, withAlt, totalImages: images.length };
  }

  // Six tags a shared link needs to render a proper preview. twitter:card is
  // its own check: X falls back to og:title/description/image, but without
  // twitter:card it only shows the small summary card. og:type must say
  // "article" on an article page (Schema.org Article-family type) — "website"
  // there is a common CMS default that misclassifies the page. An og:image
  // that is the site logo or a placeholder does not count.
  private scoreSocialCards(pageData: PageData): {
    score: number;
    foundCount: number;
    totalCount: number;
    missing: string[];
    evidence: EvidenceLine[];
  } {
    const og = pageData.openGraph;
    const tw = pageData.twitterCard;
    const isArticle = pageData.schema.some((s) => hasSchemaType(s, ARTICLE_SCHEMA_TYPES));
    const ogType = (og.type || pageData.meta.ogType || '').trim().toLowerCase();

    const checks: { tag: string; ok: boolean }[] = [
      { tag: 'og:title', ok: !!og.title?.trim() },
      { tag: 'og:description', ok: !!og.description?.trim() },
      {
        tag: og.image?.trim() ? 'og:image (logo/default)' : 'og:image',
        ok: !!og.image?.trim() && !this.isGenericImage(og.image),
      },
      { tag: 'og:url', ok: !!og.url?.trim() },
      {
        tag: isArticle && ogType ? 'og:type=article' : 'og:type',
        ok: isArticle ? ogType === 'article' : ogType.length > 0,
      },
      { tag: 'twitter:card', ok: !!tw.card?.trim() },
    ];
    const foundCount = checks.filter((c) => c.ok).length;
    const missing = checks.filter((c) => !c.ok).map((c) => c.tag);

    // Report: which tags are there, which are missing, and what a shared
    // link then looks like.
    const evidence: EvidenceLine[] = [];
    const present = checks.filter((c) => c.ok).map((c) => c.tag.replace(' (logo/default)', ''));
    if (present.length > 0) evidence.push({ key: 'ev_social_cards_present', params: { tags: present.join(', ') } });
    if (missing.length > 0) evidence.push({ key: 'ev_social_cards_missing', params: { tags: missing.join(', ') } });
    const ogImage = og.image?.trim();
    const genericImage = !!ogImage && this.isGenericImage(ogImage);
    if (genericImage) evidence.push({ key: 'ev_social_cards_generic_image', params: { file: fileName(ogImage!) } });
    if (isArticle && ogType && ogType !== 'article') {
      evidence.push({ key: 'ev_social_cards_type', params: { type: clip(ogType, 30) } });
    }
    if (!og.title?.trim() || !og.description?.trim()) evidence.push({ key: 'ev_social_cards_preview_notext' });
    if (!ogImage || genericImage) evidence.push({ key: 'ev_social_cards_preview_noimage' });
    if (!tw.card?.trim()) evidence.push({ key: 'ev_social_cards_preview_x' });
    if (!og.url?.trim()) evidence.push({ key: 'ev_social_cards_preview_nourl' });
    if (missing.length === 0) evidence.push({ key: 'ev_social_cards_preview_ok' });

    return {
      score: foundCount / checks.length,
      foundCount,
      totalCount: checks.length,
      missing,
      evidence,
    };
  }

  private isGenericImage(src: string): boolean {
    let path = src;
    try {
      path = new URL(src, 'https://x.invalid').pathname;
    } catch {
      // keep the raw value
    }
    const file = path.split('/').pop() ?? '';
    return GENERIC_OG_IMAGE.test(file.replace(/\.[a-z0-9]+$/i, ''));
  }
}
