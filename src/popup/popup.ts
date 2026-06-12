import type { GEOAnalysisResult, AnalyzeResponse, AnalysisCategory, TrendInfo } from '../types/analysis';
import { getCategoryColor } from '../utils/scoring';
import { loadHistory, saveAnalysis, clearHistory, getDomainOverview } from '../utils/history';
import { generateDomainDashboardHtml } from '../utils/export-domain-html';
import {
  reportAnalysis,
  isAnalyticsEnabled,
  setAnalyticsEnabled,
  isNoticeSeen,
  markNoticeSeen,
} from '../utils/analytics';
import { formatTrendLabel } from '../utils/trend';
import { setBadgeForTab } from '../utils/badge';
import { initI18n, t, getDateLocale, setLang, getLang } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { generateHtmlReport } from '../utils/export-html';
import { renderSparkline } from '../utils/sparkline';
import { loadCache, saveCache, clearCache } from '../utils/cache';
import { getFixSnippet, getSnippetLanguageLabel } from '../utils/fix-snippets';
import { getRecommendationPriority } from '../utils/recommendations';

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
const needsClickEl = document.getElementById('needs-click')!;
const retryBtn = document.getElementById('retry-btn')!;

// Sentinel for "no activeTab grant — only a toolbar-icon click helps".
// Rendered as its own instructional state instead of the error state,
// because a retry button cannot fix a missing permission grant.
const NEEDS_ICON_CLICK = '__needs_icon_click__';

const totalScoreEl = document.getElementById('total-score')!;
const scoreBadgeEl = document.getElementById('score-badge')!;
const scoreBarEl = document.getElementById('score-bar')!;
const pageUrlEl = document.getElementById('page-url')!;
const scoreTrendEl = document.getElementById('score-trend')!;
const categoriesEl = document.getElementById('categories')!;
const recommendationsSectionEl = document.getElementById('recommendations-section')!;
const recommendationsEl = document.getElementById('recommendations')!;
const focusHintEl = document.getElementById('focus-hint')!;
const errorMessageEl = document.getElementById('error-message')!;

// History elements
const historyToggleEl = document.getElementById('history-toggle')!;
const historyPanelEl = document.getElementById('history-panel')!;
const historyListEl = document.getElementById('history-list')!;
const historyChevronEl = document.getElementById('history-chevron')!;
const historyClearEl = document.getElementById('history-clear')!;
const sparklineEl = document.getElementById('sparkline') as HTMLCanvasElement;

const exportBtnEl = document.getElementById('export-btn')!;
const domainOverviewBtnEl = document.getElementById('domain-overview-btn')!;
const domainOverviewLabelEl = document.getElementById('domain-overview-label')!;

// Tab-change banner (visible only when active tab changes while side panel is open)
const tabChangeBannerEl = document.getElementById('tab-change-banner')!;

let historyOpen = false;
let lastResult: GEOAnalysisResult | null = null;
let analyzedUrl: string | null = null;
// Recommendation key whose elements are currently marked on the page.
// Single-active by design: activating another key replaces the markers.
let activeHighlightKey: string | null = null;

// When opened as a fallback popup window (sidePanel API unavailable or open
// failed), the service worker passes the user's real tab via ?tabId=…. The
// popup window itself is its own window/tab, so chrome.tabs.query would
// otherwise return the wrong tab and we'd report "Nicht unterstützt".
function getForcedTabId(): number | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('tabId');
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const forcedId = getForcedTabId();
  if (forcedId !== null) {
    try {
      return await chrome.tabs.get(forcedId);
    } catch {
      // Tab gone — fall through to active-tab query
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Apply i18n to static HTML elements
function applyI18nToDOM() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')!;
    el.textContent = t(key);
  });
}

