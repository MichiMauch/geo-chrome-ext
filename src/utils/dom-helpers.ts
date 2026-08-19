import type {
  HeadingData,
  ListData,
  LinkData,
  MetaData,
  SchemaData,
  AuthorData,
  DateData,
  SemanticElements,
  PageData,
  LlmsTxtData,
  RobotsTxtData,
  ImageData,
  OpenGraphData,
  TwitterCardData,
  RobotsMetaData,
  ViewportData,
  CanonicalData,
} from '../types/analysis';
import { GEO_CONFIG } from '../config/geo-config';
import { extractTextDates } from './text-dates';

// Extracts everything the analyzers need. Defaults work on the live page;
// the sitemap batch passes a DOMParser document + its URL instead, plus the
// domain-level llms.txt/robots.txt data fetched once per batch.
export async function extractPageData(
  doc: Document = document,
  pageUrl: string = window.location.href,
  domainData?: { llmsTxt: LlmsTxtData; robotsTxt: RobotsTxtData }
): Promise<PageData> {
  // The batch reuses the domain's robots.txt, but the allow/disallow verdict is
  // per URL path, so it gets re-evaluated for this page.
  const [llmsTxt, robotsTxt] = domainData
    ? [domainData.llmsTxt, robotsForPath(domainData.robotsTxt, pageUrl)]
    : await Promise.all([
        checkLlmsTxt(),
        checkRobotsTxt(undefined, originOf(pageUrl), robotsPathFromUrl(pageUrl)),
      ]);

  return {
    url: pageUrl,
    headings: extractHeadings(doc),
    paragraphs: extractParagraphs(doc),
    lists: extractLists(doc),
    links: extractLinks(doc, pageUrl),
    meta: extractMetaData(doc),
    schema: extractSchemaData(doc),
    author: extractAuthorInfo(doc),
    dates: extractDates(doc),
    semanticElements: extractSemanticElements(doc),
    llmsTxt,
    robotsTxt,
    faqQuestions: extractFaqQuestions(doc),
    images: extractImages(doc),
    openGraph: extractOpenGraph(doc),
    twitterCard: extractTwitterCard(doc),
    robotsMeta: extractRobotsMeta(doc),
    viewport: extractViewport(doc),
    canonical: extractCanonical(doc, pageUrl),
  };
}

export function extractCanonical(doc: Document = document, baseUrl: string = window.location.href): CanonicalData {
  const link = doc.querySelector('link[rel="canonical"]');
  const raw = link?.getAttribute('href')?.trim() || '';
  if (!raw) return { href: null };
  try {
    // Resolve relative hrefs against the page; an unparseable href is as
    // good as no canonical at all.
    return { href: new URL(raw, baseUrl).href };
  } catch {
    return { href: null };
  }
}

export function extractViewport(doc: Document = document): ViewportData {
  const meta = doc.querySelector('meta[name="viewport"]');
  const rawContent = meta?.getAttribute('content') ?? null;
  if (!rawContent) {
    return {
      hasViewport: false,
      hasDeviceWidth: false,
      userScalableNo: false,
      rawContent: null,
    };
  }
  const normalized = rawContent.toLowerCase().replace(/\s+/g, '');
  return {
    hasViewport: true,
    hasDeviceWidth: /width=device-width/.test(normalized),
    userScalableNo: /user-scalable=(no|0)/.test(normalized),
    rawContent,
  };
}

export function extractImages(doc: Document = document): ImageData[] {
  const images: ImageData[] = [];
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!src) return;
    const hasAltAttribute = img.hasAttribute('alt');
    const alt = hasAltAttribute ? (img.getAttribute('alt') ?? '') : null;
    images.push({ src, alt, hasAltAttribute });
  });
  return images;
}

function getMetaContent(selectors: string[], doc: Document): string | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const content = el?.getAttribute('content');
    if (content !== null && content !== undefined && content.trim().length > 0) {
      return content;
    }
  }
  return null;
}

export function extractOpenGraph(doc: Document = document): OpenGraphData {
  return {
    title: getMetaContent(['meta[property="og:title"]', 'meta[name="og:title"]'], doc),
    description: getMetaContent(['meta[property="og:description"]', 'meta[name="og:description"]'], doc),
    image: getMetaContent(['meta[property="og:image"]', 'meta[name="og:image"]'], doc),
    url: getMetaContent(['meta[property="og:url"]', 'meta[name="og:url"]'], doc),
    type: getMetaContent(['meta[property="og:type"]', 'meta[name="og:type"]'], doc),
  };
}

