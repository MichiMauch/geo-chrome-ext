// Standalone HTML of a comparison (geo diff --html), for sending to a client
// or attaching to a ticket, in the look of the extension's report.
import { t, getLang } from '../src/utils/i18n';
import type { SnapshotDiff } from './diff';
import { l } from './labels';
import { deltaClass, escapeHtml, formatDate, hero, page, signed } from './html-base';

const score = (n: number | null) => (n === null ? '–' : n.toFixed(1));

function host(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

const runLine = (r: SnapshotDiff['before']) =>
  `${r.label ? `<strong>${escapeHtml(r.label)}</strong> · ` : ''}${escapeHtml(formatDate(r.createdAt))} · ${escapeHtml(host(r.origin))} · v${escapeHtml(r.version)}`;

// Bar from 0 to the larger count, before as outline, after filled
function bars(before: number, after: number, max: number): string {
  const w = (n: number) => (max ? (n / max) * 100 : 0).toFixed(1);
  return `<div class="bars"><span class="b-before" style="width:${w(before)}%"></span><span class="b-after ${deltaClass(before - after)}" style="width:${w(after)}%"></span></div>`;
}

export function generateDiffHtml(diff: SnapshotDiff, options: { nav?: string; pageHref?: (path: string) => string | undefined } = {}): string {
  const c = diff.common;
  const changedFindings = diff.findings.filter((f) => f.newOn.length || f.fixedOn.length);
  const unchanged = diff.findings.filter((f) => !f.newOn.length && !f.fixedOn.length && f.after > 0);
  const maxCount = Math.max(1, ...diff.findings.map((f) => Math.max(f.before, f.after)));
  const pages = diff.pages.filter((p) => p.delta !== 0 || p.findingsNew.length || p.findingsFixed.length);
  const pathCell = (path: string) => {
    const href = options.pageHref?.(path);
    return href ? `<a href="${escapeHtml(href)}">${escapeHtml(path)}</a>` : escapeHtml(path);
  };

  const findingRows = (list: typeof diff.findings) =>
    list
      .map(
        (f) => `<tr>
  <td>${escapeHtml(f.text)}<div class="muted" style="font-size:12px">${escapeHtml(l(`owner_${f.owner}`))} · ${escapeHtml(t(`effort_${f.effort}`))}</div></td>
  <td class="num">${f.before}</td><td class="num">${f.after}</td>
  <td class="num ${deltaClass(f.before - f.after)}">${signed(f.after - f.before)}</td>
  <td style="width:160px">${bars(f.before, f.after, maxCount)}</td>
</tr>`
      )
      .join('\n');

  const pageRows = pages
    .map(
      (p) => `<tr>
  <td class="path">${pathCell(p.path)}</td>
  <td class="num">${p.before.toFixed(1)}</td><td class="num">${p.after.toFixed(1)}</td>
  <td class="num ${deltaClass(p.delta)}">${signed(p.delta)}</td>
  <td>${p.regressed.map((id) => `<span class="chip down">${escapeHtml(t(id))}</span>`).join('')}${p.fixed
        .map((id) => `<span class="chip up">${escapeHtml(t(id))}</span>`)
        .join('')}</td>
</tr>`
    )
    .join('\n');

  const list = (title: string, items: string[]) =>
    items.length
      ? `<section class="card"><h2>${escapeHtml(title)} <span class="muted">(${items.length})</span></h2><ul style="margin-left:18px" class="path">${items.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></section>`
      : '';

  return page({
    lang: getLang(),
    title: `${l('comparison')} · ${host(diff.after.origin)}`,
    body: `${hero({
      sub: l('siteReportSub'),
      title: l('comparison'),
      lines: [`${escapeHtml(l('before'))}: ${runLine(diff.before)}`, `${escapeHtml(l('after'))}: ${runLine(diff.after)}`],
      nav: options.nav,
    })}
<main class="container">
${diff.versionChanged ? `<p class="warn">${escapeHtml(l('versionChanged', { from: diff.before.version, to: diff.after.version }))}</p>` : ''}
<section class="card"><div class="kpis">
  <div class="kpi"><div class="v">${score(c.before)} → ${score(c.after)}</div><div class="l">${escapeHtml(l('average'))} · ${c.pages} ${escapeHtml(l('pages'))}${c.delta !== null ? ` · <span class="${deltaClass(c.delta)}">${signed(c.delta)}</span>` : ''}</div></div>
  <div class="kpi"><div class="v up">${diff.totals.fixed}</div><div class="l">${escapeHtml(l('findings'))} ${escapeHtml(l('fixed'))}</div></div>
  <div class="kpi"><div class="v down">${diff.totals.new}</div><div class="l">${escapeHtml(l('findings'))} ${escapeHtml(l('new'))}</div></div>
  <div class="kpi"><div class="v">${diff.totals.pagesUp} / ${diff.totals.pagesDown}</div><div class="l">${escapeHtml(l('pagesUp'))} / ${escapeHtml(l('pagesDown'))}</div></div>
</div></section>
${
  changedFindings.length || unchanged.length
    ? `<section class="card"><h2>${escapeHtml(l('byFinding'))}</h2><div class="scroll"><table>
<tr><th>${escapeHtml(l('findings'))}</th><th class="num">${escapeHtml(l('before'))}</th><th class="num">${escapeHtml(l('after'))}</th><th class="num">${escapeHtml(l('change'))}</th><th></th></tr>
${findingRows(changedFindings)}
${findingRows(unchanged)}
</table></div></section>`
    : ''
}
<section class="card"><h2>${escapeHtml(l('byPage'))}</h2>${
      pages.length
        ? `<div class="scroll"><table>
<tr><th>${escapeHtml(l('pageCol'))}</th><th class="num">${escapeHtml(l('before'))}</th><th class="num">${escapeHtml(l('after'))}</th><th class="num">${escapeHtml(l('change'))}</th><th>${escapeHtml(l('criteria'))}</th></tr>
${pageRows}
</table></div>`
        : `<p class="muted">${escapeHtml(l('noChanges'))}</p>`
    }</section>
${list(l('newCriteria'), diff.newCriteria.map((id) => t(id)))}
${list(l('pagesAdded'), diff.pagesAdded)}
${list(l('pagesRemoved'), diff.pagesRemoved)}
${list(l('pagesFailed'), diff.pagesFailed.map((p) => `${p.path} (${p.after ?? p.before ?? ''})`))}
<p class="footer">${escapeHtml(l('footer', { version: diff.after.version }))}</p>
</main>`,
  });
}
