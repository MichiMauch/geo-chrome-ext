// Shared loader for the reference corpus (see corpus/README.md): parses a
// snapshot, serves its robots.txt / llms.txt to the analysis through a fake
// fetch, and condenses the raw result into a stable, diffable summary.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { extractPageData } from '../utils/dom-helpers';
import { withXRobotsTag } from '../utils/x-robots-tag';
import { runRawAnalysis } from '../analyzers';
import type { AnalysisCategory, PageData, PageType } from '../types/analysis';

export const CORPUS_DIR = join(__dirname, '../../corpus');

export interface CorpusPage {
  id: string;
  url: string;
  kind: string;
  why: string;
}

interface TextFile {
  status: number;
  length: number;
  text: string;
}

interface SnapshotMeta {
  finalUrl: string;
  fetchedAt: string;
  xRobotsTag: string | null;
  robotsStatus: number;
  llms: TextFile;
  llmsFull: TextFile;
}

export const corpusPages: CorpusPage[] = JSON.parse(readFileSync(join(CORPUS_DIR, 'pages.json'), 'utf8'));

const snapshotDir = (id: string) => join(CORPUS_DIR, 'snapshots', id);
export const hasSnapshot = (id: string) => existsSync(join(snapshotDir(id), 'meta.json'));

function fakeFetch(dir: string, meta: SnapshotMeta): typeof fetch {
  const origin = new URL(meta.finalUrl).origin;
  const robots = existsSync(join(dir, 'robots.txt')) ? readFileSync(join(dir, 'robots.txt'), 'utf8') : '';
  // The snapshot keeps only the head of llms(-full).txt; the check reads its length
  const textResponse = (f: TextFile) =>
    new Response(f.status === 200 ? f.text.padEnd(f.length, ' ') : '', { status: f.status || 404 });
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${origin}/robots.txt`) return new Response(robots, { status: meta.robotsStatus || 404 });
    if (url === `${origin}/llms.txt`) return textResponse(meta.llms);
    if (url === `${origin}/llms-full.txt`) return textResponse(meta.llmsFull);
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

export interface CorpusResult {
  pageData: PageData;
  pageType: PageType;
  categories: Record<string, AnalysisCategory>;
}

/** Analyzes a snapshot with the clock set to its fetch date. */
export async function analyzeSnapshot(id: string): Promise<CorpusResult> {
  const dir = snapshotDir(id);
  const meta: SnapshotMeta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const html = readFileSync(join(dir, 'page.html'), 'utf8');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(meta.fetchedAt));
  vi.stubGlobal('fetch', fakeFetch(dir, meta));
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pageData = await extractPageData(doc, meta.finalUrl);
    pageData.robotsMeta = withXRobotsTag(pageData.robotsMeta, meta.xRobotsTag);
    const { pageType, categories } = runRawAnalysis(pageData);
    return { pageData, pageType, categories };
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
}

/** Stable summary for the golden files: keys, not translated texts. */
export function summarize({ pageType, categories }: CorpusResult) {
  const round = (n: number) => Math.round(n * 10) / 10;
  const total = round(Object.values(categories).reduce((sum, c) => sum + c.score, 0));
  return {
    total,
    pageType,
    categories: Object.fromEntries(
      Object.entries(categories).map(([key, c]) => [
        key,
        {
          score: round(c.score),
          criteria: Object.fromEntries(
            c.details.map((d) => [
              d.criterionKey,
              {
                found: d.found,
                value: d.value,
                ...(d.progress ? { progress: `${d.progress.current}/${d.progress.target}` } : {}),
                evidence: (d.evidence ?? []).map((e) => e.key),
                ...(d.fixKey ? { fix: d.fixKey } : {}),
              },
            ])
          ),
          recommendations: c.recommendations,
        },
      ])
    ),
  };
}