export function extractTwitterCard(doc: Document = document): TwitterCardData {
  return {
    card: getMetaContent(['meta[name="twitter:card"]', 'meta[property="twitter:card"]'], doc),
    title: getMetaContent(['meta[name="twitter:title"]', 'meta[property="twitter:title"]'], doc),
    description: getMetaContent(['meta[name="twitter:description"]', 'meta[property="twitter:description"]'], doc),
    image: getMetaContent(['meta[name="twitter:image"]', 'meta[property="twitter:image"]'], doc),
  };
}

export function extractRobotsMeta(doc: Document = document): RobotsMetaData {
  // Check both name="robots" and name="googlebot"; merge content tokens.
  const tokens: string[] = [];
  let rawContent: string | null = null;
  doc
    .querySelectorAll('meta[name="robots"], meta[name="googlebot"]')
    .forEach((meta) => {
      const content = meta.getAttribute('content');
      if (!content) return;
      if (rawContent === null) rawContent = content;
      content
        .toLowerCase()
        .split(',')
        .map((s) => s.trim())
        .forEach((t) => tokens.push(t));
    });

  return {
    hasNoIndex: tokens.includes('noindex') || tokens.includes('none'),
    hasNoFollow: tokens.includes('nofollow') || tokens.includes('none'),
    hasNoArchive: tokens.includes('noarchive'),
    hasNoSnippet: tokens.includes('nosnippet'),
    rawContent,
  };
}

export function extractHeadings(doc: Document = document): HeadingData[] {
  const headings: HeadingData[] = [];
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const text = h.textContent?.trim() || '';
    if (text.length > 0) {
      headings.push({
        level: parseInt(h.tagName[1]),
        text,
      });
    }
  });
  return headings;
}

export function extractParagraphs(doc: Document = document): string[] {
  const paragraphs: string[] = [];
  const mainContent =
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc.body;

  const seen = new Set<string>();
  const pushIfGood = (text: string) => {
    const t = text.trim().replace(/\s+/g, ' ');
    if (t.length > 30 && !seen.has(t)) {
      seen.add(t);
      paragraphs.push(t);
    }
  };

  mainContent.querySelectorAll('p').forEach((p) => {
    pushIfGood(p.textContent || '');
  });

  // Also include FAQ / accordion answer containers which often use div/dd.
  // Query globally (not scoped to mainContent) because FAQ blocks are often
  // rendered outside of <article>/<main>.
  const answerSelectors = [
    '[itemprop="text"]',
    '[itemprop="acceptedAnswer"]',
    'dd',
    '[class*="faq-answer" i]',
    '[class*="accordion-content" i]',
    '[class*="accordion-body" i]',
    'details > :not(summary)',
  ];
  doc
    .querySelectorAll(answerSelectors.join(','))
    .forEach((el) => pushIfGood(el.textContent || ''));

  return paragraphs;
}

export function extractFaqQuestions(doc: Document = document): string[] {
  const questions = new Set<string>();
  const add = (text: string | null | undefined) => {
    const t = (text || '').trim().replace(/\s+/g, ' ');
    if (t.length >= 5 && t.length <= 300) questions.add(t);
  };

  // Microdata: schema.org Question
  doc
    .querySelectorAll('[itemscope][itemtype*="schema.org/Question" i]')
    .forEach((q) => {
      const nameEl = q.querySelector('[itemprop="name"]');
      add(nameEl?.textContent || q.textContent);
    });

  // Within a FAQPage container
  doc
    .querySelectorAll('[itemscope][itemtype*="FAQPage" i]')
    .forEach((faq) => {
      faq.querySelectorAll('[itemprop="name"]').forEach((n) =>
        add(n.textContent)
      );
    });

  // <details><summary> accordions
  doc.querySelectorAll('details > summary').forEach((s) => {
    const t = s.textContent?.trim() || '';
    if (t.endsWith('?')) add(t);
  });

  // Common FAQ class patterns
  const classSelectors = [
    '[class*="faq-question" i]',
    '[class*="faq__question" i]',
    '[class*="accordion-question" i]',
    '[class*="accordion__title" i]',
    '[class*="accordion-header" i]',
  ];
  doc.querySelectorAll(classSelectors.join(',')).forEach((el) => {
    add(el.textContent);
  });

  return [...questions];
}

