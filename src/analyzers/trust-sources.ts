import { PageData, AnalysisCategory, CategoryDetail, PageType } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { isWithinLastYear } from '../utils/dom-helpers';

export class TrustSourcesAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_trustSources';

  analyze(pageData: PageData, pageType?: PageType): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.trustSources;

    // Homepages and product pages legitimately have no author/byline or
    // publication date — don't penalize what doesn't belong there.
    const skipAuthorDate = pageType === 'homepage' || pageType === 'product';

    // Check 1: Autor/Organisation erkennbar
    const hasAuthor = pageData.author !== null;

    if (skipAuthorDate) {
      details.push(this.notApplicable('criterion_author'));
    } else {
      details.push({
        criterionKey: 'criterion_author',
        found: hasAuthor,
        value: pageData.author?.name || 'value_notRecognizable',
        weight: config.weights.authorOrg,
        progress: {
          current: hasAuthor ? 1 : 0,
          target: 1,
          unitKey: 'unit_author',
        },
      });

      if (hasAuthor) weightedScore += config.weights.authorOrg;
      totalWeight += config.weights.authorOrg;
    }

    // Check 2: Datum/Aktualität
    const hasDate = pageData.dates.length > 0;
    const hasRecentDate = hasDate && pageData.dates.some((d) => isWithinLastYear(d.date));

    let dateValue: string;
    if (!hasDate) {
      dateValue = 'value_noDateFound';
    } else if (hasRecentDate) {
      dateValue = pageData.dates[0].formatted;
    } else {
      dateValue = 'value_olderThanYear'; // Mapping layer will handle interpolation
    }

    if (skipAuthorDate) {
      details.push(this.notApplicable('criterion_date'));
    } else details.push({
      criterionKey: 'criterion_date',
      found: hasDate,
      value: dateValue,
      weight: config.weights.date,
      progress: {
        current: hasRecentDate ? 1 : (hasDate ? 0.5 : 0),
        target: 1,
        unitKey: 'unit_date',
      },
    });

    if (!skipAuthorDate) {
      if (hasRecentDate) {
        weightedScore += config.weights.date;
      } else if (hasDate) {
        weightedScore += config.thresholds.datePartialCredit;
      }
      totalWeight += config.weights.date;
    }

    // Check 3: Externe Quellen/Referenzen
    const externalLinks = pageData.links.filter((l) => l.isExternal);
    const qualityExternalLinks = externalLinks.filter((l) => {
      const href = l.href.toLowerCase();
      return (
        !href.includes('facebook.com') &&
        !href.includes('twitter.com') &&
        !href.includes('instagram.com') &&
        !href.includes('linkedin.com/share') &&
        !href.includes('google.com/analytics')
      );
    });

    const linksNeeded = 2;
    const hasQualityLinks = qualityExternalLinks.length >= linksNeeded;

    details.push({
      criterionKey: 'criterion_sources',
      found: hasQualityLinks,
      value: 'value_externalLinks',
      weight: config.weights.externalSources,
      progress: {
        current: Math.min(qualityExternalLinks.length, linksNeeded),
        target: linksNeeded,
        unitKey: 'unit_links',
      },
    });

    if (hasQualityLinks) {
      weightedScore += config.weights.externalSources;
    } else if (qualityExternalLinks.length > 0) {
      weightedScore += config.thresholds.sourcePartialCredit;
    }
    totalWeight += config.weights.externalSources;

    const recommendations: string[] = [];
    if (!skipAuthorDate && !hasAuthor) recommendations.push('no_author');
    if (!skipAuthorDate && !hasDate) recommendations.push('no_date');
    if (!hasQualityLinks) recommendations.push('few_sources');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }
}
