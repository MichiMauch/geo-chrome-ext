import { describe, it, expect, beforeEach } from 'vitest';
import type { StoredHistory } from '../../types/analysis';

// Minimal chrome.storage stub — getDomainOverview only calls get(null).
const store: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async () => ({ ...store }),
    },
  },
};

const { getDomainOverview } = await import('../history');
const { generateDomainDashboardHtml } = await import('../export-domain-html');

function seedHistory(url: string, scores: number[]) {
  // scores newest-first, matching StoredHistory.entries order
  const stored: StoredHistory = {
    url,
    entries: scores.map((s, i) => ({
      timestamp: `2026-06-${String(11 - i).padStart(2, '0')}T10:00:00.000Z`,
      totalScore: s,
      ratingLevel: 'good',
      ratingLabel: 'Good',
      ratingColor: '#84cc16',
    })),
  };
  store[`geo_history:${url}`] = stored;
}

describe('getDomainOverview', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('collects only URLs of the exact hostname', async () => {
    seedHistory('https://example.com/a', [20]);
    seedHistory('https://example.com/b', [15]);
    seedHistory('https://www.example.com/c', [10]); // different host
    seedHistory('https://other.com/d', [12]);
    store['some_other_key'] = { foo: 1 };

    const pages = await getDomainOverview('example.com');
    expect(pages.map((p) => p.path).sort()).toEqual(['/a', '/b']);
  });

  it('sorts worst score first', async () => {
    seedHistory('https://example.com/good', [28]);
    seedHistory('https://example.com/bad', [9]);
    seedHistory('https://example.com/mid', [18]);

    const pages = await getDomainOverview('example.com');
    expect(pages.map((p) => p.path)).toEqual(['/bad', '/mid', '/good']);
  });

  it('computes the delta vs the previous analysis', async () => {
    seedHistory('https://example.com/up', [22.5, 20]);
    seedHistory('https://example.com/first', [14]);

    const pages = await getDomainOverview('example.com');
    const up = pages.find((p) => p.path === '/up')!;
    const first = pages.find((p) => p.path === '/first')!;
    expect(up.delta).toBe(2.5);
    expect(up.analysisCount).toBe(2);
    expect(first.delta).toBeNull();
  });

  it('skips stored histories without entries', async () => {
    store['geo_history:https://example.com/empty'] = {
      url: 'https://example.com/empty',
      entries: [],
    };
    expect(await getDomainOverview('example.com')).toEqual([]);
  });
});

describe('generateDomainDashboardHtml', () => {
  it('renders hostname, rows and trend markers', async () => {
    seedHistory('https://example.com/page-one', [12, 14]);
    const pages = await getDomainOverview('example.com');
    const html = generateDomainDashboardHtml('example.com', pages);
    expect(html).toContain('example.com');
    expect(html).toContain('/page-one');
    expect(html).toContain('12.0');
    expect(html).toContain('▼'); // 12 vs 14 = down
  });

  it('escapes HTML in URLs', () => {
    const html = generateDomainDashboardHtml('example.com', [
      {
        url: 'https://example.com/"><script>alert(1)</script>',
        path: '/"><script>alert(1)</script>',
        lastScore: 10,
        ratingLabel: 'Poor',
        ratingColor: '#ef4444',
        lastTimestamp: '2026-06-11T10:00:00.000Z',
        delta: null,
        analysisCount: 1,
      },
    ]);
    expect(html).not.toContain('<script>alert');
  });

  it('renders the empty state without pages', () => {
    const html = generateDomainDashboardHtml('example.com', []);
    expect(html).toContain('<p class="empty">');
    expect(html).not.toContain('<table>');
  });

  it('gives every row a remove button wired to its exact storage key', async () => {
    seedHistory('https://example.com/page-one', [12]);
    const pages = await getDomainOverview('example.com');
    const html = generateDomainDashboardHtml('example.com', pages);
    expect(html).toContain('data-key="geo_history:https://example.com/page-one"');
    expect(html).toContain('class="dash-remove"');
    expect(html).toContain('data-confirm=');
  });
});
