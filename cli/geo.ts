// geo — the GEO Analyzer in the terminal, for Claude Code, Kraftwerk and CI.
//
//   geo <url> [<url>…]          analyze pages (text, --json, --snapshot, --report)
//   geo diff <before> <after>   compare two snapshots
//   geo tickets <snapshot>      ticket plan, one ticket per finding and site
//
// Exit codes: 0 fine, 1 below --min or a regression with --fail-on-regression,
// 2 usage or fetch error.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setLang, type Lang } from '../src/utils/i18n';
import { discoverSitemapPages } from '../src/utils/sitemap';
import { generateHtmlReport } from '../src/utils/export-html';
import type { GEOAnalysisResult } from '../src/types/analysis';
import { installDomGlobals } from './dom';
import { analyzeHtml, analyzeUrl, BOT_UAS, installFetch, PageFetchError } from './analyze';
import { buildSnapshot, errorEntryOf, findingsOf, pageEntryOf, parseSnapshot, pathOf, type PageEntry, type Snapshot } from './snapshot';
import { diffSnapshots, hasRegression } from './diff';
import { planTickets } from './tickets';
import { diffMarkdown, formatDiff, formatResult, formatRun, red, ticketPlanMarkdown, yellow } from './format';
import { generateDiffHtml } from './diff-html';
import { generateSiteHtml, type HistoryPoint } from './site-html';
import { escapeHtml } from './html-base';
import { PAGE_REPORT_SCRIPT } from './page-script';
import { buildViewer } from './viewer';
import { l } from './labels';

declare const __GEO_VERSION__: string;
export const VERSION = typeof __GEO_VERSION__ !== 'undefined' ? __GEO_VERSION__ : 'dev';

const LANGS: Lang[] = ['de', 'en', 'fr', 'es', 'pt', 'it'];
const DEFAULT_SITEMAP_PAGES = 30;

const HELP = `geo ${VERSION} — GEO-Analyse auf dem HTML, das ein KI-Crawler bekommt

Analyse
  geo <url> [<url>…]              Seiten analysieren (example.com reicht, https:// wird ergänzt)
    --sitemap [n]                 zusätzlich bis n Seiten aus der Sitemap (Standard ${DEFAULT_SITEMAP_PAGES})
    --urls <datei>                Adressen aus einer Datei, eine pro Zeile
    --file <seite.html> --url <u> lokale HTML-Datei unter dieser Adresse analysieren
    --lang de|en|fr|es|pt|it      Sprache der Texte (Standard de)
    --bot gptbot|claudebot|…      Seite mit dem User-Agent eines KI-Crawlers holen
    --no-bot-probe                keine Firewall-Prüfung mit Crawler-User-Agents
    --json                        Analyse-Ergebnis(se) als JSON (GEOAnalysisResult)
    --findings                    nur die Befunde als JSON, mit Fingerprint und Zuständigkeit
    --snapshot <datei|->          Schnappschuss für Vergleich und Tickets schreiben
    --label <name>                Name des Laufs im Schnappschuss (z.B. staging, release-5.2)
    --report <datei.html>         HTML-Bericht wie in der Extension (eine Seite)
    --results <datei>             alle Analyse-Ergebnisse als JSON (für geo report page)
    --min <score>                 Exit-Code 1, wenn der Score (bei mehreren der Durchschnitt) darunter liegt
    --baseline <schnappschuss>    nach dem Lauf mit diesem Schnappschuss vergleichen
    --fail-on-regression          Exit-Code 1 bei Rückschritt gegenüber --baseline
    --delay <ms>                  Pause zwischen Seiten (Standard 300)

Vergleich
  geo diff <vorher.json> <nachher.json>
    --md | --json                 Markdown oder JSON statt Text
    --html <datei.html|->         Vergleichsbericht als HTML
    --fail-on-regression          Exit-Code 1, wenn etwas schlechter wurde

Berichte (HTML im Look der Extension)
  geo report site <schnappschuss.json>
    --baseline <vorher.json>      Abschnitt «Seit dem letzten Lauf»
    --history-dir <ordner>        Verlauf aus <ordner>/<lauf>/snapshot.json
    --run-href <muster>           Link pro Lauf im Verlauf, {run} wird ersetzt
    --page-href <muster>          Link pro Seite, {path} wird ersetzt (URL-kodiert)
    --diff-href <url>             Link auf den vollständigen Vergleich
    --out <datei|->               Ziel (Standard: stdout)
  geo report page <ergebnisse.json> <pfad>   Bericht einer Seite wie in der Extension
    --lang, --out                 wie oben; ergebnisse.json schreibt --results

Ansicht über alle Läufe
  geo viewer <history-ordner> <ziel-ordner>   statische HTML-Ansicht: Sites, Läufe, Seiten, Vergleiche
    --force                       auch vorhandene Seitenberichte und Vergleiche neu schreiben

Tickets
  geo tickets <schnappschuss.json>
    --baseline <vorher.json>      Veränderung seit diesem Lauf ins Ticket, behobene Befunde melden
    --owner editorial|dev         nur Befunde dieser Zuständigkeit
    --min-priority <n>            nur Befunde ab dieser Priorität
    --md                          Übersicht als Markdown statt JSON
`;

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

