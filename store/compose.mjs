// Frames the raw captures (store/raw, from capture.mjs) into the five
// 1280×800 Chrome Web Store screenshots in store/screenshots.
// Usage: node store/compose.mjs
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const raw = (f) => `file://${join(ROOT, 'store/raw', f)}`;
const ICON = `file://${join(ROOT, 'dist/assets/icon-128.png')}`;
const URL_BAR = 'northwind-journal.example/guides/heat-pumps-older-homes';

const base = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1280px; height: 800px; overflow: hidden; }
  body { font-family: Inter, -apple-system, 'Segoe UI', sans-serif; color: #0f172a;
    background: radial-gradient(ellipse 70% 60% at 85% 10%, rgba(51,204,204,0.28), transparent 60%),
                radial-gradient(ellipse 60% 70% at 0% 100%, rgba(16,185,129,0.16), transparent 60%),
                linear-gradient(160deg, #f0fdfa 0%, #ecfeff 45%, #f8fafc 100%); }
  .brand { position: absolute; top: 34px; left: 56px; display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; color: #0f766e; }
  .brand img { width: 28px; height: 28px; border-radius: 7px; }
  h1 { font-size: 44px; line-height: 1.08; letter-spacing: -0.03em; font-weight: 800; }
  h1 em { font-style: normal; color: #0f9b9b; }
  .sub { font-size: 19px; line-height: 1.45; color: #475569; margin-top: 14px; }
  .window { position: absolute; background: #fff; border-radius: 14px; overflow: hidden;
    box-shadow: 0 30px 60px -20px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.08); }
  .bar { height: 38px; background: #f1f5f9; display: flex; align-items: center; gap: 7px; padding: 0 14px; border-bottom: 1px solid #e2e8f0; }
  .bar b { width: 11px; height: 11px; border-radius: 50%; background: #e2e8f0; display: inline-block; }
  .bar b:nth-child(1) { background: #f87171; } .bar b:nth-child(2) { background: #fbbf24; } .bar b:nth-child(3) { background: #34d399; }
  .bar span { margin-left: 14px; flex: 1; height: 24px; border-radius: 12px; background: #fff; font-size: 12px; color: #64748b; display: flex; align-items: center; padding: 0 12px; }
  .split { display: flex; height: calc(100% - 38px); }
  .split .page { flex: 1; overflow: hidden; border-right: 1px solid #e2e8f0; }
  .split .panel { width: 330px; overflow: hidden; }
  .split img, .shot img { width: 100%; display: block; }
  ul.points { list-style: none; margin-top: 26px; display: grid; gap: 14px; }
  ul.points li { display: flex; gap: 12px; font-size: 17px; line-height: 1.4; color: #1e293b; }
  ul.points li::before { content: '✓'; flex: 0 0 26px; height: 26px; border-radius: 50%; background: #ccfbf1; color: #0f766e; font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; }
  .tag { display: inline-block; font-size: 13px; font-weight: 700; padding: 2px 9px; border-radius: 999px; margin-right: 4px; }
  .tag.ed { background: rgba(124,58,237,0.12); color: #6d28d9; } .tag.dev { background: rgba(37,99,235,0.12); color: #1d4ed8; }
`;

const windowSplit = (page, panel, { left, top, width, height, pageOffset = 0, panelOffset = 0 }) => `
  <div class="window" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px">
    <div class="bar"><b></b><b></b><b></b><span>${URL_BAR}</span></div>
    <div class="split">
      <div class="page"><img src="${raw(page)}" style="margin-top:-${pageOffset}px"></div>
      <div class="panel"><img src="${raw(panel)}" style="margin-top:-${panelOffset}px"></div>
    </div>
  </div>`;

const screens = {
  '1-score': `
    <div class="brand"><img src="${ICON}">Paul AI GEO Analyzer</div>
    <div style="position:absolute;left:56px;top:80px;width:1170px">
      <h1>See your page the way <em>AI search</em> reads it</h1>
      <p class="sub">One click scores any page out of 30 — across six categories — and shows what changed since your last check.</p>
    </div>
    ${windowSplit('page-after.png', 'panel-after.png', { left: 56, top: 214, width: 1168, height: 560 })}`,
  '2-on-page': `
    <div class="brand"><img src="${ICON}">Paul AI GEO Analyzer</div>
    <div style="position:absolute;left:56px;top:80px;width:1170px">
      <h1>Problems marked <em>right on the page</em></h1>
      <p class="sub">“Show on page” outlines every affected paragraph, heading or image — with a plain-language note on what to fix.</p>
    </div>
    ${windowSplit('page-before-highlights.png', 'panel-before-highlight.png', { left: 56, top: 214, width: 1168, height: 560 })}`,
  '3-fix': `
    <div class="brand"><img src="${ICON}">Paul AI GEO Analyzer</div>
    <div style="position:absolute;left:56px;top:110px;width:600px">
      <h1>Every finding comes with <em>the fix</em></h1>
      <p class="sub">No guessing what to change — and no guessing who changes it.</p>
      <ul class="points">
        <li><span><span class="tag ed">Editorial</span> or <span class="tag dev">Development</span> on every recommendation</span></li>
        <li>An effort estimate: a quarter of an hour, an hour or two, or a project</li>
        <li>Copy-paste snippets for Schema.org, llms.txt, robots.txt and more</li>
        <li>Fixed and new findings since your last check</li>
      </ul>
    </div>
    <div class="window shot" style="left:770px;top:48px;width:430px;height:704px"><img src="${raw('panel-snippet.png')}"></div>`,
  '4-crawlers': `
    <div class="brand"><img src="${ICON}">Paul AI GEO Analyzer</div>
    <div style="position:absolute;left:56px;top:80px;width:1170px">
      <h1>Catch what keeps <em>AI crawlers</em> out</h1>
      <p class="sub">robots.txt, CDN and firewall rules, snippet limits and Content-Signal — checked for ChatGPT, Claude, Perplexity, Google and Bing.</p>
    </div>
    <div class="window shot" style="left:56px;top:214px;width:1168px;height:560px">
      <div class="bar"><b></b><b></b><b></b><span>Paul AI GEO Analyzer — detailed report</span></div>
      <img src="${raw('report-robots.png')}">
    </div>`,
  '5-pdf': `
    <div class="brand"><img src="${ICON}">Paul AI GEO Analyzer</div>
    <div style="position:absolute;left:56px;top:150px;width:520px">
      <h1>A <em>client-ready</em> PDF in one click</h1>
      <p class="sub">Hand the result to the people who fix it.</p>
      <ul class="points">
        <li>Title page with the score, all six categories and the open points</li>
        <li>Recommendations split for the editorial team and the developers</li>
        <li>Every criterion explained — what was found, why it matters, how to fix it</li>
        <li>100% local: the analysis never leaves your browser</li>
      </ul>
    </div>
    <img src="${raw('pdf-02.png')}" style="position:absolute;left:880px;top:120px;width:340px;border-radius:6px;transform:rotate(4deg);box-shadow:0 30px 60px -20px rgba(15,23,42,0.35),0 0 0 1px rgba(15,23,42,0.08)">
    <img src="${raw('pdf-01.png')}" style="position:absolute;left:640px;top:80px;width:360px;border-radius:6px;transform:rotate(-3deg);box-shadow:0 30px 60px -20px rgba(15,23,42,0.4),0 0 0 1px rgba(15,23,42,0.08)">`,
};

// Loaded as a file so the file:// images resolve
const tmp = join(ROOT, 'store/raw/_compose.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
for (const [name, body] of Object.entries(screens)) {
  writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${body}</body></html>`);
  await page.goto(`file://${tmp}`, { waitUntil: 'load' });
  await page.screenshot({ path: join(ROOT, 'store/screenshots', `${name}.png`) });
}
await browser.close();
unlinkSync(tmp);
console.log('5 screenshots in store/screenshots');
