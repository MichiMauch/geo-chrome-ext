// AI crawler view: what a bot without JavaScript actually receives.
//
// The analysis runs on the rendered DOM, which is what a human sees after
// hydration. GPTBot, ClaudeBot and PerplexityBot do not execute JavaScript —
// they index the HTML the server sent. On client-rendered sites those two are
// very different documents, and the score would otherwise be far too kind.
//
// We approximate the crawler by re-fetching the same URL without cookies and
// parsing the response with DOMParser (no scripts run). Same-origin, so
// `activeTab` covers it — no host permissions, no install warning. What this
// cannot do is spoof the User-Agent (fetch forbids that header), so servers
// that cloak by UA are out of scope.

import type { CrawlerViewData } from '../types/analysis';

// Below this the difference is noise (cookie banners, injected widgets)
// rather than missing content.
const IGNORED_DELTA_CHARS = 500;
const OK_COVERAGE = 0.8;
const JS_ONLY_COVERAGE = 0.25;
const JS_ONLY_CHARS = 200;
const MAX_MISSING_HEADINGS = 5;

const AUTH_URL_PATTERN =
  /(^|\/)(login|signin|sign-in|anmelden|auth|authorize|account\/login|session\/new)(\/|$|\?)/i;

export async function analyzeCrawlerView(
  renderedDoc: Document = document,
  pageUrl: string = window.location.href
): Promise<CrawlerViewData | undefined> {
  let response: Response;
  try {
    response = await fetch(pageUrl, {
      credentials: 'omit', // a crawler has no session
      cache: 'no-store',
      redirect: 'follow',
    });
  } catch {
    // Offline, CORS, blocked — say nothing rather than something wrong.
    return undefined;
  }

  // A crawler that gets 401/403 sees no content at all, and that is a finding
  // in itself — but not one about JavaScript.
  if (response.status === 401 || response.status === 403) {
    return authWall(response.status);
  }
  if (!response.ok) return undefined;

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/html/i.test(contentType)) return undefined;

  let html: string;
  try {
    html = await response.text();
  } catch {
    return undefined;
  }

  const rawDoc = new DOMParser().parseFromString(html, 'text/html');

  if (looksLikeAuthWall(renderedDoc, rawDoc, pageUrl, response.url)) {
    return authWall(response.status);
  }

  return compareDocuments(renderedDoc, rawDoc, {
    httpStatus: response.status,
    rawBytes: byteLength(html),
  });
}

function authWall(httpStatus: number): CrawlerViewData {
  return {
    status: 'auth-wall',
    httpStatus,
    renderedChars: 0,
    rawChars: 0,
    coverage: 0,
    renderedHeadings: 0,
    rawHeadings: 0,
    renderedHasH1: false,
    rawHasH1: false,
    renderedSchemaBlocks: 0,
    rawSchemaBlocks: 0,
    rawBytes: 0,
    missingHeadings: [],
  };
}

/**
 * Compares the rendered page with the HTML a crawler downloads. Split out from
 * the fetch so it can be tested with two plain documents.
 */
export function compareDocuments(
  renderedDoc: Document,
  rawDoc: Document,
  meta: { httpStatus: number; rawBytes: number }
): CrawlerViewData {
  const renderedText = extractText(renderedDoc);
  const rawText = extractText(rawDoc);
  const renderedChars = renderedText.length;
  const rawChars = rawText.length;

  const coverage =
    renderedChars === 0 ? 1 : Math.min(1, rawChars / renderedChars);
  const delta = renderedChars - rawChars;

  let status: CrawlerViewData['status'];
  if (coverage >= OK_COVERAGE || delta < IGNORED_DELTA_CHARS) {
    status = 'ok';
  } else if (coverage < JS_ONLY_COVERAGE || rawChars < JS_ONLY_CHARS) {
    status = 'js-only';
  } else {
    status = 'partial';
  }

  const renderedHeadings = headingTexts(renderedDoc);
  const rawHeadings = headingTexts(rawDoc);
  const rawHeadingSet = new Set(rawHeadings.map((h) => h.toLowerCase()));

  return {
    status,
    httpStatus: meta.httpStatus,
    renderedChars,
    rawChars,
    coverage,
    renderedHeadings: renderedHeadings.length,
    rawHeadings: rawHeadings.length,
    renderedHasH1: renderedDoc.querySelector('h1') !== null,
    rawHasH1: rawDoc.querySelector('h1') !== null,
    renderedSchemaBlocks: countSchemaBlocks(renderedDoc),
    rawSchemaBlocks: countSchemaBlocks(rawDoc),
    rawBytes: meta.rawBytes,
    missingHeadings: renderedHeadings
      .filter((h) => !rawHeadingSet.has(h.toLowerCase()))
      .slice(0, MAX_MISSING_HEADINGS),
  };
}

/**
 * A cookie-less fetch of a members-only page lands on a login form. That is not
 * "the content needs JavaScript", so it must not be reported as one.
 */
function looksLikeAuthWall(
  renderedDoc: Document,
  rawDoc: Document,
  requestedUrl: string,
  finalUrl: string
): boolean {
  if (finalUrl && finalUrl !== requestedUrl) {
    try {
      const from = new URL(requestedUrl);
      const to = new URL(finalUrl);
      if (from.pathname !== to.pathname && AUTH_URL_PATTERN.test(to.pathname)) {
        return true;
      }
    } catch {
      // Unparseable URLs fall through to the form check below
    }
  }

  // A password field the logged-in page does not have means we were bounced
  // to a login screen.
  return (
    rawDoc.querySelector('input[type="password"]') !== null &&
    renderedDoc.querySelector('input[type="password"]') === null
  );
}

// Body text as a crawler would read it, minus everything that is not content:
// scripts, styles, the "enable JavaScript" noscript notice, and this
// extension's own in-page markers.
export function extractText(doc: Document): string {
  const body = doc.body;
  if (!body) return '';
  const clone = body.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('script, style, noscript, template, svg, #geoa-highlight-badges')
    .forEach((el) => el.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function headingTexts(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0);
}

function countSchemaBlocks(doc: Document): number {
  return doc.querySelectorAll('script[type="application/ld+json"]').length;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