const defaultIo: Io = {
  out: (s) => process.stdout.write(s.endsWith('\n') ? s : `${s}\n`),
  err: (s) => process.stderr.write(s.endsWith('\n') ? s : `${s}\n`),
};

class UsageError extends Error {}

/** example.com → https://example.com; http(s) URLs pass through. */
export function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).href;
  } catch {
    throw new UsageError(`Keine gültige Adresse: ${input}`);
  }
}

function parseLang(value: string | undefined): Lang {
  const lang = (value ?? 'de').toLowerCase() as Lang;
  if (!LANGS.includes(lang)) throw new UsageError(`--lang: ${LANGS.join(', ')}`);
  return lang;
}

function readSnapshot(path: string): Snapshot {
  try {
    return parseSnapshot(readFileSync(path, 'utf8'), path);
  } catch (err) {
    throw new UsageError(err instanceof Error && 'code' in err ? `${path}: nicht gefunden` : (err as Error).message);
  }
}

function writeOut(path: string, content: string, io: Io): void {
  if (path === '-') io.out(content);
  else writeFileSync(path, content);
}

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  try {
    if (argv[0] === 'diff') return runDiff(argv.slice(1), io);
    if (argv[0] === 'tickets') return runTickets(argv.slice(1), io);
    if (argv[0] === 'report') return runReport(argv.slice(1), io);
    if (argv[0] === 'viewer') return runViewer(argv.slice(1), io);
    return await runAnalyze(argv[0] === 'analyze' ? argv.slice(1) : argv, io);
  } catch (err) {
    if (err instanceof UsageError || (err instanceof TypeError && 'code' in err)) {
      io.err(red(err.message));
      return 2;
    }
    throw err;
  }
}

