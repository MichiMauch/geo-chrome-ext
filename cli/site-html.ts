// Site report of one run (geo report site): the extension's report look for a
// whole site — average score, categories, findings per owner with the pages
// they hit, the change since the baseline, the history of runs and every page
// with a link to its own report.
import { t, getLang } from '../src/utils/i18n';
import { getScoreRating } from '../src/utils/scoring';
import type { Finding, PageEntry, Snapshot, CategoryKey } from './snapshot';
import { round1 } from './snapshot';
import type { SnapshotDiff } from './diff';
import { l } from './labels';
import { categoryBar, deltaClass, escapeHtml, formatDate, hero, page, scoreBar, scoreRing, signed } from './html-base';

const signed1 = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
// Findings shown per owner before "+ N more", as in the extension's report
const VISIBLE = 5;

const CATEGORY_ORDER: CategoryKey[] = ['contentClarity', 'answerability', 'trustSources', 'machineReadability', 'aiCitation', 'onPageSeo'];

export interface HistoryPoint {
  createdAt: string;
  label?: string;
  averageScore: number | null;
  analyzed: number;
  href?: string;
  current?: boolean;
}

export interface SiteReportInput {
  snapshot: Snapshot;
  diff?: SnapshotDiff;
  history?: HistoryPoint[];
  // Link to a page's own report; no link when undefined
  pageHref?: (path: string) => string | undefined;
  diffHref?: string;
  // Breadcrumb HTML above the title (viewer navigation)
  nav?: string;
  // Extra card at the end (the viewer's compare form)
  extra?: string;
}

const host = (origin: string) => {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
};

function averageCategories(pages: PageEntry[]): Record<CategoryKey, number> | null {
  const ok = pages.filter((p) => p.status === 'ok' && p.categories);
  if (!ok.length) return null;
  return Object.fromEntries(
    CATEGORY_ORDER.map((k) => [k, round1(ok.reduce((sum, p) => sum + (p.categories![k] ?? 0), 0) / ok.length)])
  ) as Record<CategoryKey, number>;
}

// Line chart of the average score over the runs, each point a link
function historyChart(points: HistoryPoint[]): string {
  const pts = points.filter((p) => p.averageScore !== null);
  if (pts.length < 2) return '';
  const w = 960;
  const h = 200;
  const pad = { l: 64, r: 64, t: 24, b: 34 };
  const scores = pts.map((p) => p.averageScore!);
  const lo = Math.max(0, Math.floor(Math.min(...scores) - 2));
  const hi = Math.min(30, Math.ceil(Math.max(...scores) + 2));
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (pts.length - 1);
  const y = (v: number) => pad.t + ((hi - v) * (h - pad.t - pad.b)) / Math.max(1, hi - lo);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.averageScore!).toFixed(1)}`).join(' ');
  const grid = [lo, Math.round((lo + hi) / 2), hi]
    .map((v) => `<line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="lbl" x="${pad.l - 40}" y="${y(v) + 4}" text-anchor="end">${v}</text>`)
    .join('');
  const dots = pts
    .map((p, i) => {
      const color = getScoreRating(p.averageScore!).color;
      const dot = `<circle cx="${x(i)}" cy="${y(p.averageScore!)}" r="${p.current ? 7 : 5}" fill="${color}" stroke="#fff" stroke-width="2"><title>${escapeHtml(formatDate(p.createdAt))}${p.label ? ` · ${escapeHtml(p.label)}` : ''}: ${p.averageScore}</title></circle>
<text class="val" x="${x(i)}" y="${y(p.averageScore!) - 12}" text-anchor="middle">${p.averageScore!.toFixed(1)}</text>
<text class="lbl" x="${x(i)}" y="${h - 10}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${escapeHtml(p.label ?? formatDate(p.createdAt, false))}</text>`;
      return p.href && !p.current ? `<a href="${escapeHtml(p.href)}">${dot}</a>` : dot;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(l('history'))}">${grid}<path d="${line}" fill="none" stroke="#2BA3A3" stroke-width="2.5"/>${dots}</svg>`;
}

