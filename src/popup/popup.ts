import type { GEOAnalysisResult, AnalyzeResponse, AnalysisCategory, TrendInfo } from '../types/analysis';
import { getCategoryColor } from '../utils/scoring';
import { loadHistory, saveAnalysis, clearHistory } from '../utils/history';
import { formatTrendLabel } from '../utils/trend';
import { setBadgeForTab } from '../utils/badge';
import { initI18n, t, getDateLocale, setLang, getLang } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { generateHtmlReport } from '../utils/export-html';
import { renderSparkline } from '../utils/sparkline';
import { loadCache, saveCache, clearCache } from '../utils/cache';
import { getFixSnippet, getSnippetLanguageLabel } from '../utils/fix-snippets';

// Initialize i18n before anything else
initI18n();

// Language selector elements
const langToggleEl = document.getElementById('lang-toggle')!;
const langMenuEl = document.getElementById('lang-menu')!;

// Theme management
function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.getElementById('icon-sun')!.classList.toggle('hidden', !dark);
  document.getElementById('icon-moon')!.classList.toggle('hidden', dark);
}

function initTheme() {
  chrome.storage.local.get('geo_theme', (data) => {
    const stored = data['geo_theme'] as string | undefined;
    if (stored === 'dark') {
      applyTheme(true);
    } else if (stored === 'light') {
      applyTheme(false);
    } else {
      // Follow system
      applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  });
}

initTheme();

// DOM Elements
const loadingEl = document.getElementById('loading')!;
const resultsEl = document.getElementById('results')!;
const errorEl = document.getElementById('error')!;
const notSupportedEl = document.getElementById('not-supported')!;
const retryBtn = document.getElementById('retry-btn')!;

const totalScoreEl = document.getElementById('total-score')!;
const scoreBadgeEl = document.getElementById('score-badge')!;
const scoreBarEl = document.getElementById('score-bar')!;
const pageUrlEl = document.getElementById('page-url')!;
const scoreTrendEl = document.getElementById('score-trend')!;
const categoriesEl = document.getElementById('categories')!;
const recommendationsSectionEl = document.getElementById('recommendations-section')!;
const recommendationsEl = document.getElementById('recommendations')!;
const errorMessageEl = document.getElementById('error-message')!;

// History elements
const historyToggleEl = document.getElementById('history-toggle')!;
const historyPanelEl = document.getElementById('history-panel')!;
const historyListEl = document.getElementById('history-list')!;
const historyChevronEl = document.getElementById('history-chevron')!;
const historyClearEl = document.getElementById('history-clear')!;
const sparklineEl = document.getElementById('sparkline') as HTMLCanvasElement;

const exportBtnEl = document.getElementById('export-btn')!;

// Tab-change banner (visible only when active tab changes while side panel is open)
const tabChangeBannerEl = document.getElementById('tab-change-banner')!;
const tabChangeAnalyzeBtn = document.getElementById('tab-change-analyze')!;

let historyOpen = false;
let lastResult: GEOAnalysisResult | null = null;
let analyzedUrl: string | null = null;

// Apply i18n to static HTML elements
function applyI18nToDOM() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')!;
    el.textContent = t(key);
  });
}

// State management
function showState(state: 'loading' | 'results' | 'error' | 'not-supported') {
  loadingEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  notSupportedEl.classList.add('hidden');

  switch (state) {
    case 'loading':
      loadingEl.classList.remove('hidden');
      break;
    case 'results':
      resultsEl.classList.remove('hidden');
      break;
    case 'error':
      errorEl.classList.remove('hidden');
      break;
    case 'not-supported':
      notSupportedEl.classList.remove('hidden');
      break;
  }
}

// Render trend indicator
function renderTrend(trend: TrendInfo | null) {
  if (!trend) {
    scoreTrendEl.classList.add('hidden');
    return;
  }

  const colorClass =
    trend.direction === 'up'
      ? 'text-green-600'
      : trend.direction === 'down'
        ? 'text-red-500'
        : 'text-gray-400';

  scoreTrendEl.className = `mt-1 text-xs font-medium ${colorClass}`;
  scoreTrendEl.textContent = formatTrendLabel(trend);
  scoreTrendEl.classList.remove('hidden');
}

// Render history panel
function renderHistoryList(url: string) {
  loadHistory(url).then((history) => {
    renderSparkline(sparklineEl, history.entries);

    if (history.entries.length === 0) {
      historyListEl.innerHTML =
        `<p class="text-gray-400 dark:text-gray-500 text-xs text-center py-3">${t('ui_noHistory')}</p>`;
      return;
    }

    historyListEl.innerHTML = history.entries
      .map((entry) => {
        const date = formatHistoryDate(entry.timestamp);
        return `
          <div class="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
            <span class="text-xs text-gray-500 dark:text-gray-400">${date}</span>
            <span class="text-xs font-semibold" style="color: ${entry.ratingColor}">
              ${entry.totalScore.toFixed(1)}/30
            </span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full text-white" style="background-color: ${entry.ratingColor}">
              ${entry.ratingLabel}
            </span>
          </div>`;
      })
      .join('');
  });
}

function formatHistoryDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(getDateLocale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// Render results
function renderResults(result: GEOAnalysisResult) {
  // Total score
  totalScoreEl.textContent = result.totalScore.toFixed(1);

  // Score badge
  scoreBadgeEl.textContent = result.rating.label;
  scoreBadgeEl.style.backgroundColor = result.rating.color;

  // Score bar
  const percentage = (result.totalScore / result.maxTotalScore) * 100;
  scoreBarEl.style.backgroundColor = result.rating.color;
  // Delay for animation
  setTimeout(() => {
    scoreBarEl.style.width = `${percentage}%`;
  }, 100);

  // Page URL
  try {
    const url = new URL(result.url);
    pageUrlEl.textContent = url.hostname + url.pathname;
  } catch {
    pageUrlEl.textContent = result.url;
  }

  // Categories
  categoriesEl.innerHTML = '';
  const categoryOrder: (keyof typeof result.categories)[] = [
    'contentClarity',
    'answerability',
    'trustSources',
    'machineReadability',
    'aiCitation',
    'onPageSeo',
  ];

  categoryOrder.forEach((key) => {
    const category = result.categories[key];
    categoriesEl.innerHTML += renderCategory(category);
  });

  // Recommendations
  if (result.topRecommendations.length > 0) {
    recommendationsSectionEl.classList.remove('hidden');
    recommendationsEl.innerHTML = result.topRecommendations
      .map((recKey, i) => renderRecommendationItem(recKey, i))
      .join('');
    attachSnippetHandlers(recommendationsEl);
  } else {
    recommendationsSectionEl.classList.add('hidden');
  }

  showState('results');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRecommendationItem(recKey: string, index: number): string {
  const text = t(`rec_${recKey}`);
  const snippet = getFixSnippet(recKey);
  const snippetId = `snippet-${index}`;

  if (!snippet) {
    // No matching snippet entry — render plain text
    return `<li class="recommendation-item">${escapeHtml(text)}</li>`;
  }

  if (snippet.type === 'no-snippet') {
    return `<li class="recommendation-item">
      <div>${escapeHtml(text)}</div>
      <div class="snippet-none">${escapeHtml(snippet.note)}</div>
    </li>`;
  }

  const langLabel = getSnippetLanguageLabel(snippet.language);
  return `<li class="recommendation-item">
    <div class="snippet-row-header">
      <div class="snippet-row-text">${escapeHtml(text)}</div>
      <div class="snippet-row-actions">
        <button type="button" class="snippet-toggle" data-snippet-target="${snippetId}" aria-expanded="false">
          ${escapeHtml(t('snippet_label_show'))}
        </button>
        <button type="button" class="snippet-copy" data-snippet-code="${snippetId}-code">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span class="snippet-copy-label">${escapeHtml(t('snippet_label_copy'))}</span>
        </button>
      </div>
    </div>
    <div class="snippet-preview hidden" id="${snippetId}">
      <div class="snippet-preview-header">
        <span class="snippet-lang-tag">${escapeHtml(langLabel)}</span>
        <span class="snippet-note">${escapeHtml(snippet.note)}</span>
      </div>
      <pre class="snippet-code" id="${snippetId}-code"><code>${escapeHtml(snippet.code)}</code></pre>
    </div>
  </li>`;
}

function attachSnippetHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>('.snippet-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-snippet-target');
      if (!targetId) return;
      const preview = document.getElementById(targetId);
      if (!preview) return;
      const isHidden = preview.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!isHidden));
      btn.textContent = isHidden ? t('snippet_label_show') : t('snippet_label_hide');
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.snippet-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const codeId = btn.getAttribute('data-snippet-code');
      if (!codeId) return;
      const codeEl = document.getElementById(codeId);
      if (!codeEl) return;
      const code = codeEl.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // Fallback: use a temporary textarea
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* ignore */ }
        document.body.removeChild(ta);
      }
      const label = btn.querySelector('.snippet-copy-label');
      if (label) {
        const original = label.textContent || t('snippet_label_copy');
        label.textContent = t('snippet_label_copied');
        btn.classList.add('copied');
        setTimeout(() => {
          label.textContent = original;
          btn.classList.remove('copied');
        }, 1500);
      }
    });
  });
}