async function runAnalyze(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      sitemap: { type: 'boolean' },
      urls: { type: 'string' },
      file: { type: 'string' },
      url: { type: 'string' },
      lang: { type: 'string' },
      bot: { type: 'string' },
      'bot-probe': { type: 'boolean', default: true },
      json: { type: 'boolean' },
      findings: { type: 'boolean' },
      snapshot: { type: 'string' },
      label: { type: 'string' },
      report: { type: 'string' },
      results: { type: 'string' },
      min: { type: 'string' },
      baseline: { type: 'string' },
      'fail-on-regression': { type: 'boolean' },
      delay: { type: 'string' },
    },
  });
  if (values.version) {
    io.out(VERSION);
    return 0;
  }
  // --sitemap takes an optional count: "--sitemap 50 example.com"
  let sitemapPages = 0;
  if (values.sitemap) {
    sitemapPages = DEFAULT_SITEMAP_PAGES;
    if (positionals.length > 1 && /^\d+$/.test(positionals[0])) sitemapPages = Number(positionals.shift());
  }
  if (values.help || (positionals.length === 0 && !values.file && !values.urls)) {
    io.out(HELP);
    return values.help ? 0 : 2;
  }

  const lang = parseLang(values.lang);
  setLang(lang);
  const userAgent = values.bot ? BOT_UAS[values.bot.toLowerCase()] : undefined;
  if (values.bot && !userAgent) throw new UsageError(`--bot: ${Object.keys(BOT_UAS).join(', ')}`);
  const min = values.min !== undefined ? Number(values.min) : undefined;
  if (min !== undefined && Number.isNaN(min)) throw new UsageError('--min: Zahl zwischen 0 und 30');
  const delay = values.delay !== undefined ? Number(values.delay) : 300;
  const baseline = values.baseline ? readSnapshot(values.baseline) : undefined;
  const options = { userAgent, botProbe: values['bot-probe'] };

  installDomGlobals();
  installFetch(userAgent);

  const results: GEOAnalysisResult[] = [];
  const entries: PageEntry[] = [];
  let source: Snapshot['source'] = 'urls';

  if (values.file) {
    if (!values.url) throw new UsageError('--file braucht --url (die Adresse, unter der die Seite liegen wird)');
    const url = normalizeInputUrl(values.url);
    const html = readFileSync(values.file, 'utf8');
    const result = await analyzeHtml({ requestedUrl: url, finalUrl: url, status: 200, html, xRobotsTag: null }, options);
    results.push(result);
    entries.push(pageEntryOf(result));
    source = 'file';
  } else {
    const urls = positionals.map(normalizeInputUrl);
    if (values.urls) {
      urls.push(
        ...readFileSync(values.urls, 'utf8')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith('#'))
          .map(normalizeInputUrl)
      );
    }
    if (sitemapPages > 0) {
      source = 'sitemap';
      const first = urls[0];
      const more = await discoverSitemapPages(new URL(first).origin, first, sitemapPages - urls.length, globalThis.fetch);
      urls.push(...more);
    }
    const seen = new Set<string>();
    const unique = urls.filter((u) => !seen.has(u) && seen.add(u));
    const many = unique.length > 1;
    for (const [i, url] of unique.entries()) {
      if (many) io.err(`[${i + 1}/${unique.length}] ${url}`);
      try {
        const result = await analyzeUrl(url, options);
        results.push(result);
        entries.push(pageEntryOf(result));
      } catch (err) {
        if (!(err instanceof PageFetchError)) throw err;
        entries.push(errorEntryOf(url, err.message, err.status || undefined));
        io.err(red(err.message));
      }
      if (many && delay > 0 && i < unique.length - 1) await new Promise((r) => setTimeout(r, delay));
    }
  }

  const snapshot = buildSnapshot({ version: VERSION, lang, source, pages: entries, label: values.label });

  if (values.snapshot) writeOut(values.snapshot, JSON.stringify(snapshot, null, 2), io);
  if (values.results) writeOut(values.results, JSON.stringify(results), io);
  if (values.report) {
    if (results.length !== 1) throw new UsageError('--report gilt für genau eine Seite');
    writeFileSync(values.report, standalonePageReport(results[0]));
  }

  if (values.json) io.out(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  else if (values.findings) io.out(JSON.stringify(results.flatMap((r) => findingsOf(r).map((f) => ({ url: r.url, ...f }))), null, 2));
  else if (values.snapshot !== '-') io.out(results.length === 1 && entries.length === 1 ? formatResult(results[0]) : formatRun(snapshot));

  let code = results.length === 0 ? 2 : 0;
  const score = results.length === 1 && entries.length === 1 ? results[0].totalScore : snapshot.summary.averageScore;
  if (min !== undefined && score !== null && score < min) {
    io.err(red(l('belowMin', { min })));
    code = Math.max(code, 1);
  }
  if (baseline) {
    const diff = diffSnapshots(baseline, snapshot);
    if (!values.json && !values.findings && values.snapshot !== '-') io.out(`\n${formatDiff(diff)}`);
    if (values['fail-on-regression'] && hasRegression(diff)) {
      io.err(red(l('regression')));
      code = Math.max(code, 1);
    }
  } else if (values['fail-on-regression']) {
    io.err(yellow('--fail-on-regression ohne --baseline: nichts zu vergleichen'));
  }
  return code;
}

