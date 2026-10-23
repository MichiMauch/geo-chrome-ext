import type { GEOAnalysisResult, AnalysisCategory, CategoryDetail, CrawlerViewData } from '../types/analysis';
import { VISIBLE_RECOMMENDATIONS, recommendationMeta, type RecommendationOwner } from './recommendations';
import { getCategoryColor } from './scoring';
import { t, getDateLocale } from './i18n';
import { getFixSnippet, getSnippetLanguageLabel } from './fix-snippets';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(getDateLocale(), {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// The crawler explanation needs numbers that don't fit into a CategoryDetail,
// so the report stashes them here for the duration of one render.
let reportCrawlerView: CrawlerViewData | undefined;

function getExplanation(d: CategoryDetail): string {
  // Check skipped for the detected page type (e.g. author/date on a homepage)
  if (d.value === t('value_notApplicable')) {
    return t('explain_not_applicable');
  }
  const criterion = d.criterionKey;
  const value = String(d.value || '');
  const current = d.progress?.current ?? 0;
  const target = d.progress?.target ?? 1;

  // H1
  if (criterion === t('criterion_h1')) {
    if (!d.found && current === 0) return t('explain_h1_missing');
    if (!d.found) return t('explain_h1_multiple', { count: value.match(/\d+/)?.[0] || '?' });
    return t('explain_h1_ok');
  }
  // Hierarchy
  if (criterion === t('criterion_hierarchy')) {
    if (!d.found) return t('explain_hierarchy_bad', { value });
    return t('explain_hierarchy_ok');
  }
  // Scannable
  if (criterion === t('criterion_scannable')) {
    if (!d.found) return t('explain_scannable_bad', { value });
    return t('explain_scannable_ok');
  }
  // Readability
  if (criterion === t('criterion_readability')) {
    if (!d.found) return t('explain_readability_bad', { value });
    return t('explain_readability_ok', { value });
  }
  // Definitions
  if (criterion === t('criterion_definitions')) {
    if (!d.found) return t('explain_definitions_bad', { value });
    return t('explain_definitions_ok');
  }
  // Lists
  if (criterion === t('criterion_lists')) {
    if (!d.found) return t('explain_lists_bad', { current, target });
    return t('explain_lists_ok');
  }
  // Sections
  if (criterion === t('criterion_sections')) {
    if (!d.found) return t('explain_sections_bad', { current, target });
    return t('explain_sections_ok');
  }
  // Author
  if (criterion === t('criterion_author')) {
    if (!d.found) return t('explain_author_missing');
    return t('explain_author_ok', { value });
  }
  // Date
  if (criterion === t('criterion_date')) {
    if (!d.found) return t('explain_date_missing');
    if (d.progress && d.progress.current < 1) return t('explain_date_old', { value });
    return t('explain_date_ok', { value });
  }
  // Sources
  if (criterion === t('criterion_publisher')) {
    if (d.found) return t('explain_publisher_ok');
    if (current === 0) return t('explain_publisher_none');
    return t('explain_publisher_partial', { current });
  }
  if (criterion === t('criterion_sources')) {
    if (!d.found) return t('explain_sources_bad', { current, target });
    return t('explain_sources_ok');
  }
  // Schema
  if (criterion === t('criterion_schema')) {
    // The type list itself, not the already formatted "2/2 types (…)" value;
    // reports stored before valueParams existed fall back to the value.
    const types = d.valueParams?.types || value;
    if (current === 0 && !d.valueParams?.types) return t('explain_schema_missing');
    if (!d.found || current < target) return t('explain_schema_partial', { current, target, value: types });
    return t('explain_schema_ok', { value: types });
  }
  // Schema completeness (required fields per type)
  if (criterion === t('criterion_schema_completeness')) {
    if (!d.found) return t('explain_schema_completeness_bad', { current, target, value });
    return t('explain_schema_completeness_ok');
  }
  // Entities
  if (criterion === t('criterion_entities')) {
    if (!d.found) return t('explain_entities_bad', { value });
    return t('explain_entities_ok');
  }
  // Semantic HTML
  if (criterion === t('criterion_semanticHtml')) {
    if (!d.found) return t('explain_semantic_bad', { value });
    return t('explain_semantic_ok');
  }
  // Internal linking
  if (criterion === t('criterion_internalLinks')) {
    if (!d.found) return t('explain_internal_links_bad');
    return t('explain_internal_links_ok');
  }
  // llms.txt / llms-full.txt
  if (criterion === t('criterion_llmsTxt')) {
    if (value === t('value_llms_both')) return t('explain_llmstxt_both');
    if (value === t('value_llms_fullOnly')) return t('explain_llmstxt_full_only');
    if (value === t('value_llms_indexOnly')) return t('explain_llmstxt_no_full');
    // Analyses stored before llms-full.txt was checked only know present/absent
    if (!d.found) return t('explain_llmstxt_missing');
    return t('explain_llmstxt_ok');
  }
  // robots.txt — AI bot access
  if (criterion === t('criterion_robotsTxt')) {
    const total = d.progress?.target ?? 0;
    const allowed = d.progress?.current ?? 0;
    const blocked = Math.max(0, total - allowed);
    if (blocked === 0) return d.found ? t('explain_robotstxt_ok') : t('explain_robotstxt_restricted');
    if (total > 0 && blocked === total) return t('explain_robotstxt_all_blocked');
    return t('explain_robotstxt_partial', { blocked, total });
  }
  // Product data
  if (criterion === t('criterion_productData')) {
    if (value === t('value_noneFound')) return t('explain_productData_none');
    if (!d.found) return t('explain_productData_partial', { current });
    return t('explain_productData_ok');
  }
  // XML sitemap
  if (criterion === t('criterion_sitemap')) {
    if (value === t('value_noneFound')) return t('explain_sitemap_none');
    if (!d.found) return t('explain_sitemap_partial', { current });
    return t('explain_sitemap_ok');
  }
  // AI crawler view — content without JavaScript
  if (criterion === t('criterion_crawlerView')) {
    const numbers = {
      raw: (reportCrawlerView?.rawChars ?? 0).toLocaleString(),
      rendered: (reportCrawlerView?.renderedChars ?? 0).toLocaleString(),
      coverage: current,
    };
    if (d.found) return t('explain_crawlerview_ok', numbers);
    if (reportCrawlerView?.status === 'js-only') return t('explain_crawlerview_jsonly', numbers);
    return t('explain_crawlerview_partial', numbers);
  }
  // Facts
  if (criterion === t('criterion_facts')) {
    if (!d.found) return t('explain_facts_bad', { value });
    return t('explain_facts_ok');
  }
  // FAQ
  if (criterion === t('criterion_faq')) {
    if (d.valueParams?.hidden) return t('explain_faq_answers_hidden', d.valueParams);
    if (!d.found) return t('explain_faq_missing');
    return t('explain_faq_ok');
  }
  // Sourced claims
  if (criterion === t('criterion_sourcedClaims')) {
    if (!d.found) return t('explain_sourced_bad', { value });
    return t('explain_sourced_ok');
  }
  // Key info upfront
  if (criterion === t('criterion_keyInfoUpfront')) {
    if (!d.found) return t('explain_upfront_bad', { value });
    return t('explain_upfront_ok');
  }
  // On-Page SEO: Title quality
  if (criterion === t('criterion_title_quality')) {
    if (current === 0) return t('explain_title_missing');
    if (!d.found) return t('explain_title_bad', { value });
    return t('explain_title_ok', { value });
  }
  // On-Page SEO: Meta description
  if (criterion === t('criterion_meta_description')) {
    if (current === 0) return t('explain_description_missing');
    if (!d.found) return t('explain_description_bad', { value });
    return t('explain_description_ok', { value });
  }
  // On-Page SEO: Image alts
  if (criterion === t('criterion_image_alts')) {
    if (target === 1 && current === 0) return t('explain_images_none');
    if (!d.found) return t('explain_image_alts_bad', { current, target });
    return t('explain_image_alts_ok', { current, target });
  }
  // On-Page SEO: Indexability
  if (criterion === t('criterion_indexability')) {
    if (d.value === t('value_snippetLimited')) return t('explain_indexability_snippet');
    if (!d.found) return t('explain_indexability_bad');
    return t('explain_indexability_ok');
  }
  // On-Page SEO: Social cards
  if (criterion === t('criterion_social_cards')) {
    if (!d.found) {
      return t('explain_social_cards_bad', { current, target, missing: d.valueParams?.missing || '—' });
    }
    return t('explain_social_cards_ok');
  }
  // On-Page SEO: Mobile viewport
  if (criterion === t('criterion_viewport')) {
    if (current === 0 && (value === t('value_notPresent') || !value)) {
      return t('explain_viewport_missing');
    }
    if (!d.found) return t('explain_viewport_misconfigured');
    return t('explain_viewport_ok');
  }
  // On-Page SEO: Canonical tag
  if (criterion === t('criterion_hreflang')) {
    if (value === t('value_notPresent')) return t('explain_hreflang_missing');
    if (!d.found) return t('explain_hreflang_partial', { current });
    return t('explain_hreflang_ok');
  }
  if (criterion === t('criterion_canonical')) {
    if (current === 0 && (value === t('value_notPresent') || !value)) {
      return t('explain_canonical_missing');
    }
    if (!d.found) return t('explain_canonical_mismatch');
    return t('explain_canonical_ok');
  }

  return '';
}

const CATEGORY_ICONS: Record<string, string> = {
  contentClarity: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  answerability: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/>',
  trustSources: '<path d="M12 2L3 7v5c0 5 4 9 9 10 5-1 9-5 9-10V7l-9-5z"/>',
  machineReadability: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  aiCitation: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/>',
  onPageSeo: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
};

type CriterionStatus = 'fail' | 'partial' | 'ok';

const STATUS_ICON: Record<CriterionStatus, string> = { fail: '✗', partial: '◐', ok: '✓' };

function criterionStatus(d: CategoryDetail): CriterionStatus {
  if (!d.progress) return d.found ? 'ok' : 'fail';
  const pct = (d.progress.current / d.progress.target) * 100;
  // A full bar that still fails (e.g. enough subheadings, too little text
  // under them) is partial, not green
  if (pct >= 100 && d.found) return 'ok';
  return pct > 0 ? 'partial' : 'fail';
}

const STATUS_ORDER: Record<CriterionStatus, number> = { fail: 0, partial: 1, ok: 2 };

function renderCategoryHtml(category: AnalysisCategory, iconKey: string, delay: number): string {
  const color = getCategoryColor(category.score);
  const percentage = (category.score / 5) * 100;
  const iconSvg = CATEGORY_ICONS[iconKey] || CATEGORY_ICONS.contentClarity;

  // What needs work comes first; the order within a status stays as analyzed
  const rows = category.details
    .map((d, i) => ({ d, i, status: criterionStatus(d) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.i - b.i);
  const counts = { fail: 0, partial: 0, ok: 0 };
  rows.forEach(({ status }) => counts[status]++);

  return `
    <section class="card category-card" id="cat-${iconKey}" style="--delay:${delay}ms">
      <div class="cat-header">
        <div class="cat-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${iconSvg}</svg>
        </div>
        <div class="cat-title">
          <h2>${escapeHtml(category.nameKey)}</h2>
          <div class="cat-counts">${escapeHtml(
            (['fail', 'partial', 'ok'] as const)
              .filter((s) => counts[s] > 0)
              .map((s) => t(`report_count_${s}`, { n: counts[s] }))
              .join(' · ')
          )}</div>
        </div>
        <div class="cat-score" style="color:${color}">${category.score.toFixed(1)}<span>/5</span></div>
      </div>
      <div class="progress-track"><div class="progress-bar" data-target="${percentage}" style="background:${color}"></div></div>
      <div class="crit-list">
        ${rows.map(({ d, status }) => renderCriterionHtml(d, status)).join('')}
      </div>
    </section>`;
}

// One line per criterion: status, name, value and the first finding as a
// teaser. The full findings, why and fix open on click (<details>, no JS).
// Analyses stored before the report texts existed (no evidenceText) show the
// one-line explanation instead and don't expand.
function renderCriterionHtml(d: CategoryDetail, status: CriterionStatus): string {
  const notApplicable = d.value === t('value_notApplicable');
  const value = d.value ? `<span class="crit-value">${escapeHtml(String(d.value))}</span>` : '';
  const head = (teaser: string) => `
        <span class="crit-icon">${STATUS_ICON[status]}</span>
        <span class="crit-main">
          <span class="crit-name">${escapeHtml(d.criterionKey)}</span>
          ${teaser ? `<span class="crit-teaser">${escapeHtml(teaser)}</span>` : ''}
        </span>
        ${value}`;

  if (notApplicable || !d.evidenceText?.length) {
    return `<div class="crit crit-${status} crit-static"><div class="crit-head">${head(getExplanation(d))}</div></div>`;
  }

  const findings = `<ul>${d.evidenceText.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
  const why = d.whyText
    ? `<div class="crit-block"><h4>${escapeHtml(t('report_why'))}</h4><p>${escapeHtml(d.whyText)}</p></div>`
    : '';
  const fix = d.fixText
    ? `<div class="crit-block crit-fix"><h4>${escapeHtml(t('report_fix'))}</h4><p>${escapeHtml(d.fixText)}</p></div>`
    : '';
  return `<details class="crit crit-${status}">
      <summary class="crit-head">${head(d.teaserText ?? d.evidenceText[0])}<span class="crit-chevron" aria-hidden="true"></span></summary>
      <div class="crit-body">
        <div class="crit-block"><h4>${escapeHtml(t('report_found'))}</h4>${findings}</div>
        ${fix}
        ${why}
      </div>
    </details>`;
}

// Score per category at a glance, linking to the category below
// Fixed / newly failing criteria since the previous analysis of this URL
function renderChangesHtml(result: GEOAnalysisResult): string {
  const fixed = result.changes?.fixed ?? [];
  const regressed = result.changes?.regressed ?? [];
  if (fixed.length === 0 && regressed.length === 0) return '';
  const date = new Date(result.changes!.previousTimestamp).toLocaleDateString(getDateLocale());
  const list = (keys: string[], cls: string, label: string) =>
    keys.length === 0
      ? ''
      : `<div class="changes-row ${cls}"><span class="changes-label">${escapeHtml(label)}</span>${keys
          .map((k) => `<span class="changes-item">${escapeHtml(t(k))}</span>`)
          .join('')}</div>`;
  return `<div class="card changes-card">
      <h2 class="card-title">${escapeHtml(t('report_changes_title', { date }))}</h2>
      ${list(fixed, 'changes-fixed', t('report_changes_fixed'))}
      ${list(regressed, 'changes-new', t('report_changes_new'))}
    </div>`;
}

function renderOverviewHtml(result: GEOAnalysisResult, order: (keyof GEOAnalysisResult['categories'])[]): string {
  return `<div class="overview">${order
    .map((key) => {
      const c = result.categories[key];
      const color = getCategoryColor(c.score);
      return `<a class="overview-item" href="#cat-${key}">
        <span class="overview-name">${escapeHtml(c.nameKey)}</span>
        <span class="overview-score" style="color:${color}">${c.score.toFixed(1)}<span>/5</span></span>
        <span class="progress-track"><span class="progress-bar" data-target="${(c.score / 5) * 100}" style="background:${color};display:block"></span></span>
      </a>`;
    })
    .join('')}</div>`;
}

function renderRecommendationItemHtml(recKey: string, index: number): string {
  const text = t(`rec_${recKey}`);
  const snippet = getFixSnippet(recKey);
  const snippetId = `snippet-${index}`;
  const meta = recommendationMeta(recKey);
  // Effort per item; the owner is the group heading
  const tags = meta ? `<div class="rec-tags"><span class="rec-effort">${escapeHtml(t(`effort_${meta.effort}`))}</span></div>` : '';

  if (!snippet) {
    return `<li>${tags}${escapeHtml(text)}</li>`;
  }

  if (snippet.type === 'no-snippet') {
    return `<li>${tags}
      <div>${escapeHtml(text)}</div>
      <div class="snippet-none">${escapeHtml(snippet.note)}</div>
    </li>`;
  }

  const langLabel = getSnippetLanguageLabel(snippet.language);
  const showLabel = escapeHtml(t('snippet_label_show'));
  const hideLabel = escapeHtml(t('snippet_label_hide'));
  const copyLabel = escapeHtml(t('snippet_label_copy'));
  const copiedLabel = escapeHtml(t('snippet_label_copied'));
  return `<li>${tags}
    <div class="snippet-row-header">
      <div class="snippet-row-text">${escapeHtml(text)}</div>
      <div class="snippet-row-actions no-print">
        <button type="button" class="snippet-toggle" data-snippet-target="${snippetId}" data-hide-label="${hideLabel}" aria-expanded="false">
          ${showLabel}
        </button>
        <button type="button" class="snippet-copy" data-snippet-code="${snippetId}-code" data-copied-label="${copiedLabel}">
          <span class="snippet-copy-label">${copyLabel}</span>
        </button>
      </div>
    </div>
    <div class="snippet-preview" id="${snippetId}" hidden>
      <div class="snippet-preview-header">
        <span class="snippet-lang-tag">${escapeHtml(langLabel)}</span>
        <span class="snippet-note">${escapeHtml(snippet.note)}</span>
      </div>
      <pre class="snippet-code" id="${snippetId}-code"><code>${escapeHtml(snippet.code)}</code></pre>
    </div>
  </li>`;
}

export function generateHtmlReport(result: GEOAnalysisResult): string {
  reportCrawlerView = result.crawlerView;
  const ratingColor = result.rating.color;
  const dateFormatted = formatDate(result.timestamp);

  let hostname = result.url;
  try { hostname = new URL(result.url).hostname; } catch { /* keep raw */ }

  const categoryOrder: (keyof typeof result.categories)[] = [
    'contentClarity', 'answerability', 'trustSources', 'machineReadability', 'aiCitation', 'onPageSeo',
  ];

  const categoriesHtml = categoryOrder
    .map((key, i) => renderCategoryHtml(result.categories[key], key, i * 80))
    .join('');

  // Two lists, one per owner: the editorial team cannot change the template,
  // the agency should not rewrite the copy. Each keeps the priority order and
  // folds after VISIBLE_RECOMMENDATIONS.
  let recIndex = 0;
  const recGroup = (owner: RecommendationOwner, keys: string[]) => {
    if (keys.length === 0) return '';
    const item = (k: string) => renderRecommendationItemHtml(k, recIndex++);
    const visible = keys.slice(0, VISIBLE_RECOMMENDATIONS).map(item).join('');
    const rest = keys.slice(VISIBLE_RECOMMENDATIONS);
    return `<div class="recs-group recs-group-${owner}">
        <h3 class="recs-group-title">${escapeHtml(t(`report_recs_${owner}`))} <span>${keys.length}</span></h3>
        <p class="recs-group-hint">${escapeHtml(t(`report_recs_${owner}_hint`))}</p>
        <ul class="recs-list">${visible}</ul>
        ${rest.length > 0
          ? `<details class="recs-more">
              <summary>${escapeHtml(t('ui_moreRecommendations', { count: rest.length }))}</summary>
              <ul class="recs-list">${rest.map(item).join('')}</ul>
            </details>`
          : ''}
      </div>`;
  };
  const ownerOf = (k: string) => recommendationMeta(k)?.owner ?? 'dev';
  const recommendationsHtml = result.topRecommendations.length > 0
    ? `<div class="card recs-card">
        <h2 class="card-title" style="display:flex;align-items:center;gap:10px">
          <div class="cat-icon" style="background:rgba(51,204,204,0.1);color:#2BA3A3">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.75V17h8v-2.25A7 7 0 0012 2z"/></svg>
          </div>
          ${escapeHtml(t('report_recommendations'))}
        </h2>
        ${recGroup('editorial', result.topRecommendations.filter((k) => ownerOf(k) === 'editorial'))}
        ${recGroup('dev', result.topRecommendations.filter((k) => ownerOf(k) === 'dev'))}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${getDateLocale().split('-')[0]}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(t('report_title'))} — ${escapeHtml(hostname)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #F8FAFC;
      --card: #ffffff;
      --border: rgba(15, 23, 42, 0.06);
      --text: #0f172a;
      --muted: #64748b;
      --subtle: #94a3b8;
      --accent: #33CCCC;
      --accent-deep: #2BA3A3;
      --shadow-md: 0 4px 12px rgba(15,23,42,0.04), 0 2px 4px rgba(15,23,42,0.03);
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 0 24px; }

    /* Mesh gradient header */
    .hero {
      position: relative;
      padding: 32px 0 28px;
      margin-bottom: 32px;
      background:
        radial-gradient(ellipse 60% 80% at 20% 30%, rgba(51,204,204,0.25), transparent 60%),
        radial-gradient(ellipse 50% 70% at 80% 40%, rgba(16,185,129,0.18), transparent 60%),
        radial-gradient(ellipse 70% 60% at 50% 90%, rgba(43,163,163,0.15), transparent 60%),
        linear-gradient(135deg, #0f766e 0%, #2BA3A3 50%, #33CCCC 100%);
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0);
      background-size: 24px 24px;
      opacity: 0.3;
    }
    .hero-content { position: relative; }
    .hero-title { color: #fff; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .hero-sub { color: rgba(255,255,255,0.75); font-size: 12px; font-weight: 500; margin-top: 2px; letter-spacing: 0.02em; text-transform: uppercase; }

    .hero-score-card {
      position: relative;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      background: rgba(255,255,255,0.95);
      border: 1px solid rgba(255,255,255,0.5);
      border-radius: 16px;
      padding: 24px 28px;
      box-shadow: 0 8px 32px rgba(15,23,42,0.12);
      margin-top: 24px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 20px;
      align-items: center;
    }
    .hero-score-main { text-align: left; }
    .hero-score-value { font-size: 48px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; color: var(--text); }
    .hero-score-max { font-size: 20px; color: var(--subtle); font-weight: 500; }
    .hero-score-badge {
      display: inline-block;
      padding: 5px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      margin-top: 10px;
    }
    .hero-meta { text-align: right; font-size: 12px; color: var(--muted); }
    .hero-meta-host { font-weight: 600; color: var(--text); word-break: break-all; margin-bottom: 2px; }
    .hero-progress { grid-column: 1 / -1; margin-top: 8px; }
    .hero-track { height: 8px; background: #eef2f6; border-radius: 999px; overflow: hidden; }
    .hero-bar { height: 100%; width: 0%; border-radius: 999px; transition: width 0.9s cubic-bezier(0.16, 1, 0.3, 1); }

    /* Cards */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: var(--shadow-md);
      animation: slide-up 0.5s var(--delay, 0ms) backwards cubic-bezier(0.16, 1, 0.3, 1);
    }
    .card-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 14px; letter-spacing: -0.01em; }

    /* Overview: score per category inside the hero card */
    .overview {
      grid-column: 1 / -1;
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 20px;
      margin-top: 8px; padding-top: 16px; border-top: 1px solid #eef2f6;
    }
    .overview-item {
      display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: baseline;
      text-decoration: none; color: inherit; padding: 6px 8px; border-radius: 8px;
    }
    .overview-item:hover { background: #f1f5f9; }
    .overview-name { font-size: 12px; font-weight: 500; color: var(--muted); line-height: 1.3; }
    .overview-score { font-size: 14px; font-weight: 700; }
    .overview-score span { color: var(--subtle); font-weight: 500; font-size: 11px; }
    .overview-item .progress-track { grid-column: 1 / -1; height: 4px; }

    /* Section bar above the categories */
    .details-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 12px; }
    .details-bar h2 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
    .toggle-all {
      padding: 6px 12px; font-size: 12px; font-weight: 600; font-family: inherit;
      border-radius: 8px; border: 1px solid rgba(43,163,163,0.35);
      background: #fff; color: var(--accent-deep); cursor: pointer;
    }
    .toggle-all:hover { background: rgba(51,204,204,0.08); }

    /* Categories: one per row, so the explanations get a readable width */
    .categories-list { display: grid; gap: 16px; margin-bottom: 24px; }
    .category-card { padding: 20px; scroll-margin-top: 16px; }
    .cat-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .cat-title h2 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
    .cat-counts { font-size: 12px; color: var(--muted); font-weight: 400; margin-top: 1px; }
    .cat-score span { color: var(--subtle); font-weight: 500; }

    /* Criteria: one compact line each, details on click */
    .crit-list { margin-top: 14px; display: grid; gap: 6px; }
    .crit { border-radius: 10px; border: 1px solid transparent; }
    .crit-fail { background: rgba(239,68,68,0.05); }
    .crit-partial { background: rgba(245,158,11,0.06); }
    .crit-ok { background: #f8fafc; }
    .crit[open] { border-color: var(--border); background: #fff; box-shadow: var(--shadow-md); }
    .crit-head {
      display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
      list-style: none; cursor: pointer;
    }
    .crit-static .crit-head { cursor: default; }
    .crit-head::-webkit-details-marker { display: none; }
    .crit-icon { font-weight: 700; font-size: 14px; width: 14px; flex-shrink: 0; line-height: 20px; }
    .crit-fail .crit-icon { color: #ef4444; }
    .crit-partial .crit-icon { color: #f59e0b; }
    .crit-ok .crit-icon { color: #10b981; }
    .crit-main { flex: 1; min-width: 0; display: grid; gap: 2px; }
    .crit-name { font-size: 13px; font-weight: 600; color: var(--text); line-height: 20px; }
    .crit-teaser { font-size: 12px; color: var(--muted); line-height: 1.45; }
    .crit[open] .crit-teaser { display: none; }
    .crit-value { font-size: 12px; font-weight: 500; color: var(--subtle); flex-shrink: 0; line-height: 20px; max-width: 40%; text-align: right; }
    .crit-chevron {
      width: 8px; height: 8px; flex-shrink: 0; margin: 6px 2px 0 4px;
      border-right: 2px solid var(--subtle); border-bottom: 2px solid var(--subtle);
      transform: rotate(45deg); transition: transform 0.15s ease;
    }
    .crit[open] .crit-chevron { transform: rotate(-135deg); margin-top: 9px; }
    .crit-body { padding: 0 14px 14px 36px; display: grid; gap: 12px; font-size: 13px; color: #334155; line-height: 1.6; }
    .crit-block h4 { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .crit-block ul { padding-left: 18px; display: grid; gap: 2px; }
    .crit-fix { background: rgba(51,204,204,0.08); border-left: 3px solid var(--accent); border-radius: 8px; padding: 10px 12px; }
    .cat-icon {
      width: 34px; height: 34px;
      border-radius: 10px;
      background: rgba(51,204,204,0.1);
      color: var(--accent-deep);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .cat-title { flex: 1; font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.3; }
    .cat-score { font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
    .progress-track { height: 6px; background: #eef2f6; border-radius: 999px; overflow: hidden; }
    .progress-bar { height: 100%; width: 0%; border-radius: 999px; transition: width 0.9s cubic-bezier(0.16, 1, 0.3, 1); }

    /* Recommendations */
    .recs-card { margin-bottom: 24px; }
    .recs-list { list-style: none; display: grid; gap: 10px; }
    .recs-list li {
      font-size: 14px;
      color: var(--text);
      line-height: 1.5;
      padding: 12px 14px;
      background: rgba(51,204,204,0.06);
      border-left: 3px solid var(--accent);
      border-radius: 10px;
    }

    .changes-card { margin-bottom: 24px; }
    .changes-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; }
    .changes-label { font-weight: 700; margin-right: 4px; }
    .changes-item { padding: 3px 10px; border-radius: 999px; }
    .changes-fixed .changes-label { color: #15803d; }
    .changes-fixed .changes-item { background: rgba(34,197,94,0.1); color: #166534; }
    .changes-new .changes-label { color: #b91c1c; }
    .changes-new .changes-item { background: rgba(239,68,68,0.1); color: #991b1b; }
    .recs-group + .recs-group { margin-top: 22px; }
    .recs-group-title { font-size: 14px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
    .recs-group-title span { font-size: 11px; font-weight: 700; color: var(--accent); background: rgba(51,204,204,0.12); border-radius: 999px; padding: 1px 8px; }
    .recs-group-hint { font-size: 12px; color: var(--muted); margin: 2px 0 10px; }
    .rec-tags { margin-bottom: 4px; }
    .rec-effort { font-size: 11px; font-weight: 600; color: var(--muted); }
    .recs-more { margin-top: 10px; }
    .recs-more > summary {
      cursor: pointer; list-style: none;
      font-size: 13px; font-weight: 600; color: var(--accent);
      padding: 8px 14px; border: 1px dashed rgba(43,163,163,0.4); border-radius: 10px;
    }
    .recs-more > summary::-webkit-details-marker { display: none; }
    .recs-more[open] > summary { margin-bottom: 10px; }

    /* Fix snippets */
    .snippet-row-header { display: flex; align-items: flex-start; gap: 10px; }
    .snippet-row-text { flex: 1; }
    .snippet-row-actions { display: flex; gap: 4px; flex-shrink: 0; }
    .snippet-toggle, .snippet-copy {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px;
      font-size: 11px; font-weight: 600;
      border-radius: 6px;
      border: 1px solid rgba(43, 163, 163, 0.35);
      background: rgba(51, 204, 204, 0.08);
      color: var(--accent-deep);
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      white-space: nowrap;
    }
    .snippet-toggle:hover, .snippet-copy:hover {
      background: rgba(51, 204, 204, 0.18);
      border-color: var(--accent-deep);
    }
    .snippet-copy.copied {
      background: rgba(16, 185, 129, 0.12);
      border-color: #10b981;
      color: #047857;
    }
    .snippet-preview {
      margin-top: 10px;
      background: #0f172a;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(15, 23, 42, 0.08);
    }
    .snippet-preview[hidden] { display: none; }
    .snippet-preview-header {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.04);
      font-size: 11px;
      color: #cbd5e1;
    }
    .snippet-lang-tag {
      display: inline-block;
      padding: 2px 6px;
      background: rgba(51, 204, 204, 0.18);
      color: #5EEAEA;
      border-radius: 4px;
      font-weight: 700;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 10px;
      flex-shrink: 0;
    }
    .snippet-note {
      flex: 1; line-height: 1.3;
      color: #94a3b8;
      font-size: 11px;
    }
    .snippet-code {
      margin: 0;
      padding: 10px 12px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: #e2e8f0;
      white-space: pre;
      overflow-x: auto;
      max-height: 24rem;
    }
    .snippet-code code { font-family: inherit; }
    .snippet-none {
      margin-top: 6px;
      padding: 6px 10px;
      font-size: 12px;
      color: #64748b;
      background: rgba(148, 163, 184, 0.08);
      border-left: 2px solid #94a3b8;
      border-radius: 4px;
      line-height: 1.4;
    }

    /* Buttons */
    .print-wrap { text-align: center; margin-bottom: 24px; }
    .print-btn {
      background: linear-gradient(135deg, #33CCCC, #2BA3A3);
      color: #fff; border: none;
      padding: 12px 28px;
      border-radius: 12px;
      font-size: 14px; font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(51,204,204,0.25);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      font-family: inherit;
    }
    .print-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(51,204,204,0.35); }

    /* Footer */
    footer { text-align: center; padding: 16px 0 40px; font-size: 12px; color: var(--subtle); }
    footer a { color: var(--accent); text-decoration: none; font-weight: 500; }
    footer a:hover { text-decoration: underline; }
    .cta-card { margin: 0 auto 16px; max-width: 560px; padding: 14px 20px; border-radius: 12px;
      background: linear-gradient(135deg, rgba(51,204,204,0.10), rgba(16,185,129,0.08));
      border: 1px solid rgba(43,163,163,0.25); font-size: 13px; }
    .cta-card a { color: var(--accent-deep); font-weight: 600; }

    @keyframes slide-up {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 640px) {
      .overview { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; }
      .overview-item { padding: 6px 4px; }
      .snippet-row-header { flex-wrap: wrap; }
      .hero-score-card { padding: 20px 16px; }
      .category-card { padding: 16px 12px; }
      .crit-head { flex-wrap: wrap; }
      .crit-value { max-width: none; text-align: left; order: 3; width: 100%; padding-left: 24px; }
      .crit-body { padding-left: 14px; }
      .hero-score-card { grid-template-columns: 1fr; text-align: center; }
      .hero-score-main { text-align: center; }
      .hero-meta { text-align: center; }
      .hero-score-value { font-size: 40px; }
    }

    @media print {
      body { background: #fff; }
      .card { box-shadow: none; border: 1px solid #e5e7eb; break-inside: avoid; }
      .hero { background: #2BA3A3 !important; }
      .no-print { display: none; }
      .snippet-preview { display: none !important; }
      /* Break between blocks, never inside one: a whole expanded criterion
         per page left half pages empty */
      .crit { break-inside: auto; background: none; border: 1px solid #e5e7eb; }
      .crit-head { break-after: avoid; }
      .crit-block, .crit-block li, .recs-list li { break-inside: avoid; }
      /* Paper can't be clicked open: show every criterion in full. report.ts
         also opens them on beforeprint for browsers without ::details-content */
      details.crit::details-content, details.recs-more::details-content { content-visibility: visible; display: block; }
      .recs-more > summary { display: none; }
      .crit-teaser { display: none; }
      .toggle-all, .overview-item:hover { background: none; }
      .crit-chevron { display: none; }
      .category-card { break-inside: auto; }
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="container hero-content">
      <div class="hero-title">Paul AI GEO Analyzer</div>
      <div class="hero-sub">${escapeHtml(t('report_title'))}</div>
      <div class="hero-score-card">
        <div class="hero-score-main">
          <div class="hero-score-value"><span class="count-up" data-target="${result.totalScore.toFixed(1)}">0.0</span><span class="hero-score-max">/${result.maxTotalScore}</span></div>
          <span class="hero-score-badge" style="background:${ratingColor}">${escapeHtml(result.rating.label)}</span>
        </div>
        <div></div>
        <div class="hero-meta">
          <div class="hero-meta-host">${escapeHtml(hostname)}</div>
          <div>${escapeHtml(dateFormatted)}</div>
        </div>
        <div class="hero-progress">
          <div class="hero-track"><div class="hero-bar" data-target="${(result.totalScore / result.maxTotalScore) * 100}" style="background:${ratingColor}"></div></div>
        </div>
        ${renderOverviewHtml(result, categoryOrder)}
      </div>
    </div>
  </div>

  <div class="container">
    ${renderChangesHtml(result)}
    ${recommendationsHtml}

    <div class="details-bar">
      <h2>${escapeHtml(t('report_details_title'))}</h2>
      <button type="button" id="toggle-all" class="toggle-all no-print"
        data-expand="${escapeHtml(t('report_expand_all'))}"
        data-collapse="${escapeHtml(t('report_collapse_all'))}">${escapeHtml(t('report_expand_all'))}</button>
    </div>

    <div class="categories-list">
      ${categoriesHtml}
    </div>

    <div class="print-wrap no-print">
      <button id="print-btn" class="print-btn">${escapeHtml(t('report_saveAsPdf'))}</button>
    </div>

    <footer>
      <div class="cta-card">
        <a href="https://geo.mauch.rocks/?utm_source=extension&utm_medium=report&utm_campaign=geo-audit" target="_blank" rel="noopener">${escapeHtml(t('ui_agencyCta'))} →</a>
      </div>
      <p>${escapeHtml(t('report_generatedBy'))}</p>
      <p style="margin-top:4px"><a href="https://geo.mauch.rocks" target="_blank" rel="noopener">geo.mauch.rocks</a></p>
    </footer>
  </div>
</body>
</html>`;
}
