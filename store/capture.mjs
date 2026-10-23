// Captures the real extension UI for the Chrome Web Store screenshots:
// the built dist/ runs in Chromium against a local demo article (store/
// demo-site), first in a "before" version, then fixed, so the panel can show
// what changed. Raw captures land in store/raw/, compose.mjs frames them.
// Usage: npm run build && node store/capture.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { articleHtml } from './demo-site/article.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RAW = join(ROOT, 'store/raw');
const PATH = '/guides/heat-pumps-older-homes';
let version = 1;
let origin = '';

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const ua = String(req.headers['user-agent'] ?? '');
  if (path === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
  }
  if (path === '/sitemap.xml') {
    res.writeHead(200, { 'content-type': 'application/xml' });
    return res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}${PATH}</loc><lastmod>2026-10-20</lastmod></url></urlset>`);
  }
  if (path === PATH) {
    // A CDN rule that turns OpenAI's crawlers away — robots.txt says nothing
    if (/GPTBot|OAI-SearchBot/.test(ua)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(articleHtml(origin, version));
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// A reserved .example name instead of 127.0.0.1:port in the panel; Chromium
// maps it to the local server
const HOST = 'www.northwind-journal.example';
const PORT = server.address().port;
origin = `http://${HOST}`;

const extDir = mkdtempSync(join(tmpdir(), 'geo-store-'));
cpSync(join(ROOT, 'dist'), extDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
manifest.host_permissions = [`http://${HOST}/*`];
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest));

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  locale: 'en-US',
  deviceScaleFactor: 2,
  args: [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    `--host-rules=MAP ${HOST}:80 127.0.0.1:${PORT}`,
  ],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
await worker.evaluate(() =>
  chrome.storage.local.set({ geo_analytics_enabled: false, geo_analytics_notice_seen: true, geo_lang: 'en' })
);
const extId = new URL(worker.url()).host;

const page = await context.newPage();
await page.setViewportSize({ width: 900, height: 1000 });
await page.goto(origin + PATH);
const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, origin + PATH);

const panel = await context.newPage();
await panel.setViewportSize({ width: 400, height: 1000 });
const analyze = async () => {
  await panel.goto(`chrome-extension://${extId}/popup/popup.html?tabId=${tabId}`);
  await panel.locator('#recommendations-section').waitFor({ state: 'visible', timeout: 45000 });
  await panel.waitForTimeout(1500); // score count-up and bars
};

// 1) Before: highlight problems on the page
await analyze();
// Unfold all recommendations, then mark the wall-of-text lead paragraph
await panel.locator('#recs-more-toggle').click().catch(() => {});
const toggle = panel.locator('.highlight-toggle[data-rec-key="low_scanability"], .highlight-toggle[data-rec-key="low_readability"]').first();
await toggle.click();
await page.bringToFront();
await page.waitForTimeout(700);
await page.evaluate(() => window.scrollTo(0, 330));
await page.waitForTimeout(300);
await page.screenshot({ path: join(RAW, 'page-before-highlights.png') });
await toggle.scrollIntoViewIfNeeded();
await panel.evaluate(() => window.scrollBy(0, 200));
await panel.screenshot({ path: join(RAW, 'panel-before-highlight.png') });
await panel.evaluate(() => window.scrollTo(0, 0));
await panel.locator('#recs-more-toggle').click().catch(() => {});
await panel.screenshot({ path: join(RAW, 'panel-before.png') });

// 2) After the fixes: re-analyze, the panel shows what changed
version = 2;
await page.reload();
await page.waitForTimeout(500);
await analyze();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: join(RAW, 'page-after.png') });
await panel.screenshot({ path: join(RAW, 'panel-after.png') });

// 3) A recommendation with its fix snippet open
const snippetBtn = panel.locator('.snippet-toggle:visible').first();
await snippetBtn.click();
await panel.waitForTimeout(300);
const item = panel.locator('.recommendation-item', { has: panel.locator('.snippet-preview:not(.hidden)') }).first();
await item.evaluate((el) => el.scrollIntoView({ block: 'start' }));
await panel.evaluate(() => window.scrollBy(0, -120));
await panel.screenshot({ path: join(RAW, 'panel-snippet.png') });

// 4) Detailed report, robots / crawler findings opened
const [report] = await Promise.all([context.waitForEvent('page'), panel.locator('#export-btn').click()]);
await report.setViewportSize({ width: 1100, height: 1000 });
await report.waitForLoadState('load');
await report.waitForTimeout(1800);
await report.screenshot({ path: join(RAW, 'report-top.png') });
const robots = report.locator('#cat-machineReadability details.crit').filter({ hasText: 'robots.txt' }).first();
await robots.evaluate((d) => (d.open = true));
await robots.evaluate((el) => el.scrollIntoView({ block: 'start' }));
await report.evaluate(() => window.scrollBy(0, -16));
await report.waitForTimeout(300);
await report.screenshot({ path: join(RAW, 'report-robots.png') });

// 5) The PDF export, as Chrome prints it
await report.emulateMedia({ media: 'print' });
await report.pdf({ path: join(RAW, 'report.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
execFileSync('pdftoppm', ['-r', '110', '-png', '-f', '1', '-l', '3', join(RAW, 'report.pdf'), join(RAW, 'pdf')]);

await context.close();
server.close();
rmSync(extDir, { recursive: true, force: true });
console.log('raw captures in', RAW);