function renderCategory(category: AnalysisCategory): string {
  const percentage = (category.score / 5) * 100;
  const color = getCategoryColor(category.score);

  const detailsHtml = category.details
    .map((d) => {
      // Determine color based on progress
      let progressColor = 'text-green-600';
      let icon = '✓';

      if (d.progress) {
        const progressPercent = (d.progress.current / d.progress.target) * 100;
        if (progressPercent >= 100) {
          progressColor = 'text-green-600';
          icon = '✓';
        } else if (progressPercent > 0) {
          progressColor = 'text-amber-500';
          icon = '◐'; // Half circle for partial
        } else {
          progressColor = 'text-red-500';
          icon = '✗';
        }
      } else {
        progressColor = d.found ? 'text-green-600' : 'text-red-500';
        icon = d.found ? '✓' : '✗';
      }

      // Show progress value if available
      const progressText = d.progress && d.progress.target > 1
        ? ` <span class="text-gray-400">(${d.progress.current}/${d.progress.target})</span>`
        : '';

      return `<div class="flex items-start gap-1.5 py-0.5"><span class="${progressColor} flex-shrink-0 leading-tight">${icon}</span><span class="flex-1">${d.criterionKey}${progressText}</span></div>`;
    })
    .join('');

  return `
    <div class="category-card bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700">
      <div class="flex justify-between items-center mb-2">
        <span class="font-medium text-gray-800 dark:text-gray-200 text-sm">${category.nameKey}</span>
        <span class="font-bold text-sm" style="color: ${color}">
          ${category.score.toFixed(1)}/5
        </span>
      </div>
      <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          class="h-full rounded-full transition-all duration-500"
          style="width: ${percentage}%; background-color: ${color}">
        </div>
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400">
        ${detailsHtml}
      </div>
    </div>
  `;
}

// History toggle
historyToggleEl.addEventListener('click', () => {
  historyOpen = !historyOpen;
  historyPanelEl.classList.toggle('hidden', !historyOpen);
  historyToggleEl.setAttribute('aria-expanded', String(historyOpen));
  historyChevronEl.style.transform = historyOpen ? 'rotate(180deg)' : '';
  // Render sparkline after panel is visible (needs layout dimensions)
  if (historyOpen && lastResult) {
    loadHistory(lastResult.url).then((history) => {
      renderSparkline(sparklineEl, history.entries);
    });
  }
});

// Start analysis
async function startAnalysis() {
  showState('loading');

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id || !tab.url) {
      showState('not-supported');
      return;
    }

    // Check if URL is supported
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('brave://')
    ) {
      showState('not-supported');
      return;
    }

    // Inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.js'],
      });
    } catch {
      // Script might already be injected, continue
    }

    // Wait for content script to initialize
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Check cache: if page content hasn't changed, use cached result
    try {
      const hashResp = await chrome.tabs.sendMessage(tab.id, { action: 'getHash' });
      if (hashResp?.hash) {
        const cached = await loadCache(tab.url);
        if (cached && cached.hash === hashResp.hash) {
          lastResult = cached.result;
          exportBtnEl.classList.remove('opacity-30', 'pointer-events-none');
          exportBtnEl.removeAttribute('disabled');
          historyToggleEl.classList.remove('hidden');
          historyClearEl.classList.remove('hidden');
          renderResults(cached.result);
          renderHistoryList(cached.result.url);
          return;
        }
      }
    } catch {
      // Hash check failed, continue with normal analysis
    }

    // Send analyze message with retry
    let response: AnalyzeResponse | null = null;
    let retries = 5;

    while (retries > 0 && !response) {
      try {
        response = await chrome.tabs.sendMessage(tab.id, {
          action: 'analyze',
        });
      } catch {
        retries--;
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    }

    // Falls Content Script nicht erreichbar (orphaned context nach Extension-Reload),
    // Seite neu laden und erneut versuchen
    if (!response) {
      // Tab neu laden
      await chrome.tabs.reload(tab.id);

      // Warten bis Seite geladen ist
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Content Script erneut injizieren
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content-script.js'],
        });
      } catch {
        // Ignorieren - Script könnte bereits injiziert sein
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Letzter Versuch nach Reload
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'analyze' });
      } catch {
        throw new Error('Content script not reachable');
      }
    }

    if (!response) {
      throw new Error('Content script not reachable');
    }

    if (response.success && response.result) {
      // Save result to history (returns trend vs previous analysis)
      let trend: TrendInfo | null = null;
      try {
        trend = await saveAnalysis(response.result);
      } catch {
        // Storage error — continue without history/trend
      }

      // Store for later (in case user activates toggle after analysis)
      lastResult = response.result;
      analyzedUrl = tab.url;
      hideTabChangeBanner();

      // Update cache with new hash + result
      try {
        const hashResp = await chrome.tabs.sendMessage(tab.id, { action: 'getHash' });
        if (hashResp?.hash) {
          await saveCache(tab.url, hashResp.hash, response.result);
        }
      } catch {
        // Cache update failed, continue
      }

      // Set badge on extension icon
      await setBadgeForTab(tab.id, response.result);

      // Render UI
      renderResults(response.result);
      renderTrend(trend);

      // Enable export button
      exportBtnEl.classList.remove('opacity-30', 'pointer-events-none');
      exportBtnEl.removeAttribute('disabled');
      historyToggleEl.classList.remove('hidden');
      historyClearEl.classList.remove('hidden');
      renderHistoryList(response.result.url);
    } else {
      errorMessageEl.textContent = response.error || 'Unknown error';
      showState('error');
    }
  } catch (error) {
    console.error('Analysis error:', error);
    errorMessageEl.textContent =
      error instanceof Error ? error.message : 'Connection to page failed';
    showState('error');
  }
}

