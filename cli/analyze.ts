// One page through the same steps as the extension's live analysis, on the
// HTML the server sends (what a JS-less AI crawler sees): fetch → DOMParser →
// extractPageData → sitemap and Bing check → bot probe → X-Robots-Tag →
// runFullAnalysis. robots.txt, llms.txt and sitemaps are fetched once per
// origin and served from a cache for every further page of a run.
import { installDomGlobals } from './dom';
import { extractPageData } from '../src/utils/dom-helpers';
import { withXRobotsTag } from '../src/utils/x-robots-tag';
import { checkSitemap, detectBingVerification } from '../src/utils/sitemap-check';
import { PROBE_BOTS, isBlockedResponse } from '../src/utils/bot-access';
import { runFullAnalysis } from '../src/analyzers';
import type { BotAccessData, GEOAnalysisResult } from '../src/types/analysis';

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// --bot: fetch the page as one of the probe crawlers instead of a browser
export const BOT_UAS: Record<string, string> = Object.fromEntries(
  Object.entries(PROBE_BOTS).map(([bot, ua]) => [bot.toLowerCase(), ua])
);

const TIMEOUT_MS = 20_000;

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  html: string;
  xRobotsTag: string | null;
}

export interface AnalyzeOptions {
  userAgent?: string;
  // Probe the page with AI-crawler User-Agents for CDN/firewall blocks
  botProbe?: boolean;
}

export class PageFetchError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// Plain-text side files (robots.txt, llms.txt, sitemaps, BingSiteAuth.xml) are
// the same for every page of an origin. Cached per URL for one process.
const sideFileCache = new Map<string, Promise<{ status: number; headers: [string, string][]; body: string }>>();

let baseFetch: typeof fetch = globalThis.fetch;
let installedUa: string | null = null;

/** Replaces the global fetch the extractors use with a cached, UA-setting one. */
export function installFetch(userAgent: string = BROWSER_UA, fetchImpl: typeof fetch = baseFetch): void {
  baseFetch = fetchImpl;
  installedUa = userAgent;
  sideFileCache.clear();
  botProbeCache.clear();
  globalThis.fetch = cachedFetch;
}

const withUa = (init?: RequestInit): RequestInit => {
  const headers = new Headers(init?.headers);
  if (!headers.has('user-agent')) headers.set('user-agent', installedUa ?? BROWSER_UA);
  if (!headers.has('accept-language')) headers.set('accept-language', 'de-CH,de;q=0.9,en;q=0.8');
  return { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), ...init, headers };
};

const cachedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  let entry = sideFileCache.get(url);
  if (!entry) {
    entry = baseFetch(url, withUa(init)).then(async (res) => ({
      status: res.status,
      headers: [...res.headers.entries()],
      body: await res.text(),
    }));
    // A failed request is not cached, the next page may try again
    entry.catch(() => sideFileCache.delete(url));
    sideFileCache.set(url, entry);
  }
  const { status, headers, body } = await entry;
  // Response forbids a body for these statuses
  const nullBody = status === 204 || status === 304;
  return new Response(nullBody ? null : body, { status, headers });
}) as typeof fetch;

export async function fetchPage(url: string, userAgent?: string): Promise<FetchedPage> {
  let res: Response;
  try {
    res = await baseFetch(url, withUa(userAgent ? { headers: { 'user-agent': userAgent } } : undefined));
  } catch (err) {
    throw new PageFetchError(url, 0, `${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const html = await res.text();
  if (!res.ok) throw new PageFetchError(url, res.status, `${url}: HTTP ${res.status}`);
  return {
    requestedUrl: url,
    finalUrl: res.url || url,
    status: res.status,
    html,
    xRobotsTag: res.headers.get('x-robots-tag'),
  };
}

// Same rule as the extension's probe: a 401/403/429/… (or a Cloudflare
// challenge) for a bot while the browser fetch got the page.
async function probeBots(pageUrl: string): Promise<BotAccessData | undefined> {
  const checked: string[] = [];
  const blocked: BotAccessData['blocked'] = [];
  for (const [bot, userAgent] of Object.entries(PROBE_BOTS)) {
    let res: Response;
    try {
      res = await baseFetch(pageUrl, withUa({ headers: { 'user-agent': userAgent } }));
    } catch {
      continue; // network error: says nothing about a block
    }
    res.body?.cancel().catch(() => {});
    checked.push(bot);
    if (isBlockedResponse(res.status, res.headers)) blocked.push({ bot, status: res.status });
  }
  return checked.length > 0 ? { checked, blocked } : undefined;
}

// Bot rules of a CDN apply to the whole origin as a rule; probing every page
// of a sitemap run would multiply the requests by five for nothing.
const botProbeCache = new Map<string, Promise<BotAccessData | undefined>>();

/** Analyzes HTML that was fetched (or read from a file) for the given URL. */
export async function analyzeHtml(page: FetchedPage, options: AnalyzeOptions = {}): Promise<GEOAnalysisResult> {
  installDomGlobals();
  if (globalThis.fetch !== cachedFetch) installFetch(options.userAgent);

  const doc = new DOMParser().parseFromString(page.html, 'text/html');
  const url = page.finalUrl;
  const pageData = await extractPageData(doc, url);

  const [sitemap, bingVerification] = await Promise.all([
    checkSitemap(url, pageData.robotsTxt.content).catch(() => undefined),
    detectBingVerification(doc, url).catch(() => null),
  ]);
  pageData.sitemap = sitemap && { ...sitemap, bingVerification };

  if (options.botProbe !== false && /^https?:/.test(url)) {
    const origin = new URL(url).origin;
    let probe = botProbeCache.get(origin);
    if (!probe) {
      probe = probeBots(url).catch(() => undefined);
      botProbeCache.set(origin, probe);
    }
    pageData.botAccess = await probe;
  }

  pageData.robotsMeta = withXRobotsTag(pageData.robotsMeta, page.xRobotsTag);
  return runFullAnalysis(pageData);
}

export async function analyzeUrl(url: string, options: AnalyzeOptions = {}): Promise<GEOAnalysisResult> {
  installDomGlobals();
  if (globalThis.fetch !== cachedFetch) installFetch(options.userAgent);
  const page = await fetchPage(url, options.userAgent);
  return analyzeHtml(page, options);
}
