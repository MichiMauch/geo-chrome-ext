import { PageData, AnalysisCategory, CategoryDetail, PageType } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { isWithinLastYear } from '../utils/dom-helpers';
import { getSourceLinks } from '../utils/source-links';

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

    // The newest date decides what is shown, not the first one found. A page
    // can carry a 2021 publication date and a current modification date; with
    // dates[0] the panel then showed 2021 next to a full freshness point.
    const neustesDatum = hasDate
      ? pageData.dates.reduce((a, b) => (b.date > a.date ? b : a))
      : null;

    let dateValue: string;
    let dateParams: Record<string, string> | undefined;
    if (!neustesDatum) {
      dateValue = 'value_noDateFound';
    } else if (hasRecentDate) {
      dateValue = neustesDatum.formatted;
    } else {
      // The translation carries a {date} placeholder — without the parameter
      // the panel showed it verbatim.
      dateValue = 'value_olderThanYear';
      dateParams = { date: neustesDatum.formatted };
    }

    if (skipAuthorDate) {
      details.push(this.notApplicable('criterion_date'));
    } else details.push({
      criterionKey: 'criterion_date',
      found: hasDate,
      value: dateValue,
      valueParams: dateParams,
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
    // Shared filter with AiCitation: only external content links with text,
    // no social/share widgets, no header/nav/footer links.
    const sourceLinks = getSourceLinks(pageData.links);
    const linksNeeded = config.thresholds.sourceLinksTarget;
    const hasQualityLinks = sourceLinks.length >= linksNeeded;

    details.push({
      criterionKey: 'criterion_sources',
      found: hasQualityLinks,
      // The real count — progress caps at the target, the value doesn't.
      value: 'value_sourceLinks',
      valueParams: { count: String(sourceLinks.length), target: String(linksNeeded) },
      weight: config.weights.externalSources,
      progress: {
        current: Math.min(sourceLinks.length, linksNeeded),
        target: linksNeeded,
        unitKey: 'unit_links',
      },
    });

    if (hasQualityLinks) {
      weightedScore += config.weights.externalSources;
    } else if (sourceLinks.length > 0) {
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
