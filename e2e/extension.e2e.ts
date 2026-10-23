// The built extension (dist/) in a real Chromium, against a local test site:
// content script, crawler view, sitemap check and the bot-access probe with
// its declarativeNetRequest rule — the parts jsdom cannot cover.
//
// Chromium only grants activeTab on a real toolbar click, which automation
// cannot do. The test therefore runs a copy of dist/ whose manifest adds
// host_permissions for the test server; everything else is the shipped code.
import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ARTICLE = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Wärmepumpen im Altbau: was sie kosten und wann sie sich lohnen</title>
<meta name="description" content="Eine Wärmepumpe im Altbau kostet 25'000 bis 45'000 Franken. Wann sie sich lohnt, welche Förderung es gibt und worauf Sie bei der Planung achten.">
<link rel="canonical" href="{ORIGIN}/artikel/waermepumpe">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Wärmepumpen im Altbau","author":{"@type":"Person","name":"Anna Muster"},"datePublished":"2026-10-01","dateModified":"2026-10-20","publisher":{"@type":"Organization","name":"Energie AG","logo":"{ORIGIN}/logo.png"}}</script>
</head><body><header><nav><a href="/">Start</a></nav></header>
<main><article><h1>Wärmepumpen im Altbau</h1>
<p>Von Anna Muster · <time datetime="2026-10-20">20. Oktober 2026</time></p>
<p>Eine Wärmepumpe ist eine Heizung, die Wärme aus Luft, Erde oder Wasser nutzt. Im Altbau kostet sie 25'000 bis 45'000 Franken, laut Bundesamt für Energie spart sie rund 60 % der Heizkosten.</p>
<h2>Was kostet eine Wärmepumpe?</h2><p>Die Kosten hängen von der Bauart ab. Eine Luft-Wasser-Wärmepumpe ist am günstigsten, eine Erdsonde kostet mehr, hält aber länger und arbeitet effizienter.</p>
<h2>Wann lohnt sie sich?</h2><ul><li>Bei guter Dämmung</li><li>Mit Bodenheizung</li><li>Bei steigenden Ölpreisen</li></ul>
<p>Gemäss <a href="https://www.bfe.admin.ch/">BFE</a> und <a href="https://www.energieschweiz.ch/">EnergieSchweiz</a> rechnet sich der Ersatz meist nach zehn bis fünfzehn Jahren.</p>
</article></main><footer><a href="/impressum">Impressum</a></footer></body></html>`;

let server: Server;
let origin = '';
let context: BrowserContext;
let worker: Worker;
let extensionDir = '';
const botRequests: string[] = [];

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const ua = String(req.headers['user-agent'] ?? '');
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
      return;
    }
    if (path === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/artikel/waermepumpe</loc><lastmod>2026-10-20</lastmod></url></urlset>`);
      return;
    }
    if (path === '/artikel/waermepumpe') {
      // A CDN-style rule: OpenAI crawlers get 403, everybody else the page
      if (/GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot/.test(ua)) botRequests.push(ua.match(/(GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot)/)![1]);
      if (/GPTBot|OAI-SearchBot/.test(ua)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(ARTICLE.split('{ORIGIN}').join(origin));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  extensionDir = mkdtempSync(join(tmpdir(), 'geo-ext-'));
  cpSync(join(process.cwd(), 'dist'), extensionDir, { recursive: true });
  const manifestPath = join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  writeFileSync(manifestPath, JSON.stringify(manifest));

  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    locale: 'de-CH',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Test runs must not show up in the anonymous usage statistics
  await worker.evaluate(() => chrome.storage.local.set({ geo_analytics_enabled: false, geo_analytics_notice_seen: true }));
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
  if (extensionDir) rmSync(extensionDir, { recursive: true, force: true });
});

test('analysiert eine Seite im echten Chrome, inklusive Bot-Abruf und Sitemap', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/artikel/waermepumpe`);
  const tabId = await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return tab.id!;
  }, `${origin}/artikel/waermepumpe`);

  const extensionId = new URL(worker.url()).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/popup/popup.html?tabId=${tabId}`);
  await expect(panel.locator('#recommendations-section')).toBeVisible({ timeout: 45_000 });

  // The cached result carries the untranslated ids and evidence keys
  const result = await worker.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const entry = Object.entries(all).find(([k, v]) => k.includes('cache') && (v as { result?: unknown }).result);
    return (entry?.[1] as { result: { totalScore: number; categories: Record<string, { details: { id: string; found: boolean; evidence?: { key: string; params?: Record<string, unknown> }[] }[] }> } }).result;
  });
  const detail = (cat: string, id: string) => result.categories[cat].details.find((d) => d.id === id)!;
  const keys = (cat: string, id: string) => (detail(cat, id).evidence ?? []).map((e) => e.key);

  // Bot probe: the DNR rule really swapped the User-Agent, both OpenAI bots got 403
  expect(botRequests.sort()).toEqual(['ClaudeBot', 'GPTBot', 'OAI-SearchBot', 'PerplexityBot']);
  expect(keys('machineReadability', 'criterion_robotsTxt')).toContain('ev_robotsTxt_firewall');
  const firewall = detail('machineReadability', 'criterion_robotsTxt').evidence!.find((e) => e.key === 'ev_robotsTxt_firewall')!;
  expect(firewall.params).toMatchObject({ bots: 'OAI-SearchBot, GPTBot', status: '403' });

  // The page's own fetch afterwards is a normal browser request again
  const after = await page.evaluate(async () => (await fetch(location.href)).status);
  expect(after).toBe(200);

  // Sitemap and crawler view ran live
  expect(detail('machineReadability', 'criterion_sitemap').found).toBe(true);
  expect(keys('machineReadability', 'criterion_sitemap')).toContain('ev_sitemap_listed');
  expect(detail('machineReadability', 'criterion_crawlerView').found).toBe(true);

  // Content checks on the real DOM
  expect(detail('trustSources', 'criterion_author').found).toBe(true);
  expect(detail('trustSources', 'criterion_sources').found).toBe(true);
  expect(result.totalScore).toBeGreaterThan(18);

  // The panel shows the firewall recommendation
  await expect(panel.locator('#recommendations')).toContainText('CDN');
});