// State management
function showState(state: 'loading' | 'results' | 'error' | 'not-supported' | 'needs-click') {
  loadingEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  notSupportedEl.classList.add('hidden');
  needsClickEl.classList.add('hidden');

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
    case 'needs-click':
      needsClickEl.classList.remove('hidden');
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

  // Page-type badge — only for confident detections ('other' shows nothing)
  const pageTypeBadgeEl = document.getElementById('page-type-badge')!;
  if (result.pageType && result.pageType !== 'other') {
    pageTypeBadgeEl.textContent = t(`pagetype_${result.pageType}`);
    pageTypeBadgeEl.classList.remove('hidden');
  } else {
    pageTypeBadgeEl.classList.add('hidden');
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

  // Focus hint: name the weakest category — the single place where work
  // pays off most. Hidden when even the weakest category is solid (≥ 4).
  const weakest = Object.values(result.categories).reduce((min, cat) =>
    cat.score < min.score ? cat : min
  );
  if (weakest.score < 4 && result.topRecommendations.length > 0) {
    // nameKey is already translated by mapAnalysisResult at analysis time
    focusHintEl.textContent = `🎯 ${t('ui_biggestLever', {
      cat: weakest.nameKey,
      score: weakest.score.toFixed(1),
    })}`;
    focusHintEl.classList.remove('hidden');
  } else {
    focusHintEl.classList.add('hidden');
  }

  // Agency CTA: only at the pain moment (poor/moderate rating) — on good
  // pages a sales link would just be noise.
  const ctaEl = document.getElementById('agency-cta')!;
  if (result.rating.level === 'poor' || result.rating.level === 'moderate') {
    ctaEl.textContent = `${t('ui_agencyCta')} →`;
    ctaEl.classList.remove('hidden');
  } else {
    ctaEl.classList.add('hidden');
  }

  // Recommendations
  activeHighlightKey = null;
  if (result.topRecommendations.length > 0) {
    recommendationsSectionEl.classList.remove('hidden');
    recommendationsEl.innerHTML = result.topRecommendations
      .map((recKey, i) => renderRecommendationItem(recKey, i))
      .join('');
    attachSnippetHandlers(recommendationsEl);
    attachHighlightHandlers(recommendationsEl);
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

// "Show on page" button — only for recommendations whose affected elements
// were located on the page (result.highlightTargets, computed at analysis).
function renderHighlightButton(recKey: string): string {
  const targets = lastResult?.highlightTargets?.[recKey];
  if (!targets || targets.length === 0) return '';
  return `<button type="button" class="highlight-toggle" data-rec-key="${escapeHtml(recKey)}" aria-pressed="false">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    <span class="highlight-toggle-label">${escapeHtml(t('ui_showOnPage'))} (${targets.length})</span>
  </button>`;
}

// Every recommendation renders as one card with a fixed order: text first,
// optional hint, then the card's action buttons, then the snippet preview.
function renderRecommendationItem(recKey: string, index: number): string {
  const text = t(`rec_${recKey}`);
  const snippet = getFixSnippet(recKey);
  const snippetId = `snippet-${index}`;
  const highlightBtn = renderHighlightButton(recKey);

  let note = '';
  let snippetButtons = '';
  let snippetPreview = '';

  if (snippet?.type === 'no-snippet') {
    note = `<div class="snippet-none">${escapeHtml(snippet.note)}</div>`;
  } else if (snippet) {
    const langLabel = getSnippetLanguageLabel(snippet.language);
    snippetButtons = `<button type="button" class="snippet-toggle" data-snippet-target="${snippetId}" aria-expanded="false">
        ${escapeHtml(t('snippet_label_show'))}
      </button>
      <button type="button" class="snippet-copy" data-snippet-code="${snippetId}-code">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span class="snippet-copy-label">${escapeHtml(t('snippet_label_copy'))}</span>
      </button>`;
    snippetPreview = `<div class="snippet-preview hidden" id="${snippetId}">
      <div class="snippet-preview-header">
        <span class="snippet-lang-tag">${escapeHtml(langLabel)}</span>
        <span class="snippet-note">${escapeHtml(snippet.note)}</span>
      </div>
      <pre class="snippet-code" id="${snippetId}-code"><code>${escapeHtml(snippet.code)}</code></pre>
    </div>`;
  }

  const buttons = [highlightBtn, snippetButtons].filter(Boolean).join('\n');
  const actions = buttons ? `<div class="snippet-row-actions">${buttons}</div>` : '';

  return `<li class="recommendation-item">
    <div class="snippet-row-text">${escapeHtml(text)}</div>
    ${note}
    ${actions}
    ${snippetPreview}
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

function updateHighlightButtons(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>('.highlight-toggle').forEach((btn) => {
    const key = btn.getAttribute('data-rec-key');
    const active = key !== null && key === activeHighlightKey;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    const label = btn.querySelector('.highlight-toggle-label');
    if (label && key) {
      const count = lastResult?.highlightTargets?.[key]?.length ?? 0;
      label.textContent = active ? t('ui_hideOnPage') : `${t('ui_showOnPage')} (${count})`;
    }
  });
}

function attachHighlightHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>('.highlight-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const recKey = btn.getAttribute('data-rec-key');
      const targets = recKey ? lastResult?.highlightTargets?.[recKey] : undefined;
      if (!recKey || !targets || targets.length === 0) return;

      const tab = await getTargetTab();
      if (!tab?.id) return;

      try {
        if (activeHighlightKey === recKey) {
          await chrome.tabs.sendMessage(tab.id, { action: 'clear-highlights' });
          activeHighlightKey = null;
        } else {
          // Single-active: the content script clears previous markers itself.
          // 'info' = marks a place where something is missing (dashed blue),
          // otherwise severity follows the recommendation priority.
          const severity =
            recKey === 'no_key_info_upfront'
              ? 'info'
              : getRecommendationPriority(recKey) >= 8
                ? 'high'
                : 'medium';
          await chrome.tabs.sendMessage(tab.id, {
            action: 'highlight',
            targets,
            severity,
          });
          activeHighlightKey = recKey;
        }
        updateHighlightButtons(container);
      } catch {
        // Content script unreachable — tab navigated/reloaded, activeTab grant
        // is gone. Brief inline feedback; a fresh icon click fixes it.
        const label = btn.querySelector('.highlight-toggle-label');
        if (label) {
          const original = label.textContent;
          label.textContent = t('ui_highlightFailed');
          btn.classList.add('failed');
          setTimeout(() => {
            label.textContent = original;
            btn.classList.remove('failed');
          }, 2500);
        }
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
    // Get target tab (forced via ?tabId for popup-window fallback, otherwise active)
    const tab = await getTargetTab();

    if (!tab?.id || !tab.url) {
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

    // Content script injection is normally done by the service worker's
    // onClicked handler — that's where the activeTab grant is freshest. We
    // skip it here in the side-panel flow to avoid the "Extension manifest
    // must request permission to access this host" error that Chrome
    // returns when executeScript is called from the side-panel context.
    //
    // Exception: the popup-window fallback (?tabId=…) — those windows can
    // open through the chrome.windows.create fallback path where the SW
    // didn't get a chance to inject (e.g. sidePanel.open failed). Re-attempt
    // here as a safety net, but don't fail loud if it errors.
    let injectError: unknown = null;
    if (getForcedTabId() !== null) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content-script.js'],
        });
      } catch (err) {
        injectError = err;
        console.warn('executeScript failed (popup-window fallback):', err);
      }
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
          updateDomainOverviewButton();
          // Cached path skips the analyze message (which clears markers) —
          // remove any leftover highlights from a previous round explicitly.
          chrome.tabs.sendMessage(tab.id, { action: 'clear-highlights' }).catch(() => {});
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
    // Seite neu laden und erneut versuchen.
    // Only for the page we already analyzed (activeTab grant still valid
    // there). On a different tab — e.g. the user switched pages and hit the
    // refresh button — there is no grant: reloading the page would be a
    // pointless side effect and injection can never succeed. That case gets
    // the friendly "click the icon" hint below instead.
    // Also skip if executeScript itself failed — reloading won't help when
    // the underlying problem is a missing activeTab grant.
    if (!response && !injectError && analyzedUrl === tab.url) {
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
      } catch (err) {
        injectError = err;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Letzter Versuch nach Reload
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'analyze' });
      } catch {
        // Fall through to the unified error handling below
      }
    }

    if (!response) {
      // Most likely cause in all of these paths: no fresh activeTab grant
      // for this tab (page switch + refresh button, pinned panel, panel
      // reload). The fix is always the same user action — click the toolbar
      // icon on this page — rendered as the dedicated needs-click state.
      if (injectError) {
        const msg = injectError instanceof Error ? injectError.message : String(injectError);
        if (!/permission|cannot access/i.test(msg)) {
          throw new Error(`${msg} — ${t('ui_otherPageDetected')}`);
        }
      }
      throw new Error(NEEDS_ICON_CLICK);
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

      // Anonymous usage stats (opt-out, URL-free, deduped locally) —
      // only on fresh analyses, never on cache hits.
      void reportAnalysis(response.result);

      // Render UI
      renderResults(response.result);
      renderTrend(trend);

      // Enable export button
      exportBtnEl.classList.remove('opacity-30', 'pointer-events-none');
      exportBtnEl.removeAttribute('disabled');
      historyToggleEl.classList.remove('hidden');
      historyClearEl.classList.remove('hidden');
      renderHistoryList(response.result.url);
      updateDomainOverviewButton();
    } else {
      errorMessageEl.textContent = response.error || 'Unknown error';
      showState('error');
    }
  } catch (error) {
    if (error instanceof Error && error.message === NEEDS_ICON_CLICK) {
      showState('needs-click');
      return;
    }
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

// Domain overview: enable the button (with page count) once the current
// domain has at least one stored analysis.
function currentHostname(): string | null {
  try {
    return new URL(analyzedUrl || lastResult?.url || '').hostname;
  } catch {
    return null;
  }
}

async function updateDomainOverviewButton() {
  const hostname = currentHostname();
  if (!hostname) return;
  try {
    const pages = await getDomainOverview(hostname);
    domainOverviewLabelEl.textContent = `${t('ui_domainOverview')} (${pages.length})`;
    if (pages.length > 0) {
      domainOverviewBtnEl.classList.remove('opacity-30', 'pointer-events-none');
      domainOverviewBtnEl.removeAttribute('disabled');
    }
  } catch {
    // Storage error — leave the button disabled
  }
}

domainOverviewBtnEl.addEventListener('click', async () => {
  const hostname = currentHostname();
  if (!hostname) return;
  const pages = await getDomainOverview(hostname);
  const html = generateDomainDashboardHtml(hostname, pages);
  // Same handoff as the report export: viewer renders whatever is stored.
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
  // The popup-window fallback runs in its own window — tab-change tracking
  // doesn't apply there (the user can't switch tabs inside a side panel they
  // don't have).
  if (getForcedTabId() !== null) return;
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

// Tab tracking only updates the informational banner — analysis is NOT
// auto-triggered. The user needs to click the toolbar icon to grant
// activeTab for the new tab; the service worker then messages us to re-run.
chrome.tabs.onActivated.addListener(() => {
  checkActiveTab();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    checkActiveTab();
  }
});

// Message channel from the service worker: fires when the user clicks the
// toolbar icon (which freshly grants activeTab for the clicked tab).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'analyze-tab') {
    hideTabChangeBanner();
    startAnalysis();
  }
});

// Analytics: footer toggle + one-time notice
const analyticsToggleEl = document.getElementById('analytics-toggle') as HTMLInputElement;
const analyticsNoticeEl = document.getElementById('analytics-notice')!;

function hideAnalyticsNotice() {
  analyticsNoticeEl.classList.add('hidden');
  analyticsNoticeEl.classList.remove('flex');
}

async function initAnalyticsUi() {
  analyticsToggleEl.checked = await isAnalyticsEnabled();
  if (analyticsToggleEl.checked && !(await isNoticeSeen())) {
    analyticsNoticeEl.classList.remove('hidden');
    analyticsNoticeEl.classList.add('flex');
  }
}

analyticsToggleEl.addEventListener('change', () => {
  void setAnalyticsEnabled(analyticsToggleEl.checked);
  if (!analyticsToggleEl.checked) {
    void markNoticeSeen();
    hideAnalyticsNotice();
  }
});

document.getElementById('analytics-notice-ok')!.addEventListener('click', () => {
  void markNoticeSeen();
  hideAnalyticsNotice();
});

document.getElementById('analytics-notice-disable')!.addEventListener('click', () => {
  void setAnalyticsEnabled(false);
  void markNoticeSeen();
  analyticsToggleEl.checked = false;
  hideAnalyticsNotice();
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
  const tab = await getTargetTab();
  if (tab?.url) await clearCache(tab.url);
  startAnalysis();
});

// Start analysis on popup open
document.addEventListener('DOMContentLoaded', () => {
  // Resolve at runtime so the build doesn't try to bundle the asset path
  (document.getElementById('needs-click-icon') as HTMLImageElement).src =
    chrome.runtime.getURL('assets/icon-48.png');
  // Load saved language, then initialize UI
  chrome.storage.local.get('geo_lang', (data) => {
    const savedLang = data['geo_lang'] as Lang | undefined;
    if (savedLang) {
      setLang(savedLang);
    }
    langToggleEl.innerHTML = `${getLang().toUpperCase()} <span class="text-[8px]">&#9660;</span>`;
    applyI18nToDOM();
    void initAnalyticsUi();
    startAnalysis();
  });
});
