// Comparison of two snapshots. Pages are matched by path, not URL, so the
// same comparison covers "last month against today" and "staging against
// production". Only pages analyzed in both runs count towards changes; pages
// that appeared, disappeared or failed are listed apart so they never move
// an average.
import { diffChecks } from '../src/utils/trend';
import type { Finding, PageEntry, Snapshot } from './snapshot';
import { round1 } from './snapshot';

export interface RunInfo {
  createdAt: string;
  label?: string;
  version: string;
  origin: string;
  analyzed: number;
  averageScore: number | null;
}

export interface FindingChange {
  key: string;
  text: string;
  owner: Finding['owner'];
  effort: Finding['effort'];
  priority: number;
  // Pages with this finding, among the pages analyzed in both runs
  before: number;
  after: number;
  fixedOn: string[];
  newOn: string[];
}

export interface PageChange {
  path: string;
  before: number;
  after: number;
  delta: number;
  // Criterion ids
  fixed: string[];
  regressed: string[];
  // Recommendation keys
  findingsFixed: string[];
  findingsNew: string[];
}

export interface SnapshotDiff {
  before: RunInfo;
  after: RunInfo;
  // A different analyzer version can change findings without any change on
  // the site; the report says so instead of blaming the site
  versionChanged: boolean;
  // Criteria checked now that the earlier version did not check at all
  newCriteria: string[];
  common: { pages: number; before: number | null; after: number | null; delta: number | null };
  pagesAdded: string[];
  pagesRemoved: string[];
  pagesFailed: { path: string; before?: string; after?: string }[];
  findings: FindingChange[];
  pages: PageChange[];
  totals: { fixed: number; new: number; pagesUp: number; pagesDown: number };
}

const runInfo = (s: Snapshot): RunInfo => ({
  createdAt: s.createdAt,
  ...(s.label ? { label: s.label } : {}),
  version: s.tool.version,
  origin: s.origin,
  analyzed: s.summary.analyzed,
  averageScore: s.summary.averageScore,
});

const byPath = (s: Snapshot) => new Map(s.pages.map((p) => [p.path, p]));
const average = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const a = byPath(before);
  const b = byPath(after);

  const pagesAdded = [...b.keys()].filter((p) => !a.has(p));
  const pagesRemoved = [...a.keys()].filter((p) => !b.has(p));
  const pagesFailed: SnapshotDiff['pagesFailed'] = [];
  const common: [PageEntry, PageEntry][] = [];
  for (const [path, pb] of b) {
    const pa = a.get(path);
    if (!pa) continue;
    if (pa.status === 'ok' && pb.status === 'ok') common.push([pa, pb]);
    else pagesFailed.push({ path, ...(pa.error ? { before: pa.error } : {}), ...(pb.error ? { after: pb.error } : {}) });
  }

  const criteriaBefore = new Set(before.pages.flatMap((p) => Object.keys(p.checks ?? {})));
  const newCriteria = [...new Set(after.pages.flatMap((p) => Object.keys(p.checks ?? {})))]
    .filter((c) => !criteriaBefore.has(c))
    .sort();

  const findingChanges = new Map<string, FindingChange>();
  const changeFor = (f: Finding): FindingChange => {
    let change = findingChanges.get(f.key);
    if (!change) {
      change = { key: f.key, text: f.text, owner: f.owner, effort: f.effort, priority: f.priority, before: 0, after: 0, fixedOn: [], newOn: [] };
      findingChanges.set(f.key, change);
    }
    return change;
  };

  const pages: PageChange[] = [];
  for (const [pa, pb] of common) {
    const fa = new Map((pa.findings ?? []).map((f) => [f.key, f]));
    const fb = new Map((pb.findings ?? []).map((f) => [f.key, f]));
    const findingsFixed: string[] = [];
    const findingsNew: string[] = [];
    for (const [key, f] of fa) {
      const change = changeFor(fb.get(key) ?? f);
      change.before++;
      if (!fb.has(key)) {
        change.fixedOn.push(pa.path);
        findingsFixed.push(key);
      }
    }
    for (const [key, f] of fb) {
      const change = changeFor(f);
      change.after++;
      if (!fa.has(key)) {
        change.newOn.push(pb.path);
        findingsNew.push(key);
      }
    }
    const { fixed, regressed } = diffChecks(pa.checks ?? {}, pb.checks ?? {});
    const before = pa.totalScore ?? 0;
    const after = pb.totalScore ?? 0;
    pages.push({ path: pa.path, before, after, delta: round1(after - before), fixed, regressed, findingsFixed, findingsNew });
  }

  // Worst first: the pages and findings that need attention lead the report
  pages.sort((x, y) => x.delta - y.delta || x.path.localeCompare(y.path));
  const findings = [...findingChanges.values()].sort(
    (x, y) => y.after - y.before - (x.after - x.before) || y.priority - x.priority || x.key.localeCompare(y.key)
  );

  const commonBefore = average(common.map(([pa]) => pa.totalScore ?? 0));
  const commonAfter = average(common.map(([, pb]) => pb.totalScore ?? 0));

  return {
    before: runInfo(before),
    after: runInfo(after),
    versionChanged: before.tool.version !== after.tool.version,
    newCriteria,
    common: {
      pages: common.length,
      before: commonBefore,
      after: commonAfter,
      delta: commonBefore !== null && commonAfter !== null ? round1(commonAfter - commonBefore) : null,
    },
    pagesAdded,
    pagesRemoved,
    pagesFailed,
    findings,
    pages,
    totals: {
      fixed: pages.reduce((n, p) => n + p.findingsFixed.length, 0),
      new: pages.reduce((n, p) => n + p.findingsNew.length, 0),
      pagesUp: pages.filter((p) => p.delta > 0).length,
      pagesDown: pages.filter((p) => p.delta < 0).length,
    },
  };
}

/** Something got worse on a page analyzed in both runs (for --fail-on-regression). */
export function hasRegression(diff: SnapshotDiff): boolean {
  return diff.pages.some((p) => p.delta < 0 || p.findingsNew.length > 0 || p.regressed.length > 0);
}
