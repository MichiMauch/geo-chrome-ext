import type { GEOAnalysisResult, AnalysisCategory, CategoryDetail } from '../types/analysis';
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
  if (criterion === t('criterion_sources')) {
    if (!d.found) return t('explain_sources_bad', { current, target });
    return t('explain_sources_ok');
  }
  // Schema
  if (criterion === t('criterion_schema')) {
    if (current === 0) return t('explain_schema_missing');
    if (!d.found || current < target) return t('explain_schema_partial', { current, target, value });
    return t('explain_schema_ok', { value });
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
  // llms.txt
  if (criterion === t('criterion_llmsTxt')) {
    if (!d.found) return t('explain_llmstxt_missing');
    return t('explain_llmstxt_ok');
  }
  // robots.txt — AI bot access
  if (criterion === t('criterion_robotsTxt')) {
    const total = d.progress?.target ?? 0;
    const allowed = d.progress?.current ?? 0;
    const blocked = Math.max(0, total - allowed);
    if (blocked === 0) return t('explain_robotstxt_ok');
    if (total > 0 && blocked === total) return t('explain_robotstxt_all_blocked');
    return t('explain_robotstxt_partial', { blocked, total });
  }
  // Facts
  if (criterion === t('criterion_facts')) {
    if (!d.found) return t('explain_facts_bad', { value });
    return t('explain_facts_ok');
  }
  // FAQ
  if (criterion === t('criterion_faq')) {
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
    if (!d.found) return t('explain_indexability_bad');
    return t('explain_indexability_ok');
  }
  // On-Page SEO: Social cards
  if (criterion === t('criterion_social_cards')) {
    if (!d.found) return t('explain_social_cards_bad', { current, target });
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

function renderCategoryHtml(category: AnalysisCategory, iconKey: string, delay: number): string {
  const color = getCategoryColor(category.score);
  const percentage = (category.score / 5) * 100;
  const iconSvg = CATEGORY_ICONS[iconKey] || CATEGORY_ICONS.contentClarity;

  const details = category.details.map((d) => {
    let icon: string;
    let iconColor: string;
    let bgColor: string;

    if (d.progress) {
      const pct = (d.progress.current / d.progress.target) * 100;
      if (pct >= 100) { icon = '✓'; iconColor = '#10b981'; bgColor = 'rgba(16,185,129,0.06)'; }
      else if (pct > 0) { icon = '◐'; iconColor = '#f59e0b'; bgColor = 'rgba(245,158,11,0.06)'; }
      else { icon = '✗'; iconColor = '#ef4444'; bgColor = 'rgba(239,68,68,0.06)'; }
    } else {
      icon = d.found ? '✓' : '✗';
      iconColor = d.found ? '#10b981' : '#ef4444';
      bgColor = d.found ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)';
    }

    const progressText = d.progress && d.progress.target > 1
      ? ` <span style="color:#94a3b8;font-weight:500">(${d.progress.current}/${d.progress.target})</span>`
      : '';

    const explanation = getExplanation(d);
    const explanationHtml = explanation
      ? `<div style="font-size:12px;color:#64748b;margin-top:6px;padding-left:22px;line-height:1.5">${escapeHtml(explanation)}</div>`
      : '';

    return `<div style="background:${bgColor};border-radius:10px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:${iconColor};font-weight:700;font-size:14px;flex-shrink:0;width:14px">${icon}</span>
        <span style="font-weight:500;font-size:13px;color:#0f172a">${escapeHtml(d.criterionKey)}${progressText}</span>
        ${d.value ? `<span style="color:#94a3b8;margin-left:auto;font-size:12px;flex-shrink:0;font-weight:500">${escapeHtml(String(d.value))}</span>` : ''}
      </div>
      ${explanationHtml}
    </div>`;
  }).join('');

  return `
    <div class="card category-card" style="--delay:${delay}ms">
      <div class="cat-header">
        <div class="cat-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${iconSvg}</svg>
        </div>
        <div class="cat-title">${escapeHtml(category.nameKey)}</div>
        <div class="cat-score" style="color:${color}">${category.score.toFixed(1)}<span style="color:#94a3b8;font-weight:500">/5</span></div>
      </div>
      <div class="progress-track"><div class="progress-bar" data-target="${percentage}" style="background:${color}"></div></div>
      <div style="margin-top:16px">
        ${details}
      </div>
    </div>`;
}

function renderRecommendationItemHtml(recKey: string, index: number): string {
  const text = t(`rec_${recKey}`);
  const snippet = getFixSnippet(recKey);
  const snippetId = `snippet-${index}`;

  if (!snippet) {
    return `<li>${escapeHtml(text)}</li>`;
  }

  if (snippet.type === 'no-snippet') {
    return `<li>
      <div>${escapeHtml(text)}</div>
      <div class="snippet-none">${escapeHtml(snippet.note)}</div>
    </li>`;
  }

  const langLabel = getSnippetLanguageLabel(snippet.language);
  const showLabel = escapeHtml(t('snippet_label_show'));
  const hideLabel = escapeHtml(t('snippet_label_hide'));
  const copyLabel = escapeHtml(t('snippet_label_copy'));
  const copiedLabel = escapeHtml(t('snippet_label_copied'));
  return `<li>
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

  const recommendationsHtml = result.topRecommendations.length > 0
    ? `<div class="card recs-card">
        <h2 class="card-title" style="display:flex;align-items:center;gap:10px">
          <div class="cat-icon" style="background:rgba(51,204,204,0.1);color:#2BA3A3">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.75V17h8v-2.25A7 7 0 0012 2z"/></svg>
          </div>
          ${escapeHtml(t('report_recommendations'))}
        </h2>
        <ul class="recs-list">
          ${result.topRecommendations.map((recKey, i) => renderRecommendationItemHtml(recKey, i)).join('')}
        </ul>
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

    /* Categories grid */
    .categories-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .category-card { padding: 20px; }
    .cat-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
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
      .categories-grid { grid-template-columns: 1fr; }
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
      </div>
    </div>
  </div>

  <div class="container">
    <div class="categories-grid">
      ${categoriesHtml}
    </div>

    ${recommendationsHtml}

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