function runDiff(argv: string[], io: Io): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      md: { type: 'boolean' },
      json: { type: 'boolean' },
      html: { type: 'string' },
      lang: { type: 'string' },
      nav: { type: 'string' },
      'page-href': { type: 'string' },
      'fail-on-regression': { type: 'boolean' },
    },
  });
  if (positionals.length !== 2) throw new UsageError('geo diff <vorher.json> <nachher.json>');
  const before = readSnapshot(positionals[0]);
  const after = readSnapshot(positionals[1]);
  setLang(values.lang ? parseLang(values.lang) : after.lang);
  const diff = diffSnapshots(before, after);
  if (values.html) {
    writeOut(values.html, generateDiffHtml(diff, { nav: navHtml(values.nav), pageHref: hrefTemplate(values['page-href'], 'path') }), io);
    if (values.html === '-') return 0;
  }
  if (values.json) io.out(JSON.stringify(diff, null, 2));
  else if (values.md) io.out(diffMarkdown(diff));
  else io.out(formatDiff(diff));
  if (values['fail-on-regression'] && hasRegression(diff)) {
    io.err(red(l('regression')));
    return 1;
  }
  return 0;
}

function runTickets(argv: string[], io: Io): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      baseline: { type: 'string' },
      owner: { type: 'string' },
      'min-priority': { type: 'string' },
      md: { type: 'boolean' },
    },
  });
  if (positionals.length !== 1) throw new UsageError('geo tickets <schnappschuss.json>');
  const owner = values.owner as 'editorial' | 'dev' | undefined;
  if (owner && owner !== 'editorial' && owner !== 'dev') throw new UsageError('--owner: editorial oder dev');
  const plan = planTickets(readSnapshot(positionals[0]), {
    baseline: values.baseline ? readSnapshot(values.baseline) : undefined,
    owner,
    minPriority: values['min-priority'] ? Number(values['min-priority']) : undefined,
  });
  io.out(values.md ? ticketPlanMarkdown(plan) : JSON.stringify(plan, null, 2));
  return 0;
}

// --nav '[{"label":"Sites","href":"/"},{"label":"example.ch"}]' → breadcrumb
function navHtml(json: string | undefined): string | undefined {
  if (!json) return undefined;
  let items: { label: string; href?: string }[];
  try {
    items = JSON.parse(json);
  } catch {
    throw new UsageError('--nav: JSON-Liste aus {label, href}');
  }
  return items
    .map((i) => (i.href ? `<a href="${escapeHtml(i.href)}">${escapeHtml(i.label)}</a>` : `<strong>${escapeHtml(i.label)}</strong>`))
    .join('<span>›</span>');
}

function hrefTemplate(template: string | undefined, key: string): ((value: string) => string) | undefined {
  return template ? (value) => template.split(`{${key}}`).join(encodeURIComponent(value)) : undefined;
}

