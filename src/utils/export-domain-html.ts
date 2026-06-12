import type { DomainPageSummary } from '../types/analysis';
import { getScoreRating } from './scoring';
import { t, getDateLocale } from './i18n';

// Standalone HTML for the domain dashboard, rendered through the existing
// report viewer (report/report.html reads 'geo_report_html' from storage).
// Visual language matches the analysis report (Inter, mesh-gradient hero,
// glass score card). Rows are sorted worst-first by the caller — no
// interactive sorting in v1.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
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

function renderTrend(delta: number | null): string {
  if (delta === null) return '<span class="trend trend-flat">—</span>';
  if (delta > 0) return `<span class="trend trend-up">▲ +${delta.toFixed(1)}</span>`;
  if (delta < 0) return `<span class="trend trend-down">▼ ${delta.toFixed(1)}</span>`;
  return '<span class="trend trend-flat">± 0</span>';
}

function renderRow(page: DomainPageSummary, index: number): string {
  // data-key = exact storage key of this page's history; the viewer's remove
  // handler (report.ts) deletes it and drops the row. data-score feeds the
  // client-side average recompute after removal.
  return `<tr style="--delay:${index * 40}ms" data-key="geo_history:${escapeHtml(page.url)}" data-score="${page.lastScore}">
    <td class="col-page"><a href="${escapeHtml(page.url)}" target="_blank" rel="noopener">${escapeHtml(page.path)}</a></td>
    <td class="col-score"><span style="color:${escapeHtml(page.ratingColor)}">${page.lastScore.toFixed(1)}</span><span class="score-max">/30</span></td>
    <td class="col-rating"><span class="badge" style="background:${escapeHtml(page.ratingColor)}">${escapeHtml(page.ratingLabel)}</span></td>
    <td class="col-trend">${renderTrend(page.delta)}</td>
    <td class="col-date">${escapeHtml(formatDate(page.lastTimestamp))}</td>
    <td class="col-count">${page.analysisCount}</td>
    <td class="col-remove">
      <button type="button" class="dash-remove" data-confirm="${escapeHtml(t('dash_removeConfirm'))}" title="${escapeHtml(t('dash_remove'))}" aria-label="${escapeHtml(t('dash_remove'))}">×</button>
    </td>
  </tr>`;
}

export function generateDomainDashboardHtml(
  hostname: string,
  pages: DomainPageSummary[]
): string {
  const avg =
    pages.length > 0
      ? Math.round((pages.reduce((sum, p) => sum + p.lastScore, 0) / pages.length) * 10) / 10
      : 0;
  const avgRating = getScoreRating(avg);

  const tableHtml =
    pages.length === 0
      ? `<p class="empty">${escapeHtml(t('dash_empty'))}</p>`
      : `<table>
          <thead>
            <tr>
              <th>${escapeHtml(t('dash_colPage'))}</th>
              <th>${escapeHtml(t('dash_colScore'))}</th>
              <th>${escapeHtml(t('dash_colRating'))}</th>
              <th>${escapeHtml(t('dash_colTrend'))}</th>
              <th>${escapeHtml(t('dash_colLast'))}</th>
              <th>${escapeHtml(t('dash_colCount'))}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${pages.map(renderRow).join('')}</tbody>
        </table>
        <p class="hint">${escapeHtml(t('dash_hint'))}</p>`;

  return `<!DOCTYPE html>
<html lang="${getDateLocale().split('-')[0]}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(t('dash_title'))} — ${escapeHtml(hostname)}</title>
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
      padding: 20px 28px;
      box-shadow: 0 8px 32px rgba(15,23,42,0.12);
      margin-top: 24px;
      display: flex;
      gap: 32px;
      align-items: center;
      flex-wrap: wrap;
    }
    .stat-value { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
    .stat-label { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: var(--shadow-md);
      margin-bottom: 32px;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--subtle);
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tbody tr { animation: slide-up 0.4s var(--delay, 0ms) backwards cubic-bezier(0.16, 1, 0.3, 1); }
    tbody tr:hover { background: rgba(51,204,204,0.04); }
    tbody tr:last-child td { border-bottom: none; }
    .col-page a { color: var(--accent-deep); text-decoration: none; font-weight: 500; word-break: break-all; }
    .col-page a:hover { text-decoration: underline; }
    .col-score { font-weight: 700; white-space: nowrap; }
    .score-max { color: var(--subtle); font-weight: 500; font-size: 11px; }
    .col-count { color: var(--muted); text-align: right; }
    .col-date { color: var(--muted); white-space: nowrap; }
    .trend { font-size: 12px; font-weight: 600; white-space: nowrap; }
    .trend-up { color: #16a34a; }
    .trend-down { color: #dc2626; }
    .trend-flat { color: var(--subtle); }
    .empty { color: var(--muted); text-align: center; padding: 24px 0; }
    .cta-card { margin: 0 auto 16px; max-width: 560px; padding: 14px 20px; border-radius: 12px;
      background: linear-gradient(135deg, rgba(51,204,204,0.10), rgba(16,185,129,0.08));
      border: 1px solid rgba(43,163,163,0.25); font-size: 13px; text-align: center; }
    .cta-card a { color: var(--accent-deep); font-weight: 600; text-decoration: none; }
    .cta-card a:hover { text-decoration: underline; }
    .col-remove { text-align: right; width: 1%; }
    .dash-remove {
      border: 1px solid transparent;
      background: none;
      color: var(--subtle);
      font-size: 16px;
      line-height: 1;
      padding: 2px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      white-space: nowrap;
    }
    .dash-remove:hover { color: #dc2626; background: rgba(220,38,38,0.08); }
    .dash-remove.confirm {
      color: #fff;
      background: #dc2626;
      border-color: #dc2626;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
    }
    .hint { font-size: 11px; color: var(--subtle); margin-top: 10px; }
    footer { padding: 16px 0 32px; text-align: center; font-size: 11px; color: var(--subtle); }
    @keyframes slide-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @media print { .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="hero">
    <div class="container hero-content">
      <div class="hero-title">${escapeHtml(t('dash_title'))}</div>
      <div class="hero-sub">${escapeHtml(hostname)}</div>
      <div class="hero-score-card">
        <div>
          <div class="stat-value" id="dash-count">${pages.length}</div>
          <div class="stat-label">${escapeHtml(t('dash_pagesAnalyzed'))}</div>
        </div>
        <div>
          <div class="stat-value" style="color:${escapeHtml(avgRating.color)}"><span id="dash-avg">${avg.toFixed(1)}</span><span class="score-max" style="font-size:16px">/30</span></div>
          <div class="stat-label">${escapeHtml(t('dash_avgScore'))}</div>
        </div>
        <div>
          <div style="margin-bottom:4px"><span class="badge" style="background:${escapeHtml(avgRating.color)}">${escapeHtml(avgRating.label)}</span></div>
          <div class="stat-label">${escapeHtml(t('dash_avgRating'))}</div>
        </div>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="card" data-empty="${escapeHtml(t('dash_empty'))}">${tableHtml}</div>
  </div>
  <footer>
    <div class="cta-card">
      <a href="https://geo.mauch.rocks/?utm_source=extension&utm_medium=dashboard&utm_campaign=geo-audit" target="_blank" rel="noopener">${escapeHtml(t('ui_agencyCta'))} →</a>
    </div>
    Paul AI GEO Analyzer — geo.mauch.rocks
  </footer>
</body>
</html>`;
}
