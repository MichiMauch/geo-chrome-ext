// Browser entry for running the analyzer inside a website, e.g. behind an
// editor toolbar of a headless CMS. Same steps as the content script's live
// analysis, without any chrome.* API. The bot probe needs requests with a
// crawler User-Agent, which a page cannot send; the host passes its own probe
// (a server route) or leaves it out.
import type { BotAccessData, GEOAnalysisResult } from '../src/types/analysis';
import { extractPageData, extractRobotsMeta } from '../src/utils/dom-helpers';
import { runFullAnalysis } from '../src/analyzers';
import { setLang } from '../src/utils/i18n';
import type { Lang } from '../src/utils/i18n';
import { computeHighlightTargets } from '../src/utils/highlight-targets';
import { analyzeCrawlerView } from '../src/utils/crawler-view';
import { checkSitemap, detectBingVerification } from '../src/utils/sitemap-check';
import { withXRobotsTag } from '../src/utils/x-robots-tag';
import { computeContentHash } from '../src/utils/content-hash';

export type * from '../src/types/analysis';
export type { Lang } from '../src/utils/i18n';
export type { HighlightSeverity } from '../src/utils/highlight';
export type { RecommendationOwner, RecommendationEffort } from '../src/utils/recommendations';
export type { FixSnippet, FixSnippetResult, SnippetLanguage } from '../src/utils/fix-snippets';

export { t, setLang, getLang } from '../src/utils/i18n';
export { applyHighlights, clearHighlights, scrollToFirst } from '../src/utils/highlight';
export {
  recommendationMeta,
  getRecommendationPriority,
  VISIBLE_RECOMMENDATIONS,
} from '../src/utils/recommendations';
export { getFixSnippet, getSnippetLanguageLabel } from '../src/utils/fix-snippets';
export { getCategoryColor, getScoreRating } from '../src/utils/scoring';
export { PROBE_BOTS, isBlockedResponse } from '../src/utils/bot-access';

declare const __GEO_VERSION__: string;
export const GEO_CORE_VERSION: string = __GEO_VERSION__;

export interface AnalyzePageOptions {
  lang?: Lang;
  // Server-side probe with crawler User-Agents; without it the firewall check
  // is skipped, exactly as when the extension cannot arm its rule.
  probeBotAccess?: (pageUrl: string) => Promise<BotAccessData | undefined>;
  // A CDN may still serve the version from before the last save; a unique
  // query string on the crawler fetch gets the current HTML from the origin.
  bypassCdnCache?: boolean;
  // The host's own UI (toolbar, panel) is not page content. The analysis then
  // runs on a copy without it; the extractors need no layout, so the copy
  // scores exactly like the live page.
  exclude?: string;
  // The page is rendered for a signed-in editor. CMS frontends often mark
  // that view noindex (it may show drafts), so the robots directives are
  // taken from the anonymous fetch a crawler gets instead.
  signedInView?: boolean;
  // The page is not public yet (a draft). Everything that needs the public
  // page is left out instead of reported as broken: the crawler view, the
  // bot probe and the sitemap listing. The editor's noindex view says nothing
  // about the published page either, so no robots directives are assumed.
  unpublished?: boolean;
}

function withoutHostUi(exclude?: string): Document {
  if (!exclude) return document;
  const copy = document.cloneNode(true) as Document;
  copy.querySelectorAll(exclude).forEach((el) => el.remove());
  return copy;
}

/** Analyzes the live page the way the extension's side panel does. */
export async function analyzePage(options: AnalyzePageOptions = {}): Promise<GEOAnalysisResult> {
  if (options.lang) setLang(options.lang);
  const pageUrl = window.location.href;
  const doc = withoutHostUi(options.exclude);
  const crawlerUrl = options.bypassCdnCache ? withCacheBuster(pageUrl) : pageUrl;

  const [pageData, crawlerView] = await Promise.all([
    extractPageData(doc, pageUrl),
    options.unpublished ? undefined : analyzeCrawlerView(doc, crawlerUrl).catch(() => undefined),
  ]);
  if (options.unpublished) {
    pageData.robotsMeta = extractRobotsMeta(document.implementation.createHTMLDocument(''));
  } else if (options.signedInView) {
    const anonymousRobots = await fetchAnonymousRobotsMeta(crawlerUrl);
    if (anonymousRobots) pageData.robotsMeta = anonymousRobots;
  }
  const [sitemap, bingVerification] = await Promise.all([
    options.unpublished ? undefined : checkSitemap(pageUrl, pageData.robotsTxt.content).catch(() => undefined),
    detectBingVerification(doc, pageUrl).catch(() => null),
  ]);
  pageData.sitemap = sitemap && { ...sitemap, bingVerification };
  pageData.crawlerView = crawlerView;
  if (options.probeBotAccess && crawlerView && crawlerView.status !== 'auth-wall') {
    pageData.botAccess = await options.probeBotAccess(pageUrl).catch(() => undefined);
  }
  pageData.robotsMeta = withXRobotsTag(pageData.robotsMeta, crawlerView?.xRobotsTag);

  const result = runFullAnalysis(pageData);
  result.crawlerView = crawlerView;
  const fired = new Set(Object.values(result.categories).flatMap((c) => c.recommendations));
  result.highlightTargets = computeHighlightTargets(document, fired);
  result.headings = pageData.headings;
  return result;
}

async function fetchAnonymousRobotsMeta(url: string) {
  try {
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'follow' });
    if (!response.ok) return undefined;
    const raw = new DOMParser().parseFromString(await response.text(), 'text/html');
    return extractRobotsMeta(raw);
  } catch {
    return undefined;
  }
}

function withCacheBuster(pageUrl: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set('_geo', Date.now().toString(36));
  return url.href;
}

/**
 * Content fingerprint of the page, for caching a result until the content
 * changes. `ignoreSelector` drops the host's own UI (toolbar, panel) first,
 * so opening the panel does not count as a change.
 */
export function pageContentHash(exclude?: string): string {
  return computeContentHash(withoutHostUi(exclude));
}