// Export report
exportBtnEl.addEventListener('click', () => {
  if (!lastResult) return;
  const html = generateHtmlReport(lastResult);
  // Store report HTML, then open the report viewer page
  chrome.storage.local.set({ 'geo_report_html': html }, () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') });
  });
});

// Clear history
historyClearEl.addEventListener('click', () => {
  if (!lastResult) return;
  clearHistory(lastResult.url).then(() => {
    historyListEl.innerHTML =
      `<p class="text-gray-400 dark:text-gray-500 text-xs text-center py-3">${t('ui_noHistory')}</p>`;
    sparklineEl.classList.add('hidden');
  });
});

// Language selector
langToggleEl.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !langMenuEl.classList.toggle('hidden');
  langToggleEl.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', () => {
  langMenuEl.classList.add('hidden');
  langToggleEl.setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    langMenuEl.classList.add('hidden');
    langToggleEl.setAttribute('aria-expanded', 'false');
  }
});

document.querySelectorAll('.lang-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    const lang = (btn as HTMLElement).dataset.lang as Lang;
    setLang(lang);
    chrome.storage.local.set({ 'geo_lang': lang });
    langToggleEl.innerHTML = `${lang.toUpperCase()} <span class="text-[8px]">&#9660;</span>`;
    langMenuEl.classList.add('hidden');
    applyI18nToDOM();
    // Re-run analysis to update all dynamic strings
    if (lastResult) {
      startAnalysis();
    }
  });
});

// Theme toggle
document.getElementById('theme-toggle')!.addEventListener('click', () => {
  const isDark = document.documentElement.classList.contains('dark');
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(!isDark);
  chrome.storage.local.set({ 'geo_theme': newTheme });
});

// Tab-change banner (side panel stays open across tab switches)
function showTabChangeBanner() {
  tabChangeBannerEl.classList.remove('hidden');
  tabChangeBannerEl.classList.add('flex');
}

function hideTabChangeBanner() {
  tabChangeBannerEl.classList.add('hidden');
  tabChangeBannerEl.classList.remove('flex');
}

function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://')
  );
}

async function checkActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    if (!isSupportedUrl(tab.url)) {
      hideTabChangeBanner();
      return;
    }
    if (analyzedUrl && tab.url !== analyzedUrl) {
      showTabChangeBanner();
    } else {
      hideTabChangeBanner();
    }
  } catch {
    // Ignore tab query errors
  }
}

chrome.tabs.onActivated.addListener(() => {
  checkActiveTab();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    checkActiveTab();
  }
});

tabChangeAnalyzeBtn.addEventListener('click', () => {
  hideTabChangeBanner();
  startAnalysis();
});

// Event listeners
retryBtn.addEventListener('click', startAnalysis);

// Refresh button: clear cache and re-run analysis (throttled to 1x per 5s)
let lastRefresh = 0;
const REFRESH_THROTTLE_MS = 5000;
const refreshBtnEl = document.getElementById('refresh-btn')!;
refreshBtnEl.addEventListener('click', async () => {
  const now = Date.now();
  if (now - lastRefresh < REFRESH_THROTTLE_MS) {
    // Brief visual feedback
    refreshBtnEl.classList.add('opacity-40');
    setTimeout(() => refreshBtnEl.classList.remove('opacity-40'), 300);
    return;
  }
  lastRefresh = now;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url) await clearCache(tab.url);
  startAnalysis();
});

// Start analysis on popup open
document.addEventListener('DOMContentLoaded', () => {
  // Load saved language, then initialize UI
  chrome.storage.local.get('geo_lang', (data) => {
    const savedLang = data['geo_lang'] as Lang | undefined;
    if (savedLang) {
      setLang(savedLang);
    }
    langToggleEl.innerHTML = `${getLang().toUpperCase()} <span class="text-[8px]">&#9660;</span>`;
    applyI18nToDOM();
    startAnalysis();
  });
});
