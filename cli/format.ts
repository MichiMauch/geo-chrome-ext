// Text and Markdown output of the CLI. Terminal colors only when stdout is a
// TTY, so piping into a file or an agent gets plain text.
import type { GEOAnalysisResult } from '../src/types/analysis';
import { t } from '../src/utils/i18n';
import { generateRecommendation, recommendationMeta } from '../src/utils/recommendations';
import type { Snapshot } from './snapshot';
import type { SnapshotDiff } from './diff';
import type { TicketPlan } from './tickets';
import { l } from './labels';

const useColor = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = paint('1');
export const dim = paint('2');
export const green = paint('32');
export const red = paint('31');
export const yellow = paint('33');

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const colorDelta = (n: number, s = signed(n)) => (n > 0 ? green(s) : n < 0 ? red(s) : dim(s));
const fmtScore = (n: number | null) => (n === null ? '–' : n.toFixed(1));

/** One page in full: categories with every criterion, then the findings. */
export function formatResult(result: GEOAnalysisResult): string {
  const out: string[] = [];
  out.push(`${bold(result.url)}`);
  out.push(`${l('score')}: ${bold(`${result.totalScore.toFixed(1)}/30`)} · ${result.rating.label}${result.pageType ? ` · ${result.pageType}` : ''}`);
  for (const category of Object.values(result.categories)) {
    out.push('', `${bold(category.nameKey)}  ${category.score.toFixed(1)}/5`);
    for (const d of category.details) {
      if (d.weight === 0) continue;
      const met = d.found && (!d.progress || d.progress.current >= d.progress.target);
      const value = d.value !== undefined && d.value !== '' ? dim(` (${d.value})`) : '';
      out.push(`  ${met ? green('✓') : red('✗')} ${d.criterionKey}${value}`);
      if (!met && d.fixText) out.push(`    ${dim(`${l('fix')}: ${d.fixText}`)}`);
    }
  }
  if (result.topRecommendations.length) {
    out.push('', bold(l('findings')));
    result.topRecommendations.forEach((key, i) => {
      const meta = recommendationMeta(key);
      const tag = meta ? dim(` [${l(`owner_${meta.owner}`)} · ${l(`effort_${meta.effort}`)}]`) : '';
      out.push(`  ${i + 1}. ${generateRecommendation(key) ?? key}${tag}`);
    });
  }
  return out.join('\n');
}

/** A run over several pages: one line per page, then findings by frequency. */
export function formatRun(snapshot: Snapshot): string {
  const out: string[] = [];
  const failed = snapshot.pages.filter((p) => p.status === 'error');
  out.push(bold(snapshot.origin || snapshot.pages[0]?.url || ''));
  out.push(
    `${l('average')}: ${bold(`${fmtScore(snapshot.summary.averageScore)}/30`)} · ${snapshot.summary.analyzed} ${l('pages')} ${l('analyzed')}` +
      (failed.length ? red(` · ${failed.length} ${l('failed')}`) : '')
  );
  out.push('');
  const ok = snapshot.pages.filter((p) => p.status === 'ok').sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0));
  for (const p of ok) out.push(`  ${(p.totalScore ?? 0).toFixed(1).padStart(4)}  ${p.path}`);
  for (const p of failed) out.push(`  ${red('  ✗ ')}  ${p.path} ${dim(p.error ?? '')}`);

  const counts = new Map<string, { text: string; owner: string; n: number }>();
  for (const p of ok) for (const f of p.findings ?? []) {
    const c = counts.get(f.key) ?? { text: f.text, owner: f.owner, n: 0 };
    c.n++;
    counts.set(f.key, c);
  }
  if (counts.size) {
    out.push('', bold(l('findings')));
    for (const c of [...counts.values()].sort((a, b) => b.n - a.n)) {
      out.push(`  ${String(c.n).padStart(3)}× ${c.text} ${dim(`[${l(`owner_${c.owner as 'dev'}`)}]`)}`);
    }
  }
  return out.join('\n');
}

const runName = (r: SnapshotDiff['before']) => `${r.label ? `${r.label}, ` : ''}${r.createdAt.slice(0, 16).replace('T', ' ')}`;
const criterionName = (id: string) => t(id);

