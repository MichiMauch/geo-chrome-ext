import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkLlmsTxt } from '../dom-helpers';

type Route = Record<string, { ok?: boolean; body?: string } | 'reject'>;

function mockFetch(routes: Route) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const route = routes[url];
      if (route === 'reject') throw new Error('network');
      if (!route) return { ok: false, text: async () => '' };
      return { ok: route.ok ?? true, text: async () => route.body ?? '' };
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const ORIGIN = 'https://example.com';

describe('checkLlmsTxt', () => {
  it('checks llms.txt and llms-full.txt', async () => {
    const calls = mockFetch({
      'https://example.com/llms.txt': { body: '# Example\n- [Docs](/docs)' },
      'https://example.com/llms-full.txt': { body: 'Full text of every page.' },
    });
    const result = await checkLlmsTxt(ORIGIN);

    expect(calls).toEqual([
      'https://example.com/llms.txt',
      'https://example.com/llms-full.txt',
    ]);
    expect(result.exists).toBe(true);
    expect(result.url).toBe('https://example.com/llms.txt');
    expect(result.contentLength).toBe(25);
    expect(result.fullExists).toBe(true);
    expect(result.fullUrl).toBe('https://example.com/llms-full.txt');
    expect(result.fullContentLength).toBe(24);
  });

  it('reports llms-full.txt alone', async () => {
    mockFetch({ 'https://example.com/llms-full.txt': { body: 'Full text.' } });
    const result = await checkLlmsTxt(ORIGIN);
    expect(result.exists).toBe(false);
    expect(result.url).toBeUndefined();
    expect(result.fullExists).toBe(true);
  });

  it('reports llms.txt alone', async () => {
    mockFetch({ 'https://example.com/llms.txt': { body: '# Example' } });
    const result = await checkLlmsTxt(ORIGIN);
    expect(result.exists).toBe(true);
    expect(result.fullExists).toBe(false);
    expect(result.fullUrl).toBeUndefined();
  });

  it('ignores an HTML soft-404 served for both paths', async () => {
    mockFetch({
      'https://example.com/llms.txt': { body: '<!DOCTYPE html><html>Not found</html>' },
      'https://example.com/llms-full.txt': { body: '  <html><head></head></html>' },
    });
    const result = await checkLlmsTxt(ORIGIN);
    expect(result.exists).toBe(false);
    expect(result.fullExists).toBe(false);
  });

  it('ignores empty files and non-ok responses', async () => {
    mockFetch({
      'https://example.com/llms.txt': { body: '   \n  ' },
      'https://example.com/llms-full.txt': { ok: false, body: 'nope' },
    });
    const result = await checkLlmsTxt(ORIGIN);
    expect(result.exists).toBe(false);
    expect(result.fullExists).toBe(false);
  });

  it('survives a network error on one of the two requests', async () => {
    mockFetch({
      'https://example.com/llms.txt': 'reject',
      'https://example.com/llms-full.txt': { body: 'Full text.' },
    });
    const result = await checkLlmsTxt(ORIGIN);
    expect(result.exists).toBe(false);
    expect(result.fullExists).toBe(true);
  });
});