// Runs of a site: <dir>/<run>/snapshot.json, oldest first by creation time
function historyOf(dir: string, current: Snapshot, runHref?: (run: string) => string): HistoryPoint[] {
  if (!existsSync(dir)) return [];
  const points: HistoryPoint[] = [];
  for (const run of readdirSync(dir)) {
    const file = join(dir, run, 'snapshot.json');
    if (!existsSync(file)) continue;
    let snap: Snapshot;
    try {
      snap = parseSnapshot(readFileSync(file, 'utf8'), file);
    } catch {
      continue;
    }
    points.push({
      createdAt: snap.createdAt,
      ...(snap.label ? { label: snap.label } : {}),
      averageScore: snap.summary.averageScore,
      analyzed: snap.summary.analyzed,
      ...(runHref ? { href: runHref(run) } : {}),
      current: snap.createdAt === current.createdAt,
    });
  }
  return points.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function runReport(argv: string[], io: Io): number {
  const kind = argv[0];
  const { values, positionals } = parseArgs({
    args: argv.slice(1),
    allowPositionals: true,
    options: {
      baseline: { type: 'string' },
      'history-dir': { type: 'string' },
      'run-href': { type: 'string' },
      'page-href': { type: 'string' },
      'diff-href': { type: 'string' },
      nav: { type: 'string' },
      lang: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const out = values.out ?? '-';

  if (kind === 'site') {
    if (positionals.length !== 1) throw new UsageError('geo report site <schnappschuss.json>');
    const snapshot = readSnapshot(positionals[0]);
    setLang(values.lang ? parseLang(values.lang) : snapshot.lang);
    const baseline = values.baseline ? readSnapshot(values.baseline) : undefined;
    const html = generateSiteHtml({
      snapshot,
      diff: baseline ? diffSnapshots(baseline, snapshot) : undefined,
      history: values['history-dir'] ? historyOf(values['history-dir'], snapshot, hrefTemplate(values['run-href'], 'run')) : undefined,
      pageHref: hrefTemplate(values['page-href'], 'path'),
      diffHref: values['diff-href'],
      nav: navHtml(values.nav),
    });
    writeOut(out, html, io);
    return 0;
  }

  if (kind === 'page') {
    if (positionals.length !== 2) throw new UsageError('geo report page <ergebnisse.json> <pfad>');
    setLang(parseLang(values.lang));
    let results: GEOAnalysisResult[];
    try {
      results = JSON.parse(readFileSync(positionals[0], 'utf8'));
    } catch {
      throw new UsageError(`${positionals[0]}: keine Ergebnis-Datei (geo … --results)`);
    }
    const result = results.find((r) => pathOf(r.url) === positionals[1]);
    if (!result) throw new UsageError(`${positionals[1]}: nicht in ${positionals[0]}`);
    const html = standalonePageReport(result, navHtml(values.nav));
    writeOut(out, html, io);
    return 0;
  }

  throw new UsageError('geo report site|page …');
}

/** The extension's page report with the viewer behaviour inline and an optional breadcrumb on top. */
export function standalonePageReport(result: GEOAnalysisResult, nav?: string): string {
  let html = generateHtmlReport(result).replace(/<\/body>/, `${PAGE_REPORT_SCRIPT}</body>`);
  if (nav) {
    const bar = nav
      .replace(/<a /g, '<a style="color:#fff;text-decoration:none;opacity:.85" ')
      .replace(/<span>/g, '<span style="color:#fff;opacity:.6">')
      .replace(/<strong>/g, '<strong style="color:#fff;word-break:break-all">');
    html = html.replace(
      /<body([^>]*)>/,
      `<body$1><nav class="geo-nav" style="font:600 13px Inter,system-ui,sans-serif;padding:10px 24px;background:#0f766e;display:flex;gap:6px;flex-wrap:wrap">${bar}</nav>`
    );
  }
  return html;
}

function runViewer(argv: string[], io: Io): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { force: { type: 'boolean' } },
  });
  if (positionals.length !== 2) throw new UsageError('geo viewer <history-ordner> <ziel-ordner>');
  const stats = buildViewer(positionals[0], positionals[1], (result, nav) => standalonePageReport(result, nav), { force: values.force });
  io.out(`${stats.sites} Sites, ${stats.runs} Läufe, ${stats.written} Dateien geschrieben → ${join(positionals[1], 'index.html')}`);
  return 0;
}