export function extractLists(doc: Document = document): ListData[] {
  const lists: ListData[] = [];
  doc.querySelectorAll('ul, ol').forEach((list) => {
    const items = Array.from(list.querySelectorAll(':scope > li'))
      .slice(0, 10)
      .map((li) => li.textContent?.trim() || '')
      .filter((text) => text.length > 0);

    if (items.length > 0) {
      lists.push({
        type: list.tagName.toLowerCase() as 'ul' | 'ol',
        itemCount: list.querySelectorAll(':scope > li').length,
        items,
      });
    }
  });
  return lists;
}

export function extractLinks(doc: Document = document, baseUrl: string = window.location.href): LinkData[] {
  const links: LinkData[] = [];
  const base = new URL(baseUrl);
  const currentHost = base.hostname;

  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const text = a.textContent?.trim() || '';

    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      let isExternal = false;
      try {
        const url = new URL(href, base.href);
        isExternal = url.hostname !== currentHost;
      } catch {
        // Relative URL, not external
      }

      links.push({ href, text, isExternal });
    }
  });

  return links;
}

export function extractMetaData(doc: Document = document): MetaData {
  const getMeta = (name: string): string | null => {
    const byName = doc.querySelector(`meta[name="${name}"]`);
    const byProperty = doc.querySelector(`meta[property="${name}"]`);
    return (
      byName?.getAttribute('content') ||
      byProperty?.getAttribute('content') ||
      null
    );
  };

  return {
    title: doc.title,
    description: getMeta('description') || '',
    author: getMeta('author') || '',
    publishDate:
      getMeta('article:published_time') ||
      getMeta('datePublished') ||
      getMeta('date'),
    modifiedDate:
      getMeta('article:modified_time') || getMeta('dateModified'),
    ogType: getMeta('og:type'),
  };
}

export function extractSchemaData(doc: Document = document): SchemaData[] {
  const schemas: SchemaData[] = [];

  doc
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((script) => {
      try {
        const content = script.textContent || '';
        const data = JSON.parse(content);

        if (Array.isArray(data)) {
          schemas.push(...data);
        } else if (data['@graph']) {
          schemas.push(...data['@graph']);
        } else {
          schemas.push(data);
        }
      } catch {
        // Ignore parse errors
      }
    });

  schemas.push(...extractMicrodata(doc));
  schemas.push(...extractRdfa(doc));

  return schemas;
}

function typeFromUrl(url: string | null): string | null {
  if (!url) return null;
  // schema.org/FAQPage -> FAQPage
  const m = url.match(/schema\.org\/([A-Za-z]+)/);
  return m ? m[1] : null;
}

export function extractMicrodata(doc: Document = document): SchemaData[] {
  const results: SchemaData[] = [];
  const seen = new Set<Element>();
  doc.querySelectorAll('[itemscope][itemtype]').forEach((el) => {
    const type = typeFromUrl(el.getAttribute('itemtype'));
    if (!type || seen.has(el)) return;
    seen.add(el);
    results.push({ '@type': type });
    // Additionally, for top-level scopes, build a richer item (name, author, etc.)
    if (!el.parentElement?.closest('[itemscope][itemtype]')) {
      results.push(parseMicrodataItem(el));
    }
  });
  return results;
}

