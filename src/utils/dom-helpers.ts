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

export async function extractPageData(): Promise<PageData> {
  const [llmsTxt, robotsTxt] = await Promise.all([
    checkLlmsTxt(),
    checkRobotsTxt(),
  ]);

  return {
    url: window.location.href,
    headings: extractHeadings(),
    paragraphs: extractParagraphs(),
    lists: extractLists(),
    links: extractLinks(),
    meta: extractMetaData(),
    schema: extractSchemaData(),
    author: extractAuthorInfo(),
    dates: extractDates(),
    semanticElements: extractSemanticElements(),
    llmsTxt,
    robotsTxt,
    faqQuestions: extractFaqQuestions(),
    images: extractImages(),
    openGraph: extractOpenGraph(),
    twitterCard: extractTwitterCard(),
    robotsMeta: extractRobotsMeta(),
    viewport: extractViewport(),
    canonical: extractCanonical(),
  };
}

export function extractCanonical(): CanonicalData {
  const link = document.querySelector('link[rel="canonical"]');
  const raw = link?.getAttribute('href')?.trim() || '';
  if (!raw) return { href: null };
  try {
    // Resolve relative hrefs against the page; an unparseable href is as
    // good as no canonical at all.
    return { href: new URL(raw, window.location.href).href };
  } catch {
    return { href: null };
  }
}

export function extractViewport(): ViewportData {
  const meta = document.querySelector('meta[name="viewport"]');
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

export function extractImages(): ImageData[] {
  const images: ImageData[] = [];
  document.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!src) return;
    const hasAltAttribute = img.hasAttribute('alt');
    const alt = hasAltAttribute ? (img.getAttribute('alt') ?? '') : null;
    images.push({ src, alt, hasAltAttribute });
  });
  return images;
}

function getMetaContent(selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const content = el?.getAttribute('content');
    if (content !== null && content !== undefined && content.trim().length > 0) {
      return content;
    }
  }
  return null;
}

export function extractOpenGraph(): OpenGraphData {
  return {
    title: getMetaContent(['meta[property="og:title"]', 'meta[name="og:title"]']),
    description: getMetaContent(['meta[property="og:description"]', 'meta[name="og:description"]']),
    image: getMetaContent(['meta[property="og:image"]', 'meta[name="og:image"]']),
    url: getMetaContent(['meta[property="og:url"]', 'meta[name="og:url"]']),
    type: getMetaContent(['meta[property="og:type"]', 'meta[name="og:type"]']),
  };
}

export function extractTwitterCard(): TwitterCardData {
  return {
    card: getMetaContent(['meta[name="twitter:card"]', 'meta[property="twitter:card"]']),
    title: getMetaContent(['meta[name="twitter:title"]', 'meta[property="twitter:title"]']),
    description: getMetaContent(['meta[name="twitter:description"]', 'meta[property="twitter:description"]']),
    image: getMetaContent(['meta[name="twitter:image"]', 'meta[property="twitter:image"]']),
  };
}

