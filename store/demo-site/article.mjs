// Demo article for the store screenshots: a fictional home-energy magazine.
// `version` 1 is the page before the fixes, 2 after — so the panel can show
// "fixed since last check". Every piece of copy is invented for the demo.
const ILLUSTRATION = `<svg viewBox="0 0 800 340" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#f0fdfa"/></linearGradient></defs>
  <rect width="800" height="340" fill="url(#sky)"/>
  <circle cx="660" cy="80" r="38" fill="#fde68a"/>
  <rect x="0" y="270" width="800" height="70" fill="#bbf7d0"/>
  <path d="M250 150 L380 70 L510 150 Z" fill="#b45309"/>
  <rect x="270" y="150" width="220" height="125" fill="#fef3c7" stroke="#92400e" stroke-width="3"/>
  <rect x="300" y="180" width="45" height="40" fill="#bfdbfe" stroke="#92400e" stroke-width="3"/>
  <rect x="415" y="180" width="45" height="40" fill="#bfdbfe" stroke="#92400e" stroke-width="3"/>
  <rect x="360" y="215" width="40" height="60" fill="#92400e"/>
  <rect x="520" y="225" width="70" height="50" rx="6" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>
  <circle cx="555" cy="250" r="16" fill="none" stroke="#475569" stroke-width="3"/>
  <path d="M555 236 v28 M541 250 h28" stroke="#475569" stroke-width="3"/>
</svg>`;

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 17px/1.65 Georgia, 'Times New Roman', serif; color: #1f2937; background: #fff; }
  header.site { display: flex; align-items: center; justify-content: space-between; padding: 18px 48px; border-bottom: 1px solid #e5e7eb; font-family: system-ui, sans-serif; }
  .logo { font-weight: 800; font-size: 20px; color: #0f766e; letter-spacing: -0.02em; }
  nav a { margin-left: 22px; color: #374151; text-decoration: none; font-size: 15px; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 32px 80px; }
  .kicker { font: 600 13px system-ui, sans-serif; color: #0f766e; text-transform: uppercase; letter-spacing: 0.08em; }
  h1 { font: 800 42px/1.15 system-ui, sans-serif; letter-spacing: -0.02em; margin: 10px 0 14px; color: #111827; }
  .byline { font: 14px system-ui, sans-serif; color: #6b7280; margin-bottom: 26px; }
  figure { margin: 0 0 28px; } figure svg { width: 100%; border-radius: 14px; display: block; }
  figcaption { font: 13px system-ui, sans-serif; color: #6b7280; margin-top: 8px; }
  h2 { font: 700 26px/1.25 system-ui, sans-serif; margin: 34px 0 12px; color: #111827; }
  h4 { font: 700 19px system-ui, sans-serif; margin: 26px 0 8px; }
  p { margin-bottom: 16px; }
  ul { margin: 0 0 18px 22px; } li { margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; font: 15px system-ui, sans-serif; margin: 6px 0 22px; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 10px; text-align: left; }
  th { background: #f0fdfa; }
  a { color: #0f766e; }
  footer { border-top: 1px solid #e5e7eb; padding: 24px 48px; font: 14px system-ui, sans-serif; color: #6b7280; }
`;

export function articleHtml(origin, version) {
  const after = version >= 2;
  const schema = after
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Article',
        headline: 'Heat pumps for older homes: costs, savings and what to check first',
        author: { '@type': 'Person', name: 'Emma Clarke', url: `${origin}/team/emma-clarke` },
        datePublished: '2026-09-14', dateModified: '2026-10-20',
        publisher: { '@type': 'Organization', name: 'Northwind Home Journal', logo: `${origin}/logo.png` },
      })}</script>`
    : '';
  const lead = after
    ? `<p>A heat pump is a heating system that moves warmth from the outside air or the ground into your home. In an older house, an air-source heat pump typically costs £9,000 to £14,000 installed and cuts heating bills by around 40 % compared with an oil boiler, according to the <a href="https://www.energysavingtrust.org.uk/">Energy Saving Trust</a>.</p>`
    : `<p>Many readers have asked us over the past months whether it really makes sense to think about this topic for a house that was built several decades ago, and the honest answer is that it depends on quite a few things that are worth looking at carefully before making any decision, because every building is a little different and the details matter more than most brochures suggest when they describe what you can expect in practice over the years.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Heat pumps for older homes: costs, savings and what to check</title>
<meta name="description" content="What a heat pump costs in an older home, how much it saves, and the three things to check before you buy — insulation, radiators and the electricity tariff.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${origin}/guides/heat-pumps-older-homes">
<meta property="og:title" content="Heat pumps for older homes"><meta property="og:type" content="article">
${schema}
<style>${css}</style></head><body>
<header class="site"><span class="logo">Northwind Home Journal</span>
<nav><a href="/guides">Guides</a><a href="/energy">Energy</a><a href="/renovation">Renovation</a><a href="/about">About us</a></nav></header>
<main><article>
<div class="kicker">Energy guide</div>
<h1>Heat pumps for older homes</h1>
<div class="byline">${after ? 'By Emma Clarke · Updated <time datetime="2026-10-20">20 October 2026</time>' : 'Energy desk'}</div>
<figure>${ILLUSTRATION.replace('role="img"', after ? 'role="img" aria-label="A heat pump next to an older brick house"' : 'role="img"')}<figcaption>An air-source unit outside a 1930s semi-detached house.</figcaption></figure>
${lead}
<h2>What does a heat pump cost in an older home?</h2>
<p>The price depends on the type of system and on the work your house needs before installation.</p>
<table><thead><tr><th>System</th><th>Installed cost</th><th>Typical saving</th></tr></thead>
<tbody><tr><td>Air-source</td><td>£9,000–£14,000</td><td>30–45 %</td></tr><tr><td>Ground-source</td><td>£18,000–£28,000</td><td>40–55 %</td></tr></tbody></table>
<${after ? 'h2' : 'h4'}>Three things to check first</${after ? 'h2' : 'h4'}>
<ul><li>Insulation in the loft and walls</li><li>Radiator size in the main rooms</li><li>An electricity tariff with cheaper off-peak hours</li></ul>
<h2>Is it worth it?</h2>
<p>For most older homes with reasonable insulation, the system pays for itself within ten to fifteen years${after ? ', based on <a href="https://www.gov.uk/improve-energy-efficiency">government efficiency data</a>' : ''}.</p>
${after ? `<h2>Can a heat pump work with old radiators?</h2><p>Often yes: if the main rooms stay warm at a flow temperature of 50 °C, the existing radiators are usually large enough.</p>` : ''}
</article></main>
<footer>© 2026 Northwind Home Journal · <a href="/imprint">Imprint</a> · <a href="/contact">Contact</a></footer>
</body></html>`;
}