function parseMicrodataItem(el: Element): SchemaData {
  const type = typeFromUrl(el.getAttribute('itemtype')) || 'Thing';
  const item: SchemaData = { '@type': type };
  const props = el.querySelectorAll('[itemprop]');
  props.forEach((p) => {
    // Skip props that belong to a nested item
    const nearestScope = p.parentElement?.closest('[itemscope]');
    if (nearestScope && nearestScope !== el && el.contains(nearestScope)) {
      if (nearestScope !== p) return;
    }
    const name = p.getAttribute('itemprop');
    if (!name) return;
    let value: unknown;
    if (p.hasAttribute('itemscope')) {
      value = parseMicrodataItem(p);
    } else if (p.tagName === 'META') {
      value = p.getAttribute('content') || '';
    } else if (p.tagName === 'A' || p.tagName === 'LINK') {
      value = p.getAttribute('href') || p.textContent?.trim() || '';
    } else if (p.tagName === 'IMG') {
      value = p.getAttribute('src') || '';
    } else if (p.tagName === 'TIME') {
      value = p.getAttribute('datetime') || p.textContent?.trim() || '';
    } else {
      value = p.textContent?.trim() || '';
    }
    const existing = (item as Record<string, unknown>)[name];
    if (existing === undefined) {
      (item as Record<string, unknown>)[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      (item as Record<string, unknown>)[name] = [existing, value];
    }
  });
  return item;
}

export function extractRdfa(doc: Document = document): SchemaData[] {
  const results: SchemaData[] = [];
  doc.querySelectorAll('[typeof]').forEach((el) => {
    const raw = el.getAttribute('typeof') || '';
    // Resolve type; may look like "schema:FAQPage" or just "FAQPage"
    const last = raw.split(/[\s:/]/).pop();
    if (!last) return;
    if (el.parentElement?.closest('[typeof]')) return;
    results.push({ '@type': last });
  });
  return results;
}

// Author and publisher come in every shape JSON-LD allows: a plain name, a
// node, an array of either, or an @id reference into @graph (what Yoast and
// the Drupal schema modules emit). Flattens a value to the nodes it holds.
export function flattenSchemaRefs(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenSchemaRefs);
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

function indexSchemasById(schemas: SchemaData[]): Map<string, SchemaData> {
  const byId = new Map<string, SchemaData>();
  for (const schema of schemas) {
    const id = schema['@id'];
    if (typeof id === 'string' && id) byId.set(id, schema);
  }
  return byId;
}

// Resolves a name out of an author/publisher value, following @id references
// into @graph. `seen` stops a reference cycle from recursing forever.
function resolveSchemaName(
  value: unknown,
  byId: Map<string, SchemaData>,
  seen: Set<string> = new Set()
): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // A bare string is normally the name itself, but it can also be an @id
    const referenced = byId.get(trimmed);
    if (referenced && !seen.has(trimmed)) {
      seen.add(trimmed);
      return resolveSchemaName(referenced, byId, seen);
    }
    // An unresolvable URL or fragment is a broken reference, not a name
    if (/^(https?:\/\/|#)/i.test(trimmed)) return null;
    return trimmed;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const name = resolveSchemaName(entry, byId, seen);
      if (name) return name;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (typeof node.name === 'string' && node.name.trim()) return node.name.trim();
    const id = node['@id'];
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id);
      const referenced = byId.get(id);
      if (referenced) return resolveSchemaName(referenced, byId, seen);
    }
  }

  return null;
}

export function extractAuthorInfo(doc: Document = document): AuthorData | null {
  // 1. Try Schema.org — a credited author outranks everything else
  const schemas = extractSchemaData(doc);
  const byId = indexSchemasById(schemas);

  for (const schema of schemas) {
    const name = resolveSchemaName(schema.author, byId);
    if (name) return { name, source: 'schema' };
  }

  // 2. Try meta tags
  const metaAuthor =
    doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
    doc
      .querySelector('meta[property="article:author"]')
      ?.getAttribute('content');
  if (metaAuthor?.trim()) {
    return { name: metaAuthor.trim(), source: 'meta' };
  }

  // 3. Schema.org publisher — an organization behind the content still makes
  // it attributable, which is what the criterion asks for. Standalone
  // Organization nodes don't count: nearly every site emits one.
  for (const schema of schemas) {
    const name = resolveSchemaName(schema.publisher, byId);
    if (name) return { name, source: 'publisher' };
  }

  // 4. Try DOM patterns
  const authorSelectors = [
    '[class*="author"]',
    '[class*="byline"]',
    '[rel="author"]',
    '[itemprop="author"]',
  ];

  for (const selector of authorSelectors) {
    const element = doc.querySelector(selector);
    const text = element?.textContent?.trim();
    if (text && text.length > 2 && text.length < 100) {
      // Clean up common prefixes
      const cleaned = text
        .replace(/^(von|by|author:|geschrieben von)\s*/i, '')
        .trim();
      if (cleaned.length > 2) {
        return { name: cleaned, source: 'dom' };
      }
    }
  }

  return null;
}