export function extractRobotsMeta(): RobotsMetaData {
  // Check both name="robots" and name="googlebot"; merge content tokens.
  const tokens: string[] = [];
  let rawContent: string | null = null;
  document
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

export function extractHeadings(): HeadingData[] {
  const headings: HeadingData[] = [];
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
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

export function extractParagraphs(): string[] {
  const paragraphs: string[] = [];
  const mainContent =
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.body;

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
  document
    .querySelectorAll(answerSelectors.join(','))
    .forEach((el) => pushIfGood(el.textContent || ''));

  return paragraphs;
}

export function extractFaqQuestions(): string[] {
  const questions = new Set<string>();
  const add = (text: string | null | undefined) => {
    const t = (text || '').trim().replace(/\s+/g, ' ');
    if (t.length >= 5 && t.length <= 300) questions.add(t);
  };

  // Microdata: schema.org Question
  document
    .querySelectorAll('[itemscope][itemtype*="schema.org/Question" i]')
    .forEach((q) => {
      const nameEl = q.querySelector('[itemprop="name"]');
      add(nameEl?.textContent || q.textContent);
    });

  // Within a FAQPage container
  document
    .querySelectorAll('[itemscope][itemtype*="FAQPage" i]')
    .forEach((faq) => {
      faq.querySelectorAll('[itemprop="name"]').forEach((n) =>
        add(n.textContent)
      );
    });

  // <details><summary> accordions
  document.querySelectorAll('details > summary').forEach((s) => {
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
  document.querySelectorAll(classSelectors.join(',')).forEach((el) => {
    add(el.textContent);
  });

  return [...questions];
}

export function extractLists(): ListData[] {
  const lists: ListData[] = [];
  document.querySelectorAll('ul, ol').forEach((list) => {
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

export function extractLinks(): LinkData[] {
  const links: LinkData[] = [];
  const currentHost = window.location.hostname;

  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const text = a.textContent?.trim() || '';

    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      let isExternal = false;
      try {
        const url = new URL(href, window.location.origin);
        isExternal = url.hostname !== currentHost;
      } catch {
        // Relative URL, not external
      }

      links.push({ href, text, isExternal });
    }
  });

  return links;
}

export function extractMetaData(): MetaData {
  const getMeta = (name: string): string | null => {
    const byName = document.querySelector(`meta[name="${name}"]`);
    const byProperty = document.querySelector(`meta[property="${name}"]`);
    return (
      byName?.getAttribute('content') ||
      byProperty?.getAttribute('content') ||
      null
    );
  };

  return {
    title: document.title,
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

export function extractSchemaData(): SchemaData[] {
  const schemas: SchemaData[] = [];

  document
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

  schemas.push(...extractMicrodata());
  schemas.push(...extractRdfa());

  return schemas;
}

function typeFromUrl(url: string | null): string | null {
  if (!url) return null;
  // schema.org/FAQPage -> FAQPage
  const m = url.match(/schema\.org\/([A-Za-z]+)/);
  return m ? m[1] : null;
}

export function extractMicrodata(): SchemaData[] {
  const results: SchemaData[] = [];
  const seen = new Set<Element>();
  document.querySelectorAll('[itemscope][itemtype]').forEach((el) => {
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

export function extractRdfa(): SchemaData[] {
  const results: SchemaData[] = [];
  document.querySelectorAll('[typeof]').forEach((el) => {
    const raw = el.getAttribute('typeof') || '';
    // Resolve type; may look like "schema:FAQPage" or just "FAQPage"
    const last = raw.split(/[\s:/]/).pop();
    if (!last) return;
    if (el.parentElement?.closest('[typeof]')) return;
    results.push({ '@type': last });
  });
  return results;
}

export function extractAuthorInfo(): AuthorData | null {
  // 1. Try Schema.org
  const schemas = extractSchemaData();
  for (const schema of schemas) {
    if (schema.author) {
      const authorName =
        typeof schema.author === 'string'
          ? schema.author
          : schema.author.name;
      if (authorName) {
        return { name: authorName, source: 'schema' };
      }
    }
  }

  // 2. Try meta tags
  const metaAuthor =
    document.querySelector('meta[name="author"]')?.getAttribute('content') ||
    document
      .querySelector('meta[property="article:author"]')
      ?.getAttribute('content');
  if (metaAuthor) {
    return { name: metaAuthor, source: 'meta' };
  }

  // 3. Try DOM patterns
  const authorSelectors = [
    '[class*="author"]',
    '[class*="byline"]',
    '[rel="author"]',
    '[itemprop="author"]',
  ];

  for (const selector of authorSelectors) {
    const element = document.querySelector(selector);
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

export function extractDates(): DateData[] {
  const dates: DateData[] = [];

  // 1. Time elements
  document.querySelectorAll('time[datetime]').forEach((time) => {
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
    const meta = document.querySelector(selector);
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
  const schemas = extractSchemaData();
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

  return dates;
}

export function extractSemanticElements(): SemanticElements {
  return {
    hasArticle: document.querySelector('article') !== null,
    hasMain: document.querySelector('main') !== null,
    hasNav: document.querySelector('nav') !== null,
    hasAside: document.querySelector('aside') !== null,
    hasHeader: document.querySelector('header') !== null,
    hasFooter: document.querySelector('footer') !== null,
    hasSection: document.querySelector('section') !== null,
  };
}

export function isWithinLastYear(date: Date): boolean {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return date >= oneYearAgo;
}

export async function checkLlmsTxt(): Promise<LlmsTxtData> {
  try {
    const origin = window.location.origin;
    const response = await fetch(`${origin}/llms.txt`);

    if (response.ok) {
      const content = await response.text();

      // Prüfen ob Inhalt wie HTML aussieht (False Positive bei SPAs, Custom 404s)
      const looksLikeHtml = /^\s*<!DOCTYPE|^\s*<html|^\s*<head/i.test(content);

      if (!looksLikeHtml && content.trim().length > 0) {
        return {
          exists: true,
          url: `${origin}/llms.txt`,
          hasContent: true,
          contentLength: content.length,
        };
      }
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

export async function checkRobotsTxt(bots?: readonly string[]): Promise<RobotsTxtData> {
  const targetBots = bots ?? GEO_CONFIG.machineReadability.aiBots;
  const allAllowed = (exists: boolean, url?: string): RobotsTxtData => ({
    exists,
    url,
    allowedBots: Object.fromEntries(targetBots.map((b) => [b, true])),
    blockedBots: [],
    totalChecked: targetBots.length,
  });

  try {
    const origin = window.location.origin;
    const url = `${origin}/robots.txt`;
    const response = await fetch(url);

    // 404 / 5xx → per RFC 9309 everything is allowed
    if (!response.ok) return allAllowed(false);

    const content = await response.text();
    // False-Positive-Schutz (SPAs mit HTML-404)
    const looksLikeHtml = /^\s*<!DOCTYPE|^\s*<html|^\s*<head/i.test(content);
    if (looksLikeHtml || content.trim().length === 0) return allAllowed(false);

    return parseRobotsTxt(content, targetBots, url);
  } catch {
    return allAllowed(false);
  }
}

/**
 * Parses robots.txt and returns which of the given bots are allowed at site root.
 * Rules: bot-specific block beats `*` fallback. `Disallow: /` without an overriding
 * root `Allow: /` means the bot is blocked.
 */
export function parseRobotsTxt(
  content: string,
  bots: readonly string[],
  url?: string
): RobotsTxtData {
  const blocks = parseBlocks(content);
  const wildcard = blocks.find((b) => b.agents.includes('*'));

  const allowedBots: Record<string, boolean> = {};
  const blockedBots: string[] = [];

  for (const bot of bots) {
    const lower = bot.toLowerCase();
    const specific = blocks.find((b) => b.agents.includes(lower));
    const block = specific ?? wildcard;
    const allowed = block ? !isRootBlocked(block) : true;
    allowedBots[bot] = allowed;
    if (!allowed) blockedBots.push(bot);
  }

  return {
    exists: true,
    url,
    allowedBots,
    blockedBots,
    totalChecked: bots.length,
  };
}

interface RobotsBlock {
  agents: string[]; // lowercased user-agent names
  rules: Array<{ type: 'allow' | 'disallow'; path: string }>;
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

function isRootBlocked(block: RobotsBlock): boolean {
  // A bot is blocked at the root iff there is a `Disallow: /` rule and no
  // overriding `Allow: /` (or longer Allow prefix covering the root).
  const hasDisallowRoot = block.rules.some(
    (r) => r.type === 'disallow' && r.path === '/'
  );
  if (!hasDisallowRoot) return false;

  const hasAllowRoot = block.rules.some(
    (r) => r.type === 'allow' && r.path === '/'
  );
  return !hasAllowRoot;
}
