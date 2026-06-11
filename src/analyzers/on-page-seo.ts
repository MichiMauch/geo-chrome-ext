import { PageData, AnalysisCategory, CategoryDetail } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';

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
      value: titleLen === 0 ? 'value_notPresent' : `${titleLen} ${titleLen === 1 ? 'char' : 'chars'}`,
      weight: config.weights.titleQuality,
      progress: {
        current: Math.round(titleScore * 100),
        target: 100,
        unitKey: 'unit_percent',
      },
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
      value: descLen === 0 ? 'value_notPresent' : `${descLen} ${descLen === 1 ? 'char' : 'chars'}`,
      weight: config.weights.metaDescription,
      progress: {
        current: Math.round(descScore * 100),
        target: 100,
        unitKey: 'unit_percent',
      },
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
    });
    // No-images pages get full credit (nothing to fail on)
    const altWeightContribution = altResult.totalImages === 0 ? 1 : altResult.score;
    weightedScore += altWeightContribution * config.weights.imageAlts;
    totalWeight += config.weights.imageAlts;

    // Check 4: Indexability (robots-meta / noindex)
    const robots = pageData.robotsMeta;
    const indexable = !robots.hasNoIndex;
    details.push({
      criterionKey: 'criterion_indexability',
      found: indexable,
      value: indexable ? 'value_indexable' : 'value_noindex',
      weight: config.weights.indexability,
      progress: {
        current: indexable ? 1 : 0,
        target: 1,
        unitKey: 'unit_status',
      },
    });
    weightedScore += (indexable ? 1 : 0) * config.weights.indexability;
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
    });
    weightedScore += vpScore * config.weights.viewport;
    totalWeight += config.weights.viewport;

    // Check 6: Social cards (OG + Twitter)
    const socialResult = this.scoreSocialCards(pageData);
    const socialGood = socialResult.score >= 0.75;
    details.push({
      criterionKey: 'criterion_social_cards',
      found: socialGood,
      value: `${socialResult.foundCount}/${socialResult.totalCount}`,
      weight: config.weights.socialCards,
      progress: {
        current: socialResult.foundCount,
        target: socialResult.totalCount,
        unitKey: 'unit_tags',
      },
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
    });
    weightedScore += canonicalScore * config.weights.canonical;
    totalWeight += config.weights.canonical;

    const recommendations: string[] = [];
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
    if (!vp.hasViewport) recommendations.push('viewport_missing');
    else if (!vp.hasDeviceWidth) recommendations.push('viewport_misconfigured');
    if (!socialGood) recommendations.push('social_cards_missing');
    if (canonicalHref === null) recommendations.push('canonical_missing');
    else if (!isSelfCanonical) recommendations.push('canonical_mismatch');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
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

  private scoreSocialCards(pageData: PageData): {
    score: number;
    foundCount: number;
    totalCount: number;
  } {
    // Score the most important fields. Twitter card can fall back to OG.
    const og = pageData.openGraph;
    const tw = pageData.twitterCard;
    const checks: boolean[] = [
      !!og.title,
      !!og.description,
      !!og.image,
      !!(tw.card || og.title), // a twitter:card or a fallback OG is acceptable
    ];
    const foundCount = checks.filter(Boolean).length;
    return { score: foundCount / checks.length, foundCount, totalCount: checks.length };
  }
}
