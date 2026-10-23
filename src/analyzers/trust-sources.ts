import { PageData, AnalysisCategory, CategoryDetail, PageType, DateData, EvidenceLine } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { isWithinLastYear } from '../utils/dom-helpers';
import { getSourceLinks } from '../utils/source-links';
import { excludedLinkEvidence, hostList } from './trust-evidence';

const DAY_MS = 24 * 60 * 60 * 1000;

const AUTHOR_EVIDENCE_KEY = {
  schema: 'ev_author_schema',
  meta: 'ev_author_meta',
  publisher: 'ev_author_publisher',
  dom: 'ev_author_byline',
} as const;

// Calendar date, the same in every language and readable without a clock
// time ("2026-09-10" instead of "2026-09-10T09:01:46+00:00").
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Whether a found date is the page's modification or publication date:
// compared against the schema.org and meta fields by timestamp.
function dateKind(found: DateData, pageData: PageData): 'modified' | 'published' | 'visible' {
  const same = (value: unknown) => {
    if (typeof value !== 'string' || !value) return false;
    const time = new Date(value).getTime();
    return !isNaN(time) && time === found.date.getTime();
  };
  if (pageData.schema.some((s) => same(s.dateModified)) || same(pageData.meta.modifiedDate)) return 'modified';
  if (pageData.schema.some((s) => same(s.datePublished)) || same(pageData.meta.publishDate)) return 'published';
  if (found.source === 'meta') return 'published';
  return 'visible';
}

const VISIBLE_SOURCES = new Set<DateData['source']>(['time-element', 'text']);

// Whether the newest date can be read on the page, not only in markup.
// Same calendar day counts: visible dates rarely carry a time.
function isNewestVisible(pageData: PageData, newest: DateData): boolean {
  const day = isoDay(newest.date);
  return pageData.dates.some((d) => VISIBLE_SOURCES.has(d.source) && isoDay(d.date) === day);
}

function dateEvidence(pageData: PageData, newest: DateData | null, recent: boolean): EvidenceLine[] {
  if (!newest) return [{ key: 'ev_date_none' }];
  const lines: EvidenceLine[] = [];
  const kind = dateKind(newest, pageData);
  lines.push({ key: `ev_date_newest_${kind}`, params: { date: isoDay(newest.date) } });

  const days = Math.max(0, Math.floor((Date.now() - newest.date.getTime()) / DAY_MS));
  if (days <= 1) lines.push({ key: 'ev_date_age_today' });
  else if (days <= 60) lines.push({ key: 'ev_date_age_days', params: { days } });
  else if (days < 730) lines.push({ key: 'ev_date_age_months', params: { months: Math.floor(days / 30.44) } });
  else lines.push({ key: 'ev_date_age_years', params: { years: Math.floor(days / 365.25) } });
  if (!recent) lines.push({ key: 'ev_date_stale' });

  // The other date, when there is one: publication next to a newer change,
  // or the hint that no modification date exists at all.
  const published = pageData.dates.find((d) => d !== newest && dateKind(d, pageData) === 'published');
  if (kind === 'modified' && published) {
    lines.push({ key: 'ev_date_also_published', params: { date: isoDay(published.date) } });
  } else if (kind === 'published') {
    lines.push({ key: 'ev_date_no_modified' });
  }
  if (!isNewestVisible(pageData, newest)) {
    const visible = pageData.dates.filter((d) => VISIBLE_SOURCES.has(d.source));
    const shown = visible.length > 0 ? visible.reduce((a, b) => (b.date > a.date ? b : a)) : null;
    lines.push(
      shown
        ? { key: 'ev_date_invisible_older', params: { date: isoDay(newest.date), shown: isoDay(shown.date) } }
        : { key: 'ev_date_invisible', params: { date: isoDay(newest.date) } }
    );
  }
  return lines;
}

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
        evidence: pageData.author
          ? [{ key: AUTHOR_EVIDENCE_KEY[pageData.author.source], params: { name: pageData.author.name } }]
          : [{ key: 'ev_author_none' }],
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

    const newestVisible = !neustesDatum || isNewestVisible(pageData, neustesDatum);

    let dateValue: string;
    let dateParams: Record<string, string> | undefined;
    if (!neustesDatum) {
      dateValue = 'value_noDateFound';
    } else if (hasRecentDate) {
      // Day only: the raw schema string ("2026-09-10T09:01:46+00:00") read
      // like a technical error in the panel and the report
      dateValue = isoDay(neustesDatum.date);
    } else {
      // The translation carries a {date} placeholder — without the parameter
      // the panel showed it verbatim.
      dateValue = 'value_olderThanYear';
      dateParams = { date: isoDay(neustesDatum.date) };
    }

    if (skipAuthorDate) {
      details.push(this.notApplicable('criterion_date'));
    } else details.push({
      criterionKey: 'criterion_date',
      found: hasDate,
      value: dateValue,
      valueParams: dateParams,
      weight: config.weights.date,
      evidence: dateEvidence(pageData, neustesDatum, hasRecentDate),
      fixKey: !hasDate ? 'fix_date' : !hasRecentDate ? 'fix_date_old' : newestVisible ? 'fix_date_old' : 'fix_date_visible',
      progress: {
        current: hasRecentDate ? 1 : (hasDate ? 0.5 : 0),
        target: 1,
        unitKey: 'unit_date',
      },
    });

    if (!skipAuthorDate) {
      const visibility = newestVisible ? 1 : config.thresholds.dateInvisibleFactor;
      if (hasRecentDate) {
        weightedScore += config.weights.date * visibility;
      } else if (hasDate) {
        weightedScore += config.thresholds.datePartialCredit * visibility;
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
      evidence: [
        sourceLinks.length > 0
          ? { key: 'ev_sources_found', params: { count: sourceLinks.length, target: linksNeeded, hosts: hostList(sourceLinks) } }
          : { key: 'ev_sources_none', params: { target: linksNeeded } },
        ...excludedLinkEvidence(pageData.links),
      ],
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
