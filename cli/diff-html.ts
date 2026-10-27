// Standalone HTML of a comparison (geo diff --html), for sending to a client
// or attaching to a ticket. No external assets; follows the system theme.
import { t, getDateLocale } from '../src/utils/i18n';
import type { SnapshotDiff } from './diff';
import { l } from './labels';

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
    return new Intl.DateTimeFormat(getDateLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const deltaClass = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
const score = (n: number | null) => (n === null ? '–' : n.toFixed(1));

function runLabel(r: SnapshotDiff['before']): string {
  return `${r.label ? `<strong>${escapeHtml(r.label)}</strong> · ` : ''}${escapeHtml(formatDate(r.createdAt))}<br><span class="muted">${escapeHtml(r.origin)} · v${escapeHtml(r.version)}</span>`;
}

// Bar from 0 to the larger count, before as outline, after filled
function bars(before: number, after: number, max: number): string {
  const w = (n: number) => (max ? (n / max) * 100 : 0).toFixed(1);
  return `<div class="bars"><span class="b-before" style="width:${w(before)}%"></span><span class="b-after ${deltaClass(before - after)}" style="width:${w(after)}%"></span></div>`;
}

export function generateDiffHtml(diff: SnapshotDiff): string {
  const c = diff.common;
  const changedFindings = diff.findings.filter((f) => f.newOn.length || f.fixedOn.length);
  const maxCount = Math.max(1, ...diff.findings.map((f) => Math.max(f.before, f.after)));
  const pages = diff.pages.filter((p) => p.delta !== 0 || p.findingsNew.length || p.findingsFixed.length);
  const unchanged = diff.findings.filter((f) => !f.newOn.length && !f.fixedOn.length && f.after > 0);

  const findingRows = (list: typeof diff.findings) =>
    list
      .map(
        (f) => `<tr>
  <td>${escapeHtml(f.text)}<div class="muted">${escapeHtml(l(`owner_${f.owner}`))} · ${escapeHtml(l(`effort_${f.effort}`))}</div></td>
  <td class="num">${f.before}</td><td class="num">${f.after}</td>
  <td class="num ${deltaClass(f.before - f.after)}">${signed(f.after - f.before)}</td>
  <td class="barcell">${bars(f.before, f.after, maxCount)}</td>
</tr>`
      )
      .join('\n');

  const pageRows = pages
    .map(
      (p) => `<tr>
  <td class="path">${escapeHtml(p.path)}</td>
  <td class="num">${p.before.toFixed(1)}</td><td class="num">${p.after.toFixed(1)}</td>
  <td class="num ${deltaClass(p.delta)}">${signed(p.delta)}</td>
  <td>${p.regressed.map((id) => `<span class="chip down">${escapeHtml(t(id))}</span>`).join(' ')}${p.fixed
        .map((id) => `<span class="chip up">${escapeHtml(t(id))}</span>`)
        .join(' ')}</td>
</tr>`
    )
    .join('\n');

  const list = (title: string, items: string[]) =>
    items.length
      ? `<section><h2>${escapeHtml(title)} <span class="muted">(${items.length})</span></h2><ul class="paths">${items.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></section>`
      : '';

  return `<!doctype html>
<html lang="${escapeHtml(getDateLocale().slice(0, 2))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(l('comparison'))} · ${escapeHtml(new URL(diff.after.origin || 'https://x.invalid').hostname)}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1a1a1a;--muted:#6b6b6b;--line:#e4e4e0;--up:#15803d;--down:#b91c1c;--upbg:#dcfce7;--downbg:#fee2e2;--bar:#d4d4cf;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--ink:#ededea;--muted:#9a9a95;--line:#33332f;--up:#4ade80;--down:#f87171;--upbg:#14532d;--downbg:#7f1d1d;--bar:#4a4a45;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:0 0 12px}
.muted{color:var(--muted);font-size:13px}
.runs{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:20px 0}
.runs>div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.arrow{font-size:22px;color:var(--muted)}
.warn{background:#fef3c7;color:#78350f;border-radius:8px;padding:10px 14px;margin:0 0 16px}
@media (prefers-color-scheme:dark){.warn{background:#422006;color:#fde68a}}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 28px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.kpi .v{font-size:28px;font-weight:650;font-variant-numeric:tabular-nums}
.kpi .l{color:var(--muted);font-size:13px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px;margin:0 0 20px}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:8px 6px;border-top:1px solid var(--line);vertical-align:top}
th{font-weight:600;color:var(--muted);font-size:12px;border-top:0}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.up{color:var(--up)}.down{color:var(--down)}.flat{color:var(--muted)}
.path{font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all}
.barcell{width:160px}
.bars{position:relative;height:14px;min-width:120px}
.bars span{position:absolute;left:0;top:0;height:14px;border-radius:3px}
.b-before{border:1.5px solid var(--bar)}
.b-after{background:var(--bar);top:3px!important;height:8px!important}
.b-after.up{background:var(--up)}.b-after.down{background:var(--down)}
.chip{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;margin:2px 2px 0 0}
.chip.up{background:var(--upbg)}.chip.down{background:var(--downbg)}
.paths{margin:0;padding-left:18px;font-family:ui-monospace,Menlo,monospace;font-size:13px}
@media (max-width:560px){.runs{grid-template-columns:1fr}.arrow{display:none}.barcell{display:none}}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(l('comparison'))}</h1>
<div class="runs"><div>${runLabel(diff.before)}</div><div class="arrow">→</div><div>${runLabel(diff.after)}</div></div>
${diff.versionChanged ? `<p class="warn">${escapeHtml(l('versionChanged', { from: diff.before.version, to: diff.after.version }))}</p>` : ''}
<div class="kpis">
  <div class="kpi"><div class="v">${score(c.before)} → ${score(c.after)}</div><div class="l">${escapeHtml(l('average'))} · ${c.pages} ${escapeHtml(l('pages'))}${c.delta !== null ? ` · <span class="${deltaClass(c.delta)}">${signed(c.delta)}</span>` : ''}</div></div>
  <div class="kpi"><div class="v up">${diff.totals.fixed}</div><div class="l">${escapeHtml(l('findings'))} ${escapeHtml(l('fixed'))}</div></div>
  <div class="kpi"><div class="v down">${diff.totals.new}</div><div class="l">${escapeHtml(l('findings'))} ${escapeHtml(l('new'))}</div></div>
  <div class="kpi"><div class="v">${diff.totals.pagesUp} / ${diff.totals.pagesDown}</div><div class="l">${escapeHtml(l('pagesUp'))} / ${escapeHtml(l('pagesDown'))}</div></div>
</div>
${
  changedFindings.length || unchanged.length
    ? `<section><h2>${escapeHtml(l('byFinding'))}</h2><div class="scroll"><table>
<tr><th>${escapeHtml(l('findings'))}</th><th class="num">${escapeHtml(l('before'))}</th><th class="num">${escapeHtml(l('after'))}</th><th class="num">${escapeHtml(l('change'))}</th><th></th></tr>
${findingRows(changedFindings)}
${findingRows(unchanged)}
</table></div></section>`
    : ''
}
<section><h2>${escapeHtml(l('byPage'))}</h2>${
    pages.length
      ? `<div class="scroll"><table>
<tr><th></th><th class="num">${escapeHtml(l('before'))}</th><th class="num">${escapeHtml(l('after'))}</th><th class="num">${escapeHtml(l('change'))}</th><th>${escapeHtml(l('criteria'))}</th></tr>
${pageRows}
</table></div>`
      : `<p class="muted">${escapeHtml(l('noChanges'))}</p>`
  }</section>
${list(l('newCriteria'), diff.newCriteria.map((id) => t(id)))}
${list(l('pagesAdded'), diff.pagesAdded)}
${list(l('pagesRemoved'), diff.pagesRemoved)}
${list(l('pagesFailed'), diff.pagesFailed.map((p) => `${p.path} (${p.after ?? p.before ?? ''})`))}
</main>
</body>
</html>
`;
}
