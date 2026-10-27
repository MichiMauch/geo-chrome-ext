// Shared look of the CLI's HTML pages (site report, comparison, viewer):
// the visual language of the extension's report — Inter, teal mesh-gradient
// hero, white cards, score ring and bars in the rating colors.
import { getDateLocale } from '../src/utils/i18n';
import { getCategoryColor, getScoreRating } from '../src/utils/scoring';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(iso: string, withTime = true): string {
  try {
    return new Intl.DateTimeFormat(getDateLocale(), {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
export const deltaClass = (n: number): string => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

/** Score ring like the report's title page: value inside, colored arc. */
export function scoreRing(score: number | null, max = 30, size = 150): string {
  const value = score ?? 0;
  const color = getScoreRating(value).color;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, value / max)) * c;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${value}/${max}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="14"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
    stroke-dasharray="${filled.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-text">
    <tspan class="ring-value">${score === null ? '–' : value.toFixed(1)}</tspan><tspan class="ring-max" dx="4">/${max}</tspan>
  </text>
</svg>`;
}

/** Category bar (0–5) in the category colors of the extension. */
export function categoryBar(name: string, score: number): string {
  const color = getCategoryColor(score);
  return `<div class="catbar">
  <div class="catbar-head"><span>${escapeHtml(name)}</span><strong style="color:${color}">${score.toFixed(1)}<span>/5</span></strong></div>
  <div class="track"><div class="fill" style="width:${(score / 5) * 100}%;background:${color}"></div></div>
</div>`;
}

export function scoreBar(score: number, max = 30): string {
  const color = getScoreRating(score).color;
  return `<div class="track small"><div class="fill" style="width:${(score / max) * 100}%;background:${color}"></div></div>`;
}

export function page(input: { lang: string; title: string; body: string; extraCss?: string }): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(input.lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(input.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${BASE_CSS}${input.extraCss ?? ''}</style>
</head>
<body>
${input.body}
</body>
</html>
`;
}

export function hero(input: { sub: string; title: string; lines: string[]; nav?: string }): string {
  return `<header class="hero"><div class="container hero-content">
  ${input.nav ? `<nav class="crumbs">${input.nav}</nav>` : ''}
  <p class="hero-sub">${escapeHtml(input.sub)}</p>
  <h1 class="hero-title">${escapeHtml(input.title)}</h1>
  ${input.lines.map((line) => `<p class="hero-line">${line}</p>`).join('')}
</div></header>`;
}

export const BASE_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #F8FAFC; --card: #ffffff; --border: rgba(15,23,42,0.08); --line: #eef2f6;
  --text: #0f172a; --muted: #64748b; --subtle: #94a3b8;
  --accent: #33CCCC; --accent-deep: #2BA3A3;
  --up: #16a34a; --down: #dc2626; --upbg: rgba(34,197,94,0.12); --downbg: rgba(239,68,68,0.10);
  --shadow-md: 0 4px 12px rgba(15,23,42,0.04), 0 2px 4px rgba(15,23,42,0.03);
  color-scheme: light;
}
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; -webkit-font-smoothing: antialiased; min-height: 100vh; font-size: 14px; }
a { color: var(--accent-deep); }
.container { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
.hero { position: relative; padding: 28px 0 96px; background:
  radial-gradient(ellipse 60% 80% at 20% 30%, rgba(51,204,204,0.25), transparent 60%),
  radial-gradient(ellipse 50% 70% at 80% 40%, rgba(16,185,129,0.18), transparent 60%),
  radial-gradient(ellipse 70% 60% at 50% 90%, rgba(43,163,163,0.15), transparent 60%),
  linear-gradient(135deg, #0f766e 0%, #2BA3A3 50%, #33CCCC 100%); overflow: hidden; }
.hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0); background-size: 24px 24px; opacity: 0.3; }
.hero-content { position: relative; color: #fff; }
.hero-sub { font-size: 13px; font-weight: 600; opacity: 0.9; }
.hero-title { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; margin: 6px 0 8px; }
.hero-line { font-size: 14px; opacity: 0.9; word-break: break-all; }
.hero-line strong { font-weight: 700; }
.crumbs { font-size: 13px; margin-bottom: 18px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.crumbs a { color: #fff; text-decoration: none; opacity: 0.85; font-weight: 600; }
.crumbs a:hover { opacity: 1; text-decoration: underline; }
.crumbs span { opacity: 0.6; }
main.container { margin-top: -72px; position: relative; padding-bottom: 56px; display: grid; gap: 20px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: var(--shadow-md); }
.card h2 { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
.card .hint { color: var(--muted); font-size: 13px; margin-bottom: 14px; }
.summary { display: grid; grid-template-columns: auto 1fr; gap: 28px 40px; align-items: center; }
.ring-wrap { display: grid; justify-items: center; gap: 10px; }
.ring-value { font-size: 34px; font-weight: 800; fill: var(--text); letter-spacing: -0.02em; }
.ring-max { font-size: 14px; fill: var(--subtle); font-weight: 500; }
.badge { display: inline-block; padding: 5px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; color: #fff; }
.cats { display: grid; gap: 12px; }
.catbar-head { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 5px; }
.catbar-head strong span { color: var(--subtle); font-weight: 500; font-size: 11px; }
.track { height: 8px; background: var(--line); border-radius: 999px; overflow: hidden; }
.track.small { height: 6px; min-width: 80px; }
.fill { height: 100%; border-radius: 999px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; grid-column: 1 / -1; }
.kpi { border: 1px solid var(--border); border-radius: 14px; padding: 14px; text-align: center; }
.kpi .v { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.kpi .l { font-size: 12px; color: var(--muted); }
.up { color: var(--up); } .down { color: var(--down); } .flat { color: var(--subtle); }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 8px; border-top: 1px solid var(--line); vertical-align: middle; }
th { font-size: 12px; font-weight: 600; color: var(--muted); border-top: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.path { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; word-break: break-all; }
td.path a { text-decoration: none; }
td.path a:hover { text-decoration: underline; }
.chip { display: inline-block; font-size: 12px; padding: 2px 9px; border-radius: 999px; margin: 2px 4px 2px 0; }
.chip.up { background: var(--upbg); color: #166534; } .chip.down { background: var(--downbg); color: #991b1b; }
.chip.neutral { background: rgba(51,204,204,0.12); color: #0f766e; }
.recs-group + .recs-group { margin-top: 22px; }
.recs-group h3 { font-size: 15px; font-weight: 700; display: flex; gap: 8px; align-items: center; }
.recs-group h3 .count { font-size: 12px; font-weight: 700; color: var(--accent-deep); background: rgba(51,204,204,0.12); border-radius: 999px; padding: 1px 8px; }
.recs-group .group-hint { color: var(--muted); font-size: 13px; margin: 2px 0 12px; }
.rec { background: rgba(51,204,204,0.06); border-left: 3px solid var(--accent); border-radius: 10px; padding: 12px 14px; }
.rec + .rec { margin-top: 10px; }
.rec-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
.rec-text { font-size: 14px; }
.rec details { margin-top: 6px; font-size: 13px; }
.rec summary { cursor: pointer; color: var(--accent-deep); font-weight: 600; }
.more { margin-top: 10px; }
.more > summary { cursor: pointer; color: var(--accent-deep); font-weight: 600; font-size: 13px; margin-bottom: 10px; }
.rec ul { margin: 6px 0 0 18px; font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; }
.chart { width: 100%; height: auto; display: block; }
.chart .axis { stroke: var(--line); }
.chart .lbl { fill: var(--muted); font-size: 11px; }
.chart .val { fill: var(--text); font-size: 11px; font-weight: 700; }
.warn { background: #fef3c7; color: #78350f; border-radius: 10px; padding: 10px 14px; font-size: 13px; }
.muted { color: var(--muted); }
.footer { color: var(--subtle); font-size: 12px; text-align: center; padding: 8px 0 0; }
.bars { position: relative; height: 14px; min-width: 120px; }
.bars span { position: absolute; left: 0; height: 14px; border-radius: 4px; }
.bars .b-before { top: 0; border: 1.5px solid #cbd5e1; }
.bars .b-after { top: 3px; height: 8px; background: #cbd5e1; }
.bars .b-after.up { background: var(--up); } .bars .b-after.down { background: var(--down); }
.form-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
select, button { font: inherit; font-size: 13px; padding: 7px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: var(--text); }
button { cursor: pointer; background: var(--accent-deep); border-color: var(--accent-deep); color: #fff; font-weight: 600; }
button:hover { background: #0f766e; }
@media (max-width: 720px) {
  .summary { grid-template-columns: 1fr; }
  .hero-title { font-size: 26px; }
}
`;
