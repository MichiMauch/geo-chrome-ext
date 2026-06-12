import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GEOAnalysisResult, AnalysisCategory } from '../../types/analysis';

// chrome stub: storage + manifest
const store: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (key?: string | null) => {
        if (key === null || key === undefined) return { ...store };
        return { [key]: store[key] };
      },
      set: async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      },
    },
  },
  runtime: {
    getManifest: () => ({ version: '4.0.0' }),
  },
};

const { reportAnalysis, buildPayload, isAnalyticsEnabled, setAnalyticsEnabled } = await import(
  '../analytics'
);

function makeCategory(score: number, recommendations: string[]): AnalysisCategory {
  return { nameKey: 'cat', score, maxScore: 5, details: [], recommendations };
}

function makeResult(url = 'https://example.com/page'): GEOAnalysisResult {
  return {
    url,
    timestamp: '2026-06-12T10:00:00.000Z',
    totalScore: 17.2,
    maxTotalScore: 30,
    rating: { level: 'moderate', label: 'Moderate', color: '#eab308' },
    categories: {
      contentClarity: makeCategory(3.1, ['no_h1']),
      answerability: makeCategory(4.0, []),
      trustSources: makeCategory(2.5, ['no_author']),
      machineReadability: makeCategory(1.8, ['no_llms_txt', 'no_schema']),
      aiCitation: makeCategory(2.9, ['no_h1']), // duplicate key on purpose
      onPageSeo: makeCategory(2.9, ['canonical_missing']),
    },
    topRecommendations: ['no_schema', 'no_h1'],
  };
}

describe('buildPayload', () => {
  it('contains scores and deduplicated recommendation keys but nothing URL-derived', () => {
    const payload = buildPayload(makeResult(), 'install-1', '4.0.0');
    expect(payload.score).toBe(17.2);
    expect(payload.categories['machineReadability']).toBe(1.8);
    expect(payload.recommendations.sort()).toEqual(
      ['canonical_missing', 'no_author', 'no_h1', 'no_llms_txt', 'no_schema'].sort()
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('example.com');
    expect(serialized).not.toContain('http');
  });
});

describe('reportAnalysis', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.restoreAllMocks();
  });

  it('posts once and dedupes the same page for the rest of the day', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await reportAnalysis(makeResult());
    await reportAnalysis(makeResult());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A different page still goes through
    await reportAnalysis(makeResult('https://example.com/other'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when disabled', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await setAnalyticsEnabled(false);
    expect(await isAnalyticsEnabled()).toBe(false);

    await reportAnalysis(makeResult());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is enabled by default and never throws on network failure', async () => {
    expect(await isAnalyticsEnabled()).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await expect(reportAnalysis(makeResult())).resolves.toBeUndefined();
  });

  it('transmits no URL in the request body', async () => {
    let body = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        body = String(init.body);
        return new Response('{}');
      })
    );
    await reportAnalysis(makeResult('https://secret-customer.example/internal-page'));
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain('secret-customer');
    expect(body).not.toContain('internal-page');
  });
});
