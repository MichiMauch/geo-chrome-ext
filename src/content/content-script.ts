import type { AnalyzeResponse, HighlightTarget } from '../types/analysis';
import { extractPageData, checkLlmsTxt, checkRobotsTxt } from '../utils/dom-helpers';
import { runFullAnalysis } from '../analyzers';
import { initI18n, setLang } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { computeHighlightTargets } from '../utils/highlight-targets';
import { applyHighlights, clearHighlights, scrollToFirst } from '../utils/highlight';
import { discoverSitemapPages } from '../utils/sitemap';
import { analyzeCrawlerView } from '../utils/crawler-view';
import { saveAnalysis } from '../utils/history';
import { reportAnalysis } from '../utils/analytics';

async function loadSavedLang(): Promise<void> {
  const data = await chrome.storage.local.get('geo_lang');
  if (data['geo_lang']) setLang(data['geo_lang'] as Lang);
}

// Sitemap batch: fetch sibling pages of THIS site (same-origin, so no host
// permission needed), parse them with DOMParser and run the full analysis on
// the static HTML. Results go straight into history/analytics from here, so
// the batch survives even if the panel closes; progress messages are
// fire-and-forget for the panel UI. Note: client-side-rendered SPAs yield
// the raw HTML only — their scores reflect what crawlers without JS see.
async function runBatchAnalysis(maxPages: number): Promise<void> {
  const notify = (payload: Record<string, unknown>) => {
    chrome.runtime.sendMessage(payload).catch(() => {});
  };
  try {
    await loadSavedLang();
    const urls = await discoverSitemapPages(
      window.location.origin,
      window.location.href,
      maxPages
    );
    if (urls.length === 0) {
      notify({ type: 'batch-done', analyzed: 0, total: 0, noSitemap: true });
      return;
    }
    notify({ type: 'batch-start', total: urls.length });

    // Domain-level checks once per batch, not per page
    const [llmsTxt, robotsTxt] = await Promise.all([checkLlmsTxt(), checkRobotsTxt()]);

    let analyzed = 0;
    let processed = 0;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const pageData = await extractPageData(parsed, url, { llmsTxt, robotsTxt });
        const result = runFullAnalysis(pageData);
        await saveAnalysis(result);
        void reportAnalysis(result);
        analyzed++;
      } catch {
        // Single page failed — keep going
      }
      processed++;
      notify({ type: 'batch-progress', current: processed, total: urls.length });
      // Be polite to the server
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    notify({ type: 'batch-done', analyzed, total: urls.length });
  } catch {
    notify({ type: 'batch-done', analyzed: 0, total: 0, noSitemap: true });
  }
}

// Initialize i18n for analyzer strings
initI18n();

// Compute a quick hash of the page's key content
function computeContentHash(): string {
  const parts: string[] = [];
  parts.push(document.title);
  parts.push(document.querySelector('meta[name="description"]')?.getAttribute('content') || '');

  // All headings
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    parts.push(h.tagName + ':' + (h.textContent || '').trim());
  });

  // Body text content length + first/last 500 chars as fingerprint
  const bodyText = (document.body?.textContent || '').replace(/\s+/g, ' ').trim();
  parts.push('LEN:' + bodyText.length);
  parts.push(bodyText.slice(0, 500));
  parts.push(bodyText.slice(-500));

  // Number of structural elements
  parts.push('P:' + document.querySelectorAll('p').length);
  parts.push('L:' + document.querySelectorAll('ul,ol').length);
  parts.push('A:' + document.querySelectorAll('a').length);
  // Alt-attribute fingerprint: fixing alt texts doesn't change the body text,
  // but must bust the cache (alt coverage score + highlight targets).
  parts.push('IMG:' + document.querySelectorAll('img').length + ':' + document.querySelectorAll('img:not([alt])').length);

  // Simple string hash (djb2)
  const str = parts.join('|');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(
  (
    message: { action: string; targets?: HighlightTarget[]; severity?: string; maxPages?: number },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (
      response:
        | AnalyzeResponse
        | { hash: string }
        | { count: number }
        | { cleared: boolean }
        | { started: boolean }
    ) => void
  ) => {
    if (message.action === 'getHash') {
      sendResponse({ hash: computeContentHash() });
      return false;
    }

    // Mark the affected elements on the page and scroll to the first one.
    if (message.action === 'highlight') {
      const targets = message.targets || [];
      const severity =
        message.severity === 'high' || message.severity === 'info'
          ? message.severity
          : 'medium';
      const count = applyHighlights(targets, severity);
      if (count > 0) scrollToFirst(targets);
      sendResponse({ count });
      return false;
    }

    if (message.action === 'clear-highlights') {
      clearHighlights();
      sendResponse({ cleared: true });
      return false;
    }

    if (message.action === 'batch-analyze') {
      void runBatchAnalysis(
        typeof message.maxPages === 'number' ? message.maxPages : 10
      );
      sendResponse({ started: true });
      return false;
    }

    if (message.action === 'analyze') {
      // Stale markers from a previous round must not survive a re-analysis.
      clearHighlights();

      // Handle async analysis
      (async () => {
        try {
          // Load saved language before analysis
          const data = await chrome.storage.local.get('geo_lang');
          if (data['geo_lang']) {
            setLang(data['geo_lang'] as Lang);
          }

          // Extract page data from DOM (async for llms.txt fetch). In
          // parallel, re-fetch the page the way a JS-less AI crawler would see
          // it — the comparison is what keeps client-rendered sites from
          // scoring on content no bot ever receives.
          const [pageData, crawlerView] = await Promise.all([
            extractPageData(),
            analyzeCrawlerView().catch(() => undefined),
          ]);
          pageData.crawlerView = crawlerView;

          // Run full analysis
          const result = runFullAnalysis(pageData);
          result.crawlerView = crawlerView;

          // Selectors of the elements behind each recommendation, for the
          // "show on page" buttons in the panel. Collectors only run for
          // recommendations the analysis actually fired.
          const fired = new Set(
            Object.values(result.categories).flatMap((c) => c.recommendations)
          );
          result.highlightTargets = computeHighlightTargets(document, fired);

          // Heading outline for the collapsible structure view in the panel.
          // Live-response only — saveAnalysis persists just the score summary.
          result.headings = pageData.headings;

          sendResponse({
            success: true,
            result,
          });
        } catch (error) {
          console.error('GEO Analyzer error:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();
    }

    // Return true to indicate async response
    return true;
  }
);

// Log that content script is loaded (for debugging)
console.log('GEO Analyzer content script loaded');