export function formatDiff(diff: SnapshotDiff): string {
  const out: string[] = [];
  out.push(bold(`${l('comparison')}: ${runName(diff.before)} → ${runName(diff.after)}`));
  if (diff.before.origin !== diff.after.origin) out.push(dim(`${diff.before.origin} → ${diff.after.origin}`));
  if (diff.versionChanged) out.push(yellow(l('versionChanged', { from: diff.before.version, to: diff.after.version })));
  const c = diff.common;
  out.push(
    `${l('commonPages')}: ${c.pages} · ${l('average')} ${fmtScore(c.before)} → ${bold(fmtScore(c.after))}` +
      (c.delta !== null ? ` (${colorDelta(c.delta)})` : '')
  );
  out.push(
    `${green(`${diff.totals.fixed} ${l('fixed')}`)} · ${red(`${diff.totals.new} ${l('new')}`)} · ` +
      `${l('pagesUp')}: ${diff.totals.pagesUp} · ${l('pagesDown')}: ${diff.totals.pagesDown}`
  );

  const changed = diff.findings.filter((f) => f.newOn.length || f.fixedOn.length);
  if (changed.length) {
    out.push('', bold(l('byFinding')));
    for (const f of changed) {
      out.push(`  ${String(f.before).padStart(3)} → ${String(f.after).padEnd(3)} ${colorDelta(f.after - f.before).padEnd(4)} ${f.text}`);
    }
  }
  const pages = diff.pages.filter((p) => p.delta !== 0 || p.findingsNew.length || p.findingsFixed.length);
  if (pages.length) {
    out.push('', bold(l('byPage')));
    for (const p of pages) {
      out.push(`  ${p.before.toFixed(1)} → ${p.after.toFixed(1)} ${colorDelta(p.delta)}  ${p.path}`);
      if (p.regressed.length) out.push(`      ${red('✗')} ${p.regressed.map(criterionName).join(', ')}`);
      if (p.fixed.length) out.push(`      ${green('✓')} ${p.fixed.map(criterionName).join(', ')}`);
    }
  } else {
    out.push('', dim(l('noChanges')));
  }
  if (diff.newCriteria.length) out.push('', `${l('newCriteria')}: ${diff.newCriteria.map(criterionName).join(', ')}`);
  if (diff.pagesAdded.length) out.push('', `${l('pagesAdded')} (${diff.pagesAdded.length}): ${diff.pagesAdded.join(', ')}`);
  if (diff.pagesRemoved.length) out.push('', `${l('pagesRemoved')} (${diff.pagesRemoved.length}): ${diff.pagesRemoved.join(', ')}`);
  if (diff.pagesFailed.length) out.push('', `${l('pagesFailed')}: ${diff.pagesFailed.map((p) => p.path).join(', ')}`);
  return out.join('\n');
}

const mdDelta = (n: number | null) => (n === null ? '–' : signed(n));

export function diffMarkdown(diff: SnapshotDiff): string {
  const out: string[] = [];
  out.push(`# ${l('comparison')}: ${runName(diff.before)} → ${runName(diff.after)}`, '');
  if (diff.before.origin !== diff.after.origin) out.push(`${diff.before.origin} → ${diff.after.origin}`, '');
  if (diff.versionChanged) out.push(`> ${l('versionChanged', { from: diff.before.version, to: diff.after.version })}`, '');
  const c = diff.common;
  out.push(`| | ${l('before')} | ${l('after')} | ${l('change')} |`, '|---|---:|---:|---:|');
  out.push(`| ${l('average')} (${c.pages} ${l('pages')}) | ${fmtScore(c.before)} | ${fmtScore(c.after)} | ${mdDelta(c.delta)} |`);
  out.push('');
  out.push(
    `${diff.totals.fixed} ${l('fixed')} · ${diff.totals.new} ${l('new')} · ${l('pagesUp')}: ${diff.totals.pagesUp} · ${l('pagesDown')}: ${diff.totals.pagesDown}`,
    ''
  );
  const changed = diff.findings.filter((f) => f.newOn.length || f.fixedOn.length);
  if (changed.length) {
    out.push(`## ${l('byFinding')}`, '', `| ${l('findings')} | ${l('before')} | ${l('after')} | ${l('change')} |`, '|---|---:|---:|---:|');
    for (const f of changed) out.push(`| ${f.text} ${owner(f.owner)} | ${f.before} | ${f.after} | ${signed(f.after - f.before)} |`);
    out.push('');
  }
  const pages = diff.pages.filter((p) => p.delta !== 0 || p.findingsNew.length || p.findingsFixed.length);
  out.push(`## ${l('byPage')}`, '');
  if (pages.length) {
    out.push(`| | ${l('before')} | ${l('after')} | ${l('change')} | ${l('criteriaRegressed')} | ${l('criteriaFixed')} |`, '|---|---:|---:|---:|---|---|');
    for (const p of pages) {
      out.push(
        `| ${p.path} | ${p.before.toFixed(1)} | ${p.after.toFixed(1)} | ${signed(p.delta)} | ${p.regressed.map(criterionName).join(', ')} | ${p.fixed.map(criterionName).join(', ')} |`
      );
    }
  } else {
    out.push(l('noChanges'));
  }
  out.push('');
  if (diff.newCriteria.length) out.push(`## ${l('newCriteria')}`, '', diff.newCriteria.map((id) => `- ${criterionName(id)}`).join('\n'), '');
  for (const [label, list] of [
    [l('pagesAdded'), diff.pagesAdded],
    [l('pagesRemoved'), diff.pagesRemoved],
    [l('pagesFailed'), diff.pagesFailed.map((p) => `${p.path} (${p.after ?? p.before ?? ''})`)],
  ] as const) {
    if (list.length) out.push(`## ${label} (${list.length})`, '', list.map((p) => `- ${p}`).join('\n'), '');
  }
  return out.join('\n');
}

const owner = (o: 'editorial' | 'dev') => `_(${l(`owner_${o}`)})_`;

export function ticketPlanMarkdown(plan: TicketPlan): string {
  const out: string[] = [`# ${plan.site}: ${plan.tickets.length} Tickets`, ''];
  for (const tk of plan.tickets) {
    const pages = tk.state === 'open' ? (tk.pages.length === 1 ? l('onPage') : l('onPages', { n: tk.pages.length })) : l('fixed');
    out.push(`- **${tk.title}** · ${l(`owner_${tk.owner}`)} · ${pages} · \`${tk.marker}\``);
  }
  return out.join('\n');
}