function findingsByKey(pages: PageEntry[]): { finding: Finding; pages: string[] }[] {
  const map = new Map<string, { finding: Finding; pages: string[] }>();
  for (const p of pages) {
    if (p.status !== 'ok') continue;
    for (const f of p.findings ?? []) {
      const entry = map.get(f.key) ?? { finding: f, pages: [] };
      entry.pages.push(p.path);
      map.set(f.key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.pages.length - a.pages.length || b.finding.priority - a.finding.priority);
}

export function generateSiteHtml(input: SiteReportInput): string {
  const { snapshot, diff } = input;
  const siteHost = host(snapshot.origin);
  const okPages = snapshot.pages.filter((p) => p.status === 'ok');
  const failed = snapshot.pages.filter((p) => p.status === 'error');
  const avg = snapshot.summary.averageScore;
  const rating = getScoreRating(avg ?? 0);
  const cats = averageCategories(snapshot.pages);
  const groups = findingsByKey(snapshot.pages);
  const editorial = groups.filter((g) => g.finding.owner === 'editorial');
  const dev = groups.filter((g) => g.finding.owner === 'dev');
  const pageLink = (path: string) => {
    const href = input.pageHref?.(path);
    return href ? `<a href="${escapeHtml(href)}">${escapeHtml(path)}</a>` : escapeHtml(path);
  };
  const deltaByPath = new Map((diff?.pages ?? []).map((p) => [p.path, p.delta]));

  const kpis = [
    `<div class="kpi"><div class="v">${okPages.length}</div><div class="l">${escapeHtml(l('pagesAnalyzed'))}</div></div>`,
    `<div class="kpi"><div class="v">${editorial.length}</div><div class="l">${escapeHtml(l('findingsEditorial'))}</div></div>`,
    `<div class="kpi"><div class="v">${dev.length}</div><div class="l">${escapeHtml(l('findingsDev'))}</div></div>`,
  ];
  if (diff && diff.common.delta !== null) {
    const since = l('sinceRun', { date: diff.before.label ?? formatDate(diff.before.createdAt, false) });
    kpis.push(
      `<div class="kpi"><div class="v ${deltaClass(diff.common.delta)}">${signed1(diff.common.delta)}</div><div class="l">${escapeHtml(l('average'))} ${escapeHtml(since)}</div></div>`
    );
  }
  if (failed.length) {
    kpis.push(`<div class="kpi"><div class="v down">${failed.length}</div><div class="l">${escapeHtml(l('pagesFailed'))}</div></div>`);
  }

  const summary = `<section class="card summary">
  <div class="ring-wrap">${scoreRing(avg)}<span class="badge" style="background:${rating.color}">${escapeHtml(rating.label)}</span><span class="muted">${escapeHtml(l('average'))}</span></div>
  <div class="cats">${cats ? CATEGORY_ORDER.map((k) => categoryBar(t(`cat_${k}`), cats[k])).join('') : ''}</div>
  <div class="kpis">${kpis.join('')}</div>
</section>`;

  const history =
    input.history && input.history.filter((p) => p.averageScore !== null).length >= 2
      ? `<section class="card"><h2>${escapeHtml(l('history'))}</h2><p class="hint">${escapeHtml(l('average'))} · ${input.history.length} ${escapeHtml(l('runs'))}</p>${historyChart(input.history)}</section>`
      : '';

  let changes = '';
  if (diff) {
    const maxCount = Math.max(1, ...diff.findings.map((f) => Math.max(f.before, f.after)));
    const w = (n: number) => ((n / maxCount) * 100).toFixed(1);
    const changed = diff.findings.filter((f) => f.newOn.length || f.fixedOn.length);
    const pagesChanged = diff.pages.filter((p) => p.delta !== 0 || p.findingsNew.length || p.findingsFixed.length);
    changes = `<section class="card">
  <h2>${escapeHtml(l('sinceLast'))}</h2>
  <p class="hint">${escapeHtml(diff.before.label ? `${diff.before.label} · ` : '')}${escapeHtml(formatDate(diff.before.createdAt))} · ${diff.common.pages} ${escapeHtml(l('commonPages'))}${input.diffHref ? ` · <a href="${escapeHtml(input.diffHref)}">${escapeHtml(l('fullComparison'))}</a>` : ''}</p>
  ${diff.versionChanged ? `<p class="warn">${escapeHtml(l('versionChanged', { from: diff.before.version, to: diff.after.version }))}</p>` : ''}
  <div class="kpis" style="margin:14px 0">
    <div class="kpi"><div class="v up">${diff.totals.fixed}</div><div class="l">${escapeHtml(l('findings'))} ${escapeHtml(l('fixed'))}</div></div>
    <div class="kpi"><div class="v down">${diff.totals.new}</div><div class="l">${escapeHtml(l('findings'))} ${escapeHtml(l('new'))}</div></div>
    <div class="kpi"><div class="v">${diff.totals.pagesUp}</div><div class="l">${escapeHtml(l('pagesUp'))}</div></div>
    <div class="kpi"><div class="v">${diff.totals.pagesDown}</div><div class="l">${escapeHtml(l('pagesDown'))}</div></div>
  </div>
  ${
    changed.length
      ? `<div class="scroll"><table>
<tr><th>${escapeHtml(l('findings'))}</th><th class="num">${escapeHtml(l('before'))}</th><th class="num">${escapeHtml(l('after'))}</th><th class="num">${escapeHtml(l('change'))}</th><th></th></tr>
${changed
  .map(
    (f) => `<tr><td>${escapeHtml(f.text)}</td><td class="num">${f.before}</td><td class="num">${f.after}</td><td class="num ${deltaClass(f.before - f.after)}">${signed(f.after - f.before)}</td>
<td style="width:150px"><div class="bars"><span class="b-before" style="width:${w(f.before)}%"></span><span class="b-after ${deltaClass(f.before - f.after)}" style="width:${w(f.after)}%"></span></div></td></tr>`
  )
  .join('\n')}
</table></div>`
      : ''
  }
  ${
    pagesChanged.length
      ? `<div class="scroll" style="margin-top:14px"><table>
<tr><th>${escapeHtml(l('pageCol'))}</th><th class="num">${escapeHtml(l('before'))}</th><th class="num">${escapeHtml(l('after'))}</th><th class="num">${escapeHtml(l('change'))}</th><th>${escapeHtml(l('criteria'))}</th></tr>
${pagesChanged
  .map(
    (p) => `<tr><td class="path">${pageLink(p.path)}</td><td class="num">${p.before.toFixed(1)}</td><td class="num">${p.after.toFixed(1)}</td><td class="num ${deltaClass(p.delta)}">${signed1(p.delta)}</td>
<td>${p.regressed.map((id) => `<span class="chip down">${escapeHtml(t(id))}</span>`).join('')}${p.fixed.map((id) => `<span class="chip up">${escapeHtml(t(id))}</span>`).join('')}</td></tr>`
  )
  .join('\n')}
</table></div>`
      : `<p class="muted">${escapeHtml(l('noChanges'))}</p>`
  }
  ${diff.pagesAdded.length ? `<p class="muted" style="margin-top:10px">${escapeHtml(l('pagesAdded'))}: ${diff.pagesAdded.map(pageLink).join(', ')}</p>` : ''}
  ${diff.pagesRemoved.length ? `<p class="muted">${escapeHtml(l('pagesRemoved'))}: ${diff.pagesRemoved.map(escapeHtml).join(', ')}</p>` : ''}
</section>`;
  }

  const recItem = ({ finding, pages }: (typeof groups)[number]) => `<div class="rec">
    <div class="rec-meta"><span>${escapeHtml(t(`effort_${finding.effort}`))}</span><span>${escapeHtml(l('ofPages', { n: pages.length, total: okPages.length }))}</span></div>
    <div class="rec-text">${escapeHtml(finding.text)}</div>
    <details><summary>${escapeHtml(l('showPages'))}</summary><ul>${pages.map((p) => `<li>${pageLink(p)}</li>`).join('')}</ul></details>
  </div>`;
  const recGroup = (owner: 'editorial' | 'dev', list: typeof groups) =>
    list.length
      ? `<div class="recs-group">
  <h3>${escapeHtml(t(`report_recs_${owner}`))} <span class="count">${list.length}</span></h3>
  <p class="group-hint">${escapeHtml(t(`report_recs_${owner}_hint`))}</p>
  ${list.slice(0, VISIBLE).map(recItem).join('\n')}
  ${
    list.length > VISIBLE
      ? `<details class="more"><summary>${escapeHtml(t('ui_moreRecommendations', { count: list.length - VISIBLE }))}</summary>${list.slice(VISIBLE).map(recItem).join('\n')}</details>`
      : ''
  }
</div>`
      : '';

  const recs = groups.length
    ? `<section class="card"><h2>${escapeHtml(l('recommendations'))}</h2><p class="hint">${escapeHtml(l('findingsCol'))}: ${groups.length}</p>${recGroup('editorial', editorial)}${recGroup('dev', dev)}</section>`
    : '';

  const rows = [...okPages]
    .sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0) || a.path.localeCompare(b.path))
    .map((p) => {
      const score = p.totalScore ?? 0;
      const r = getScoreRating(score);
      const delta = deltaByPath.get(p.path);
      return `<tr><td class="path">${pageLink(p.path)}</td>
<td class="num"><strong>${score.toFixed(1)}</strong></td><td style="width:140px">${scoreBar(score)}</td>
<td><span class="chip" style="background:${r.color}22;color:#0f172a">${escapeHtml(r.label)}</span></td>
<td class="num ${delta === undefined ? 'flat' : deltaClass(delta)}">${delta === undefined ? '' : signed1(delta)}</td>
<td class="num">${(p.findings ?? []).length}</td></tr>`;
    })
    .join('\n');
  const failedRows = failed
    .map((p) => `<tr><td class="path">${escapeHtml(p.path)}</td><td colspan="5" class="down">${escapeHtml(p.error ?? '')}</td></tr>`)
    .join('\n');
  const pagesCard = `<section class="card"><h2>${escapeHtml(l('pagesTitle'))}</h2>
<div class="scroll"><table>
<tr><th>${escapeHtml(l('pageCol'))}</th><th class="num">${escapeHtml(l('score'))}</th><th></th><th>${escapeHtml(l('ratingCol'))}</th><th class="num">${escapeHtml(l('change'))}</th><th class="num">${escapeHtml(l('findingsCol'))}</th></tr>
${rows}
${failedRows}
</table></div></section>`;

  const meta = [
    `<strong>${escapeHtml(siteHost)}</strong>`,
    `${escapeHtml(formatDate(snapshot.createdAt))}${snapshot.label ? ` · ${escapeHtml(snapshot.label)}` : ''} · ${okPages.length} ${escapeHtml(l('pagesAnalyzed'))}`,
  ];

  return page({
    lang: getLang(),
    title: `${l('siteReport')} · ${siteHost}`,
    body: `${hero({ sub: l('siteReportSub'), title: l('siteReport'), lines: meta, nav: input.nav })}
<main class="container">
${summary}
${history}
${changes}
${recs}
${pagesCard}
${input.extra ?? ''}
<p class="footer">${escapeHtml(l('footer', { version: snapshot.tool.version }))}</p>
</main>`,
  });
}
