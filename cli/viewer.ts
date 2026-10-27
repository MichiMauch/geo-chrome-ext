// Static viewer over the run history (geo viewer): one HTML site with every
// site, every run, every page report and the comparisons, linked relatively so
// it works from any folder — e.g. a Kraftwerk vibeable, which serves a folder
// without a server.
//
//   <history>/<host>/<run>/snapshot.json (+ results.json)
//   → <out>/index.html                         all sites
//     <out>/<host>/index.html                  forwards to the latest run
//     <out>/<host>/<run>/index.html            site report of the run
//     <out>/<host>/<run>/pages/<page>.html     extension report of one page
//     <out>/<host>/<run>/vergleich-<run>.html  comparison with an earlier run
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GEOAnalysisResult, TrendInfo } from '../src/types/analysis';
import { diffChecks } from '../src/utils/trend';
import { setLang, getLang } from '../src/utils/i18n';
import { getScoreRating } from '../src/utils/scoring';
import { parseSnapshot, pathOf, type Snapshot } from './snapshot';
import { diffSnapshots } from './diff';
import { generateDiffHtml } from './diff-html';
import { generateSiteHtml, type HistoryPoint } from './site-html';
import { deltaClass, escapeHtml, formatDate, hero, page, scoreRing } from './html-base';
import { l } from './labels';

export interface Run {
  id: string;
  dir: string;
  snapshot: Snapshot;
}

/** File name of a page report: readable, short, collision-free. */
export function pageFile(path: string): string {
  if (path === '/') return 'start.html';
  const readable = path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');
  const hash = createHash('sha1').update(path).digest('hex').slice(0, 6);
  return `${readable || 'seite'}-${hash}.html`;
}

// One page checked on its own, or a site run over several pages
const kindOf = (s: Snapshot): 'page' | 'site' => (s.pages.length === 1 ? 'page' : 'site');

/** Change of one page since the latest earlier run that analyzed it. */
export function changesSince(path: string, run: Run, earlier: Run[]): TrendInfo | undefined {
  const now = run.snapshot.pages.find((p) => p.path === path && p.status === 'ok');
  if (!now) return undefined;
  for (const r of [...earlier].reverse()) {
    const before = r.snapshot.pages.find((p) => p.path === path && p.status === 'ok');
    if (!before) continue;
    const delta = Math.round(((now.totalScore ?? 0) - (before.totalScore ?? 0)) * 10) / 10;
    return {
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      delta: Math.abs(delta),
      previousScore: before.totalScore ?? 0,
      previousTimestamp: r.snapshot.createdAt,
      ...diffChecks(before.checks ?? {}, now.checks ?? {}),
    };
  }
  return undefined;
}

const signed1 = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

function runsOf(hostDir: string): Run[] {
  const runs: Run[] = [];
  for (const id of readdirSync(hostDir)) {
    const file = join(hostDir, id, 'snapshot.json');
    if (!existsSync(file)) continue;
    try {
      runs.push({ id, dir: join(hostDir, id), snapshot: parseSnapshot(readFileSync(file, 'utf8'), file) });
    } catch {
      // a broken snapshot does not take the viewer down
    }
  }
  return runs.sort((a, b) => a.snapshot.createdAt.localeCompare(b.snapshot.createdAt));
}

const nav = (items: { label: string; href?: string }[]) =>
  items
    .map((i) => (i.href ? `<a href="${escapeHtml(i.href)}">${escapeHtml(i.label)}</a>` : `<strong>${escapeHtml(i.label)}</strong>`))
    .join('<span>›</span>');

const runName = (s: Snapshot) => s.label ?? formatDate(s.createdAt, false);

function runsCard(runs: Run[], current: Run): string {
  const rows = [...runs]
    .reverse()
    .map((r) => {
      const s = r.snapshot;
      const isCurrent = r.id === current.id;
      const single = r.snapshot.pages.length === 1 ? ` <span class="chip neutral">${escapeHtml(r.snapshot.pages[0].path)}</span>` : '';
      const earlier = s.createdAt < current.snapshot.createdAt;
      return `<tr${isCurrent ? ' style="background:rgba(51,204,204,0.08)"' : ''}>
<td>${escapeHtml(formatDate(s.createdAt))}</td><td>${escapeHtml(s.label ?? '')}${single}</td>
<td class="num"><strong>${s.summary.averageScore?.toFixed(1) ?? '–'}</strong></td><td class="num">${s.summary.analyzed}</td>
<td>${isCurrent ? `<span class="muted">${escapeHtml(l('shown'))}</span>` : `<a href="../${encodeURIComponent(r.id)}/index.html">${escapeHtml(l('openReport'))}</a>`}</td>
<td>${earlier ? `<a href="vergleich-${encodeURIComponent(r.id)}.html">${escapeHtml(l('compare'))}</a>` : ''}</td></tr>`;
    })
    .join('\n');
  return `<section class="card"><h2>${escapeHtml(l('runs'))}</h2><p class="hint">${escapeHtml(l('compareWith'))}: ${escapeHtml(runName(current.snapshot))}</p>
<div class="scroll"><table>
<tr><th>${escapeHtml(l('date'))}</th><th>${escapeHtml(l('label'))}</th><th class="num">${escapeHtml(l('average'))}</th><th class="num">${escapeHtml(l('pagesTitle'))}</th><th></th><th></th></tr>
${rows}
</table></div></section>`;
}

