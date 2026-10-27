// The snapshot is what a run leaves behind: every page with its scores, the
// criteria it meets and the findings it fires, plus the analyzer version that
// produced it. Comparisons (geo diff) and ticket plans (geo tickets) only ever
// read snapshots, so this format is the contract between CLI, CI and the
// Kraftwerk workflow. Change it only by bumping SNAPSHOT_FORMAT.
import type { GEOAnalysisResult } from '../src/types/analysis';
import { recommendationMeta, getRecommendationPriority, generateRecommendation } from '../src/utils/recommendations';
import type { RecommendationEffort, RecommendationOwner } from '../src/utils/recommendations';
import { criterionChecks } from '../src/utils/trend';
import type { Lang } from '../src/utils/i18n';

export const SNAPSHOT_FORMAT = 'geo-snapshot/1';

export type CategoryKey = keyof GEOAnalysisResult['categories'];

export interface Finding {
  // Recommendation key, e.g. 'no_author' — stable across languages and runs
  key: string;
  // geo:<key>:<path> — the same finding on the same page in any run, on any host
  fingerprint: string;
  owner: RecommendationOwner;
  effort: RecommendationEffort;
  priority: number;
  // In the snapshot's language at analysis time
  text: string;
}

export interface PageEntry {
  url: string;
  path: string;
  status: 'ok' | 'error';
  error?: string;
  httpStatus?: number;
  totalScore?: number;
  pageType?: string;
  categories?: Record<CategoryKey, number>;
  // Criterion id → met; not-applicable criteria are left out
  checks?: Record<string, boolean>;
  findings?: Finding[];
}

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  tool: { name: 'geo-analyzer'; version: string };
  createdAt: string;
  label?: string;
  lang: Lang;
  // Origin of the first page; pages are matched across runs by path, so a
  // staging snapshot compares against a production one
  origin: string;
  source: 'urls' | 'sitemap' | 'file';
  pages: PageEntry[];
  summary: {
    pages: number;
    analyzed: number;
    averageScore: number | null;
  };
}

/** Path plus query, without a trailing slash (except the root). */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '/';
    return path + u.search;
  } catch {
    return url;
  }
}

export const fingerprintOf = (key: string, path: string): string => `geo:${key}:${path}`;

export function findingsOf(result: GEOAnalysisResult): Finding[] {
  const path = pathOf(result.url);
  return result.topRecommendations.map((key) => {
    const meta = recommendationMeta(key);
    return {
      key,
      fingerprint: fingerprintOf(key, path),
      owner: meta?.owner ?? 'dev',
      effort: meta?.effort ?? 'medium',
      priority: getRecommendationPriority(key),
      text: generateRecommendation(key) ?? key,
    };
  });
}

export function pageEntryOf(result: GEOAnalysisResult): PageEntry {
  const categories = Object.fromEntries(
    Object.entries(result.categories).map(([k, c]) => [k, round1(c.score)])
  ) as Record<CategoryKey, number>;
  return {
    url: result.url,
    path: pathOf(result.url),
    status: 'ok',
    totalScore: round1(result.totalScore),
    pageType: result.pageType,
    categories,
    checks: criterionChecks(result),
    findings: findingsOf(result),
  };
}

export function errorEntryOf(url: string, error: string, httpStatus?: number): PageEntry {
  return { url, path: pathOf(url), status: 'error', error, ...(httpStatus ? { httpStatus } : {}) };
}

export function buildSnapshot(input: {
  version: string;
  lang: Lang;
  source: Snapshot['source'];
  pages: PageEntry[];
  label?: string;
  createdAt?: string;
}): Snapshot {
  const scores = input.pages.filter((p) => p.status === 'ok').map((p) => p.totalScore ?? 0);
  return {
    format: SNAPSHOT_FORMAT,
    tool: { name: 'geo-analyzer', version: input.version },
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.label ? { label: input.label } : {}),
    lang: input.lang,
    origin: originOf(input.pages[0]?.url),
    source: input.source,
    pages: input.pages,
    summary: {
      pages: input.pages.length,
      analyzed: scores.length,
      averageScore: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    },
  };
}

export function parseSnapshot(json: string, name = 'snapshot'): Snapshot {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(`${name}: not valid JSON`);
  }
  const snap = data as Partial<Snapshot>;
  if (snap?.format !== SNAPSHOT_FORMAT || !Array.isArray(snap.pages)) {
    throw new Error(`${name}: not a ${SNAPSHOT_FORMAT} file`);
  }
  return snap as Snapshot;
}

function originOf(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;
