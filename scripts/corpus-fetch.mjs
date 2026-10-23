// Downloads the reference corpus snapshots (see corpus/README.md). Only pages
// without a snapshot are fetched; pass ids to limit the run.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../corpus/', import.meta.url).pathname;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MAX_TEXT = 2_000_000;

const pages = JSON.parse(await readFile(join(ROOT, 'pages.json'), 'utf8'));
const only = new Set(process.argv.slice(2));

async function get(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'de-CH,de;q=0.9,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    return { status: res.status, finalUrl: res.url, headers: res.headers, text };
  } catch (err) {
    return { status: 0, error: String(err), text: '' };
  }
}

const exists = (p) => access(p).then(() => true, () => false);

for (const page of pages) {
  if (only.size > 0 && !only.has(page.id)) continue;
  const dir = join(ROOT, 'snapshots', page.id);
  if (await exists(join(dir, 'meta.json'))) continue;

  const res = await get(page.url);
  if (res.status !== 200 || !/<html|<!doctype/i.test(res.text.slice(0, 2000))) {
    console.warn(`✗ ${page.id}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
    continue;
  }
  const origin = new URL(res.finalUrl).origin;
  const [robots, llms, llmsFull] = await Promise.all(
    ['/robots.txt', '/llms.txt', '/llms-full.txt'].map((p) => get(origin + p))
  );
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'page.html'), res.text);
  if (robots.status === 200) await writeFile(join(dir, 'robots.txt'), robots.text.slice(0, MAX_TEXT));
  const textFile = (r) => ({ status: r.status, length: r.text.length, text: r.text.slice(0, 4000) });
  await writeFile(
    join(dir, 'meta.json'),
    JSON.stringify(
      {
        id: page.id,
        url: page.url,
        finalUrl: res.finalUrl,
        fetchedAt: new Date().toISOString(),
        xRobotsTag: res.headers.get('x-robots-tag'),
        robotsStatus: robots.status,
        llms: textFile(llms),
        llmsFull: textFile(llmsFull),
      },
      null,
      2
    )
  );
  console.log(`✓ ${page.id} (${Math.round(res.text.length / 1024)} KB)`);
}