function write(file: string, html: string, stats: { written: number }): void {
  writeFileSync(file, html);
  stats.written++;
}

function sitesOverview(sites: { host: string; runs: Run[] }[]): string {
  const cards = sites
    .map(({ host, runs: all }) => {
      // The card shows the site, so site runs win over single-page checks
      const siteRuns = all.filter((r) => kindOf(r.snapshot) === 'site');
      const runs = siteRuns.length ? siteRuns : all;
      const last = runs[runs.length - 1].snapshot;
      const prev = runs.length > 1 ? runs[runs.length - 2].snapshot : undefined;
      const avg = last.summary.averageScore;
      const delta = prev && avg !== null && prev.summary.averageScore !== null ? avg - prev.summary.averageScore : null;
      const rating = getScoreRating(avg ?? 0);
      return `<a class="card site" href="${encodeURIComponent(host)}/index.html">
  ${scoreRing(avg, 30, 110)}
  <div><h2>${escapeHtml(host)}</h2>
  <p><span class="badge" style="background:${rating.color}">${escapeHtml(rating.label)}</span>${delta !== null ? ` <strong class="${deltaClass(delta)}">${signed1(Math.round(delta * 10) / 10)}</strong>` : ''}</p>
  <p class="muted">${escapeHtml(l('lastRun'))}: ${escapeHtml(formatDate(last.createdAt))}${last.label ? ` · ${escapeHtml(last.label)}` : ''}<br>${last.summary.analyzed} ${escapeHtml(l('pagesAnalyzed'))} · ${all.length} ${escapeHtml(l('runs'))}</p></div>
</a>`;
    })
    .join('\n');
  return page({
    lang: getLang(),
    title: `GEO · ${l('sites')}`,
    extraCss: `.sites{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.site{display:flex;gap:18px;align-items:center;text-decoration:none;color:inherit;transition:box-shadow .15s}
.site:hover{box-shadow:0 8px 24px rgba(15,23,42,.10)}.site h2{margin-bottom:8px}.site p+p{margin-top:8px;font-size:13px}
.site .ring-value{font-size:24px}`,
    body: `${hero({ sub: l('siteReportSub'), title: 'GEO', lines: [`${sites.length} ${escapeHtml(l('sites'))}`] })}
<main class="container">${sites.length ? `<div class="sites">${cards}</div>` : `<section class="card"><p class="muted">${escapeHtml(l('noRuns'))}</p></section>`}</main>`,
  });
}

export interface ViewerStats {
  sites: number;
  runs: number;
  written: number;
}

/**
 * Renders the viewer. Site reports and overviews are always rewritten (they
 * show the history, which grows); page reports and comparisons only when
 * missing, since a past run never changes.
 */