export function extractDates(doc: Document = document): DateData[] {
  const dates: DateData[] = [];

  // 1. Time elements
  doc.querySelectorAll('time[datetime]').forEach((time) => {
    const datetime = time.getAttribute('datetime');
    if (datetime) {
      try {
        const date = new Date(datetime);
        if (!isNaN(date.getTime())) {
          dates.push({
            date,
            formatted: time.textContent?.trim() || datetime,
            source: 'time-element',
          });
        }
      } catch {
        // Ignore invalid dates
      }
    }
  });

  // 2. Meta tags
  const metaDateSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="datePublished"]',
    'meta[name="date"]',
  ];

  for (const selector of metaDateSelectors) {
    const meta = doc.querySelector(selector);
    const content = meta?.getAttribute('content');
    if (content) {
      try {
        const date = new Date(content);
        if (!isNaN(date.getTime())) {
          dates.push({
            date,
            formatted: content,
            source: 'meta',
          });
          break; // Only take first valid meta date
        }
      } catch {
        // Ignore
      }
    }
  }

  // 3. Schema.org dates
  const schemas = extractSchemaData(doc);
  for (const schema of schemas) {
    const dateStr = schema.datePublished || schema.dateModified;
    if (dateStr && typeof dateStr === 'string') {
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          dates.push({
            date,
            formatted: dateStr,
            source: 'schema',
          });
        }
      } catch {
        // Ignore
      }
    }
  }

  // 4. Visible text dates ("Last updated: August 11, 2026") — no markup, but
  // AI crawlers read them, so a page shouldn't lose the freshness point for it.
  dates.push(...extractTextDates(doc));

  return dates;
}

export function extractSemanticElements(doc: Document = document): SemanticElements {
  return {
    hasArticle: doc.querySelector('article') !== null,
    hasMain: doc.querySelector('main') !== null,
    hasNav: doc.querySelector('nav') !== null,
    hasAside: doc.querySelector('aside') !== null,
    hasHeader: doc.querySelector('header') !== null,
    hasFooter: doc.querySelector('footer') !== null,
    hasSection: doc.querySelector('section') !== null,
  };
}

export function isWithinLastYear(date: Date): boolean {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return date >= oneYearAgo;
}

// Fetches a plain-text file and rejects the HTML a SPA or a custom 404 page
// serves for any unknown path — otherwise every SPA would look like it had one.
async function fetchPlainTextFile(url: string): Promise<{ length: number } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const content = await response.text();
    const looksLikeHtml = /^\s*<!DOCTYPE|^\s*<html|^\s*<head/i.test(content);
    if (looksLikeHtml || content.trim().length === 0) return null;

    return { length: content.length };
  } catch {
    return null;
  }
}

export async function checkLlmsTxt(origin: string = window.location.origin): Promise<LlmsTxtData> {
  const indexUrl = `${origin}/llms.txt`;
  const fullUrl = `${origin}/llms-full.txt`;

  const [index, full] = await Promise.all([
    fetchPlainTextFile(indexUrl),
    fetchPlainTextFile(fullUrl),
  ]);

  return {
    exists: index !== null,
    ...(index ? { url: indexUrl, hasContent: true, contentLength: index.length } : {}),
    fullExists: full !== null,
    ...(full ? { fullUrl, fullContentLength: full.length } : {}),
  };
}

export async function checkRobotsTxt(
  bots?: readonly string[],
  origin: string = window.location.origin,
  path: string = robotsPathFromUrl(window.location.href)
): Promise<RobotsTxtData> {
  const targetBots = bots ?? GEO_CONFIG.machineReadability.aiBots;
  const allAllowed = (exists: boolean, url?: string): RobotsTxtData => ({
    exists,
    url,
    path,
    allowedBots: Object.fromEntries(targetBots.map((b) => [b, true])),
    blockedBots: [],
    totalChecked: targetBots.length,
  });

  try {
    const url = `${origin}/robots.txt`;
    const response = await fetch(url);

    // 404 / 5xx → per RFC 9309 everything is allowed
    if (!response.ok) return allAllowed(false);

    const content = await response.text();
    // False-Positive-Schutz (SPAs mit HTML-404)
    const looksLikeHtml = /^\s*<!DOCTYPE|^\s*<html|^\s*<head/i.test(content);
    if (looksLikeHtml || content.trim().length === 0) return allAllowed(false);

    return parseRobotsTxt(content, targetBots, url, path);
  } catch {
    return allAllowed(false);
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return window.location.origin;
  }
}

