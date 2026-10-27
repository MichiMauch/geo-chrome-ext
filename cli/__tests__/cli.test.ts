import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFetch } from '../analyze';
import { main, normalizeInputUrl, type Io } from '../geo';
import { buildSnapshot, fingerprintOf, parseSnapshot, pathOf, type PageEntry, type Snapshot } from '../snapshot';
import { diffSnapshots, hasRegression } from '../diff';
import { bodyToHtml, levelOf, markerOf, planTickets, titleOf } from '../tickets';

const ORIGIN = 'https://example.test';

const page = (title: string, body: string) => `<!doctype html><html lang="de"><head>
<title>${title}</title><meta name="description" content="Eine Beschreibung, die lang genug ist, damit sie als ordentliche Meta-Description gilt und nicht anschlägt.">
</head><body><main><h1>${title}</h1>${body}</main></body></html>`;

const SITE: Record<string, { status: number; body: string; type?: string }> = {
  '/': { status: 200, body: page('Startseite', '<p>Willkommen.</p>'), type: 'text/html' },
  '/a': { status: 200, body: page('Seite A', '<p>Inhalt A.</p><ul><li>eins</li><li>zwei</li></ul>'), type: 'text/html' },
  '/b': { status: 200, body: page('Seite B', '<p>Inhalt B.</p>'), type: 'text/html' },
  '/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\n' },
  '/sitemap.xml': {
    status: 200,
    body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/a</loc></url><url><loc>${ORIGIN}/b</loc></url></urlset>`,
  },
};

const requests: string[] = [];
const fakeFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  requests.push(url.pathname);
  const hit = url.origin === ORIGIN ? SITE[url.pathname] : undefined;
  if (!hit) return new Response('not found', { status: 404 });
  return new Response(hit.body, { status: hit.status, headers: hit.type ? { 'content-type': hit.type } : {} });
}) as typeof fetch;

function capture(): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, out: (s) => stdout.push(s), err: (s) => stderr.push(s) };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'geo-cli-'));

beforeEach(() => {
  requests.length = 0;
  installFetch(undefined, fakeFetch);
});

describe('geo <url>', () => {
  it('analyzes a page and writes a snapshot with fingerprinted findings', async () => {
    const dir = tmp();
    const io = capture();
    const code = await main([`${ORIGIN}/a`, '--snapshot', join(dir, 's.json'), '--no-bot-probe'], io);
    expect(code).toBe(0);
    expect(io.stdout.join('\n')).toContain('Score:');

    const snap = parseSnapshot(readFileSync(join(dir, 's.json'), 'utf8'));
    expect(snap.pages).toHaveLength(1);
    const [entry] = snap.pages;
    expect(entry.path).toBe('/a');
    expect(entry.totalScore).toBeGreaterThan(0);
    expect(entry.findings!.length).toBeGreaterThan(0);
    for (const f of entry.findings!) {
      expect(f.fingerprint).toBe(`geo:${f.key}:/a`);
      expect(['editorial', 'dev']).toContain(f.owner);
    }
    expect(snap.tool.version).toBeTruthy();
  });

  it('prints the raw GEOAnalysisResult with --json', async () => {
    const io = capture();
    await main([`${ORIGIN}/a`, '--json', '--no-bot-probe'], io);
    const result = JSON.parse(io.stdout.join(''));
    expect(result.url).toBe(`${ORIGIN}/a`);
    expect(result.maxTotalScore).toBe(30);
    expect(Object.keys(result.categories)).toHaveLength(6);
  });

  it('sets exit code 1 below --min', async () => {
    const io = capture();
    expect(await main([`${ORIGIN}/a`, '--min', '29', '--no-bot-probe'], io)).toBe(1);
    expect(await main([`${ORIGIN}/a`, '--min', '1', '--no-bot-probe'], capture())).toBe(0);
  });

  it('adds pages from the sitemap and fetches robots.txt only once', async () => {
    const dir = tmp();
    const code = await main(['--sitemap', '5', `${ORIGIN}/`, '--snapshot', join(dir, 's.json'), '--delay', '0', '--no-bot-probe'], capture());
    expect(code).toBe(0);
    const snap = parseSnapshot(readFileSync(join(dir, 's.json'), 'utf8'));
    expect(snap.source).toBe('sitemap');
    expect(snap.pages.map((p) => p.path).sort()).toEqual(['/', '/a', '/b']);
    expect(requests.filter((p) => p === '/robots.txt')).toHaveLength(1);
  });

  it('records a failing page instead of aborting the run', async () => {
    const dir = tmp();
    await main([`${ORIGIN}/a`, `${ORIGIN}/missing`, '--snapshot', join(dir, 's.json'), '--delay', '0', '--no-bot-probe'], capture());
    const snap = parseSnapshot(readFileSync(join(dir, 's.json'), 'utf8'));
    expect(snap.pages.find((p) => p.path === '/missing')).toMatchObject({ status: 'error', httpStatus: 404 });
    expect(snap.summary.analyzed).toBe(1);
  });

  it('analyzes a local file under a given address', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'p.html'), SITE['/b'].body);
    const io = capture();
    expect(await main(['--file', join(dir, 'p.html'), '--url', 'example.test/b', '--json', '--no-bot-probe'], io)).toBe(0);
    expect(JSON.parse(io.stdout.join('')).url).toBe(`${ORIGIN}/b`);
  });
});

describe('normalizeInputUrl', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeInputUrl('example.com')).toBe('https://example.com/');
    expect(normalizeInputUrl(' www.example.com/x ')).toBe('https://www.example.com/x');
    expect(normalizeInputUrl('http://example.com')).toBe('http://example.com/');
  });
});

// Hand-built snapshots for the comparison and ticket logic
function entry(origin: string, path: string, score: number, keys: string[], checks: Record<string, boolean> = {}): PageEntry {
  return {
    url: origin + path,
    path,
    status: 'ok',
    totalScore: score,
    checks,
    findings: keys.map((key) => ({
      key,
      fingerprint: fingerprintOf(key, path),
      owner: key === 'no_schema' ? 'dev' : 'editorial',
      effort: 'quick',
      priority: key === 'no_schema' ? 10 : 9,
      text: `Text ${key}.`,
    })),
  };
}

const snap = (pages: PageEntry[], version = '1.0.0', createdAt = '2026-10-01T00:00:00.000Z'): Snapshot =>
  buildSnapshot({ version, lang: 'de', source: 'urls', pages, createdAt });

describe('geo diff', () => {
  const before = snap([
    entry(ORIGIN, '/', 10, ['no_author', 'no_schema'], { criterion_author: false, criterion_schema: false }),
    entry(ORIGIN, '/a', 12, ['no_author'], { criterion_author: false }),
    entry(ORIGIN, '/old', 8, ['no_author']),
  ]);
  const after = snap(
    [
      entry(ORIGIN, '/', 14, ['no_author'], { criterion_author: false, criterion_schema: true }),
      entry(ORIGIN, '/a', 11, ['no_author', 'no_date'], { criterion_author: false, criterion_date: false }),
      entry(ORIGIN, '/new', 20, []),
    ],
    '1.0.0',
    '2026-11-01T00:00:00.000Z'
  );

  it('matches pages by path and reports fixed and new findings', () => {
    const diff = diffSnapshots(before, after);
    expect(diff.pagesAdded).toEqual(['/new']);
    expect(diff.pagesRemoved).toEqual(['/old']);
    expect(diff.common).toEqual({ pages: 2, before: 11, after: 12.5, delta: 1.5 });
    const home = diff.pages.find((p) => p.path === '/')!;
    expect(home.findingsFixed).toEqual(['no_schema']);
    expect(home.fixed).toEqual(['criterion_schema']);
    const a = diff.pages.find((p) => p.path === '/a')!;
    expect(a.findingsNew).toEqual(['no_date']);
    expect(diff.findings.find((f) => f.key === 'no_author')).toMatchObject({ before: 2, after: 2 });
    expect(diff.totals).toEqual({ fixed: 1, new: 1, pagesUp: 1, pagesDown: 1 });
    expect(diff.newCriteria).toEqual(['criterion_date']);
    expect(hasRegression(diff)).toBe(true);
  });

  it('compares staging against production by path', () => {
    const staging = snap([entry('https://staging.example.test', '/', 14, [])]);
    const prod = snap([entry(ORIGIN, '/', 14, [])]);
    const diff = diffSnapshots(prod, staging);
    expect(diff.common.pages).toBe(1);
    expect(hasRegression(diff)).toBe(false);
  });

  it('flags a different analyzer version', () => {
    expect(diffSnapshots(before, snap(after.pages, '2.0.0')).versionChanged).toBe(true);
  });

  it('exits 1 with --fail-on-regression and writes HTML', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'a.json'), JSON.stringify(before));
    writeFileSync(join(dir, 'b.json'), JSON.stringify(after));
    const io = capture();
    expect(await main(['diff', join(dir, 'a.json'), join(dir, 'b.json'), '--fail-on-regression', '--html', join(dir, 'd.html')], io)).toBe(1);
    expect(readFileSync(join(dir, 'd.html'), 'utf8')).toContain('/a');
    expect(await main(['diff', join(dir, 'a.json'), join(dir, 'b.json')], capture())).toBe(0);
  });

  it('rejects a file that is not a snapshot', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'x.json'), '{"hello":1}');
    const io = capture();
    expect(await main(['diff', join(dir, 'x.json'), join(dir, 'x.json')], io)).toBe(2);
  });
});

describe('geo tickets', () => {
  const before = snap([entry(ORIGIN, '/', 10, ['no_author', 'no_schema']), entry(ORIGIN, '/a', 12, ['no_author'])]);
  const after = snap([entry(ORIGIN, '/', 14, ['no_author']), entry(ORIGIN, '/a', 11, ['no_author', 'no_date'])]);

  it('plans one ticket per finding and site with all affected pages', () => {
    const plan = planTickets(after);
    expect(plan.site).toBe('example.test');
    const author = plan.tickets.find((t) => t.key === 'no_author')!;
    expect(author.pages).toEqual(['/', '/a']);
    expect(author.marker).toBe('geo:example.test:no_author');
    expect(author.body).toContain(`${ORIGIN}/a`);
    expect(author.body).toContain('geo:example.test:no_author');
    expect(plan.tickets.every((t) => t.state === 'open')).toBe(true);
  });

  it('reports findings gone since the baseline as resolved', () => {
    const plan = planTickets(after, { baseline: before });
    const schema = plan.tickets.find((t) => t.key === 'no_schema')!;
    expect(schema.state).toBe('resolved');
    expect(schema.pages).toEqual([]);
    expect(plan.tickets.find((t) => t.key === 'no_date')!.change).toMatchObject({ before: 0, after: 1, newOn: ['/a'] });
    expect(plan.tickets.at(-1)!.state).toBe('resolved');
  });

  it('filters by owner', () => {
    const plan = planTickets(after, { baseline: before, owner: 'dev' });
    expect(plan.tickets.map((t) => t.key)).toEqual(['no_schema']);
  });

  it('is deterministic apart from the plan timestamp', () => {
    const strip = (p: ReturnType<typeof planTickets>) => ({ ...p, createdAt: '' });
    expect(strip(planTickets(after, { baseline: before }))).toEqual(strip(planTickets(after, { baseline: before })));
  });
});

describe('helpers', () => {
  it('normalizes paths for fingerprints', () => {
    expect(pathOf('https://x.ch/')).toBe('/');
    expect(pathOf('https://x.ch/a/')).toBe('/a');
    expect(pathOf('https://x.ch/a?b=1')).toBe('/a?b=1');
  });

  it('builds short ticket titles', () => {
    expect(titleOf('Machen Sie den Autor sichtbar (E-E-A-T). Zweiter Satz.')).toBe('GEO: Machen Sie den Autor sichtbar (E-E-A-T)');
    expect(titleOf('x'.repeat(200)).length).toBeLessThanOrEqual(95);
    expect(markerOf('https://www.x.ch', 'no_faq')).toBe('geo:www.x.ch:no_faq');
  });
});

describe('ticket HTML', () => {
  it('renders headings, lists, code fences and links as portal HTML', () => {
    const html = bodyToHtml('**Redaktion** · schnell\n\n## Seiten\n\n- https://x.ch/a\n- https://x.ch/b\n\n## Vorlage\n\nHinweis\n\n```\n<p>a</p>\n\nb\n```\n\n---\nQuelle `geo:x.ch:k`');
    expect(html).toContain('<p><strong>Redaktion</strong> · schnell</p>');
    expect(html).toContain('<h2>Seiten</h2>');
    expect(html).toContain('<ul><li><p><a href="https://x.ch/a">https://x.ch/a</a></p></li><li><p><a href="https://x.ch/b">https://x.ch/b</a></p></li></ul>');
    expect(html).toContain('<p>Hinweis</p>');
    expect(html).toContain('<p><code>&lt;p&gt;a&lt;/p&gt;<br><br>b</code></p>');
    expect(html).toContain('<code>geo:x.ch:k</code>');
    expect(html).not.toContain('```');
  });

  it('maps priorities to levels', () => {
    expect([levelOf(12), levelOf(10), levelOf(7), levelOf(3)]).toEqual(['high', 'high', 'medium', 'low']);
  });

  it('puts the HTML body into every planned ticket', () => {
    const plan = planTickets(snap([entry(ORIGIN, '/', 10, ['no_schema'])]));
    expect(plan.tickets[0].html).toContain('<h2>');
    expect(plan.tickets[0].level).toBe('high');
  });
});