export function buildViewer(
  historyDir: string,
  outDir: string,
  renderPage: (result: GEOAnalysisResult, navHtml: string) => string,
  options: { force?: boolean } = {}
): ViewerStats {
  const stats = { sites: 0, runs: 0, written: 0 };
  const lastPage = new Map<string, string>();
  mkdirSync(outDir, { recursive: true });
  const hosts = existsSync(historyDir)
    ? readdirSync(historyDir).filter((h) => statSync(join(historyDir, h)).isDirectory())
    : [];
  const sites: { host: string; runs: Run[] }[] = [];

  for (const host of hosts.sort()) {
    const runs = runsOf(join(historyDir, host));
    if (!runs.length) continue;
    sites.push({ host, runs });
    stats.sites++;
    const hostOut = join(outDir, host);
    mkdirSync(hostOut, { recursive: true });
    const siteRuns = runs.filter((r) => kindOf(r.snapshot) === 'site');
    const latest = (siteRuns.length ? siteRuns : runs)[(siteRuns.length ? siteRuns : runs).length - 1];
    write(
      join(hostOut, 'index.html'),
      `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${encodeURIComponent(latest.id)}/index.html"><a href="${encodeURIComponent(latest.id)}/index.html">${escapeHtml(host)}</a>`,
      stats
    );

    runs.forEach((run, i) => {
      stats.runs++;
      setLang(run.snapshot.lang);
      const runOut = join(hostOut, run.id);
      mkdirSync(join(runOut, 'pages'), { recursive: true });
      // A single-page check and a site run are different things: each one
      // compares and charts only against runs of its own kind
      const kind = kindOf(run.snapshot);
      const sameKind = runs.filter((r) => kindOf(r.snapshot) === kind);
      const earlierRuns = runs.slice(0, i);
      const previous =
        kind === 'site'
          ? [...earlierRuns].reverse().find((r) => kindOf(r.snapshot) === 'site')
          : [...earlierRuns].reverse().find((r) => r.snapshot.pages.some((p) => p.status === 'ok' && run.snapshot.pages.some((q) => q.path === p.path)));
      const history: HistoryPoint[] = sameKind.map((r) => ({
        createdAt: r.snapshot.createdAt,
        ...(r.snapshot.label ? { label: r.snapshot.label } : {}),
        averageScore: r.snapshot.summary.averageScore,
        analyzed: r.snapshot.summary.analyzed,
        href: `../${encodeURIComponent(r.id)}/index.html`,
        current: r.id === run.id,
      }));
      const okPaths = new Set(run.snapshot.pages.filter((p) => p.status === 'ok').map((p) => p.path));

      // Page reports exist only where the run kept its full results
      const resultsFile = join(run.dir, 'results.json');
      let results: GEOAnalysisResult[] = [];
      if (existsSync(resultsFile)) {
        try {
          results = JSON.parse(readFileSync(resultsFile, 'utf8'));
        } catch {
          results = [];
        }
      }
      const withReport = new Set(results.map((r) => pathOf(r.url)));
      const pageHref = (path: string) => (withReport.has(path) && okPaths.has(path) ? `pages/${pageFile(path)}` : undefined);

      write(
        join(runOut, 'index.html'),
        generateSiteHtml({
          snapshot: run.snapshot,
          diff: previous ? diffSnapshots(previous.snapshot, run.snapshot) : undefined,
          history,
          pageHref,
          diffHref: previous ? `vergleich-${encodeURIComponent(previous.id)}.html` : undefined,
          nav: nav([{ label: l('sites'), href: '../../index.html' }, { label: host }, { label: runName(run.snapshot) }]),
          extra: runs.length > 1 ? runsCard(runs, run) : undefined,
        }),
        stats
      );

      for (const result of results) {
        const path = pathOf(result.url);
        const file = join(runOut, 'pages', pageFile(path));
        if (existsSync(file) && !options.force) continue;
        // "Since the last check" in the page report, as the extension shows it
        const changes = changesSince(path, run, earlierRuns);
        if (changes) result.changes = changes;
        const crumbs = nav([
          { label: l('sites'), href: '../../../index.html' },
          { label: `${host} · ${runName(run.snapshot)}`, href: '../index.html' },
          { label: pathOf(result.url) },
        ]);
        write(file, renderPage(result, crumbs), stats);
      }
      if (kind === 'page' && results.length === 1) lastPage.set(run.id, `pages/${pageFile(pathOf(results[0].url))}`);

      for (const earlier of runs.slice(0, i)) {
        const file = join(runOut, `vergleich-${earlier.id}.html`);
        if (existsSync(file) && !options.force) continue;
        write(
          file,
          generateDiffHtml(diffSnapshots(earlier.snapshot, run.snapshot), {
            nav: nav([
              { label: l('sites'), href: '../../index.html' },
              { label: `${host} · ${runName(run.snapshot)}`, href: 'index.html' },
              { label: `${l('comparison')}: ${runName(earlier.snapshot)}` },
            ]),
            pageHref,
          }),
          stats
        );
      }
    });
  }

  setLang(sites[0]?.runs[0]?.snapshot.lang ?? 'de');
  write(join(outDir, 'index.html'), sitesOverview(sites), stats);

  // latest.html: the most recent check of all sites, a page check straight
  // to its page report. The Kraftwerk app opens here.
  const newest = sites
    .map(({ host, runs }) => ({ host, run: runs[runs.length - 1] }))
    .sort((a, b) => b.run.snapshot.createdAt.localeCompare(a.run.snapshot.createdAt))[0];
  const target = newest
    ? `${encodeURIComponent(newest.host)}/${encodeURIComponent(newest.run.id)}/${lastPage.get(newest.run.id) ?? 'index.html'}`
    : 'index.html';
  write(
    join(outDir, 'latest.html'),
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${escapeHtml(target)}"><a href="${escapeHtml(target)}">GEO</a>`,
    stats
  );
  return stats;
}
