import type { AnalyzeResponse } from '../types/analysis';
import { extractPageData } from '../utils/dom-helpers';
import { runFullAnalysis } from '../analyzers';
import { initI18n, setLang } from '../utils/i18n';
import type { Lang } from '../utils/i18n';

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
    message: { action: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: AnalyzeResponse | { hash: string }) => void
  ) => {
    if (message.action === 'getHash') {
      sendResponse({ hash: computeContentHash() });
      return false;
    }

    if (message.action === 'analyze') {
      // Handle async analysis
      (async () => {
        try {
          // Load saved language before analysis
          const data = await chrome.storage.local.get('geo_lang');
          if (data['geo_lang']) {
            setLang(data['geo_lang'] as Lang);
          }

          // Extract page data from DOM (async for llms.txt fetch)
          const pageData = await extractPageData();

          // Run full analysis
          const result = runFullAnalysis(pageData);

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