/**
 * The part of a URL robots.txt rules are matched against: path plus query,
 * per RFC 9309. Falls back to the site root for unparseable URLs.
 */
export function robotsPathFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || '/') + u.search;
  } catch {
    return '/';
  }
}

/**
 * Re-evaluates an already fetched robots.txt against another URL's path. The
 * sitemap batch fetches robots.txt once per domain but analyzes many URLs, and
 * a rule like `Disallow: /blog/` only applies to some of them.
 */
export function robotsForPath(robotsTxt: RobotsTxtData, pageUrl: string): RobotsTxtData {
  const path = robotsPathFromUrl(pageUrl);
  if (!robotsTxt.exists || !robotsTxt.content || robotsTxt.path === path) {
    return robotsTxt.path === path ? robotsTxt : { ...robotsTxt, path };
  }
  return parseRobotsTxt(
    robotsTxt.content,
    Object.keys(robotsTxt.allowedBots),
    robotsTxt.url,
    path
  );
}

/**
 * Parses robots.txt and returns which of the given bots may fetch `path`.
 * Rules: a bot-specific block beats the `*` fallback; within a block the
 * longest matching rule wins (RFC 9309), Allow winning ties. `*` and `$` in
 * rule paths are honored.
 */
export function parseRobotsTxt(
  content: string,
  bots: readonly string[],
  url?: string,
  path: string = '/'
): RobotsTxtData {
  const blocks = parseBlocks(content);

  const allowedBots: Record<string, boolean> = {};
  const blockedBots: string[] = [];

  for (const bot of bots) {
    const lower = bot.toLowerCase();
    // A robots.txt may split rules for one bot across several groups; RFC 9309
    // treats them as one. Any bot-specific group at all suppresses the `*`
    // fallback, even when the matching rule lives in another of its groups.
    const specific = blocks.filter((b) => b.agents.includes(lower));
    const relevant = specific.length > 0 ? specific : blocks.filter((b) => b.agents.includes('*'));
    const rules = relevant.flatMap((b) => b.rules);
    const allowed = !isPathBlocked(rules, path);
    allowedBots[bot] = allowed;
    if (!allowed) blockedBots.push(bot);
  }

  return {
    exists: true,
    url,
    path,
    content,
    allowedBots,
    blockedBots,
    totalChecked: bots.length,
  };
}

interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
}

interface RobotsBlock {
  agents: string[]; // lowercased user-agent names
  rules: RobotsRule[];
}

function parseBlocks(content: string): RobotsBlock[] {
  const blocks: RobotsBlock[] = [];
  let current: RobotsBlock | null = null;
  let lastWasAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      lastWasAgent = false;
      continue;
    }

    const colon = line.indexOf(':');
    if (colon < 0) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines group into one block
      if (!current || !lastWasAgent) {
        if (current) blocks.push(current);
        current = { agents: [], rules: [] };
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'disallow' || field === 'allow') {
      if (current) {
        current.rules.push({ type: field, path: value });
      }
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  if (current) blocks.push(current);

  return blocks;
}

function isPathBlocked(rules: RobotsRule[], path: string): boolean {
  // RFC 9309: the most specific (longest) matching rule decides; Allow wins a
  // tie. No matching rule at all means the path is allowed.
  let best: { type: 'allow' | 'disallow'; length: number } | null = null;

  for (const rule of rules) {
    // `Disallow:` with an empty value imposes no restriction.
    if (rule.path === '') continue;
    if (!robotsRuleMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (
      !best ||
      length > best.length ||
      (length === best.length && rule.type === 'allow')
    ) {
      best = { type: rule.type, length };
    }
  }

  return best?.type === 'disallow';
}

function robotsRuleMatches(pattern: string, path: string): boolean {
  // `$` anchors the rule to the end of the path, `*` matches any sequence.
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  try {
    return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path);
  } catch {
    // A pattern we cannot compile must not silently block the page.
    return false;
  }
}
