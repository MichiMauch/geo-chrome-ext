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
  QuestionAnswer,
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
        // The analyzed page's origin, not the window's: the sitemap batch
        // runs on one page and analyzes others.
        checkLlmsTxt(originOf(pageUrl)),
        checkRobotsTxt(undefined, originOf(pageUrl), robotsPathFromUrl(pageUrl)),
      ]);

  // Every extractor below shares one content scope instead of recomputing it
  return withContentScope(doc, () => {
    const schema = extractSchemaData(doc);
    const faq = scanFaq(doc);

    return {
      url: pageUrl,
      headings: extractHeadings(doc),
      paragraphs: extractParagraphs(doc),
      lists: extractLists(doc),
      links: extractLinks(doc, pageUrl),
      meta: extractMetaData(doc),
      schema,
      lang: extractLang(doc, schema),
      author: extractAuthorInfo(doc),
      dates: extractDates(doc),
      semanticElements: extractSemanticElements(doc),
      llmsTxt,
      robotsTxt,
      faqQuestions: faq.questions,
      faqAnswersHidden: faq.hidden,
      questionAnswers: extractQuestionAnswers(doc),
      images: extractImages(doc),
      openGraph: extractOpenGraph(doc),
      twitterCard: extractTwitterCard(doc),
      robotsMeta: extractRobotsMeta(doc),
      viewport: extractViewport(doc),
      canonical: extractCanonical(doc, pageUrl),
    };
  });
}

// Primary language subtag of the content: <html lang="de-CH"> → 'de', else
// the first schema inLanguage (a code string or a Language node), else
// undefined.
export function extractLang(
  doc: Document = document,
  schema: SchemaData[] = extractSchemaData(doc)
): string | undefined {
  const primary = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const sub = value.trim().split(/[-_]/)[0].toLowerCase();
    return /^[a-z]{2,3}$/.test(sub) ? sub : undefined;
  };
  const htmlLang = primary(doc.documentElement?.getAttribute('lang'));
  if (htmlLang) return htmlLang;
  for (const node of schema) {
    for (const value of flattenLang((node as Record<string, unknown>).inLanguage)) {
      const lang = primary(value);
      if (lang) return lang;
    }
  }
  return undefined;
}

function flattenLang(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenLang);
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    return [node.alternateName, node.name];
  }
  return [value];
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

// ---------------------------------------------------------------------------
// Content scope
//
// Headings, paragraphs and lists used to be collected from the whole
// document, so navigation lists, footer columns, share boxes and teaser grids
// counted as page content (economiesuisse.ch: "3/3 lists", all of them menus).
// The scope picks the content root and decides which elements are site chrome.
//
// Content root: the single top-level <article>; with several articles the one
// holding the page H1 (otherwise it is a listing → <main>); else <main>; else
// <body>. If the H1 sits outside that root (`<main><h1/><article/></main>`)
// the root widens to the nearest ancestor that contains it.
//
// Chrome — excluded everywhere, even inside the root:
//  - nav, aside and [role=navigation|banner|contentinfo|complementary]
//  - header/footer when they are page-level, i.e. not inside an article,
//    aside, main, nav or section (HTML-AAM: only those map to banner /
//    contentinfo; an <article><header> holds the title and byline)
//  - blocks whose class/id token is newsletter, share, sharing, social,
//    related, cookie(s), consent, gdpr, breadcrumb(s) or teilen, or whose
//    aria-label mentions share/teilen/newsletter/cookie. Tokens are matched
//    whole (split on space, - and _), so `shared-layout` or `unrelated` don't
//    trip it. html/body/main/article and anything holding the H1 never count.
//  - utility-class sites (Tailwind) carry no such names, so a block that
//    *starts* with a boilerplate heading ("Artikel teilen", "Newsletter
//    abonnieren", "Passende Artikel", "Related articles", …) is chrome too:
//    the heading plus its ancestors up to the highest one that still begins
//    with that heading and holds no other heading of the same or a higher
//    rank.
//  - promo blocks without any naming (sidebar "Dossier: das Neuste zum
//    Thema …" boxes): a block with a heading and at most PROMO_MAX_CHARS of
//    text, of which at least PROMO_LINK_SHARE sits in links to the site
//    itself. External links don't count towards the share, so a "Sources"
//    section with a heading and a list of citations stays content.
// Headings and paragraphs inside a link (teaser and author cards) are left
// out by extractHeadings/extractParagraphs themselves.
// ---------------------------------------------------------------------------

const LANDMARK_CHROME =
  'nav, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]';
const SECTIONING = 'article, aside, main, nav, section';

const BOILERPLATE_TOKEN =
  /^(newsletter|share|sharing|social|related|cookie|cookies|consent|gdpr|breadcrumb|breadcrumbs|teilen)$/i;
const BOILERPLATE_ARIA = /share|teilen|newsletter|cookie/i;

const BOILERPLATE_HEADINGS: RegExp[] = [
  /^((artikel|beitrag|seite|page|article|post) )?(teilen|share)( (this|on|via))?( (artikel|article|post|page|seite))?:?$/i,
  /^diese(n|s)? (artikel|beitrag|seite) teilen:?$/i,
  /^(partager|condividi)( .*)?$/i,
  /^newsletter( (abonnieren|bestellen|anmelden|abonnement))?$/i,
  /^(zum |für den )?newsletter (anmelden|abonnieren|eintragen)$/i,
  /^(subscribe|sign up)( to| for)?( (our|the))? newsletter$/i,
  /^(passende|ähnliche|verwandte|weitere|empfohlene) (artikel|beiträge|inhalte|themen|news)$/i,
  /^(related|similar|recommended|more) (articles|posts|content|stories|reading)$/i,
  /^(das könnte sie (auch )?interessieren|you (may|might) also like)$/i,
];

const normalizeText = (text: string | null | undefined): string =>
  (text || '').trim().replace(/\s+/g, ' ');

export interface ContentScope {
  root: Element;
  // The page H1 (first one outside chrome landmarks), if any
  h1: Element | null;
  isExcluded(el: Element): boolean;
}

function isPageLevelHeaderFooter(el: Element): boolean {
  const tag = el.tagName;
  if (tag !== 'HEADER' && tag !== 'FOOTER') return false;
  return !el.parentElement?.closest(SECTIONING);
}

function isLandmarkChrome(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (cur.matches(LANDMARK_CHROME) || isPageLevelHeaderFooter(cur)) return true;
  }
  return false;
}

function hasBoilerplateName(el: Element): boolean {
  const tokens = `${el.getAttribute('class') || ''} ${el.id || ''}`.split(/[\s_-]+/);
  if (tokens.some((t) => BOILERPLATE_TOKEN.test(t))) return true;
  const aria = el.getAttribute('aria-label');
  return !!aria && BOILERPLATE_ARIA.test(aria);
}

const NEVER_BOILERPLATE = new Set(['HTML', 'BODY', 'MAIN', 'ARTICLE']);

const PROMO_MAX_CHARS = 1500;
const PROMO_LINK_SHARE = 0.5;

// Same site as the document: relative hrefs, or the same registrable domain.
// Judged on the raw attribute because DOMParser documents (sitemap batch)
// resolve relative links against the open tab, not the analyzed page.
function isSameSiteHref(href: string, siteDomain: string): boolean {
  if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return !href.startsWith('#');
  try {
    const url = new URL(href.startsWith('//') ? `https:${href}` : href);
    return /^https?:$/.test(url.protocol) && registrableDomain(url.hostname) === siteDomain;
  } catch {
    return false;
  }
}

function isPromoBlock(el: Element, siteDomain: string): boolean {
  if (!el.querySelector('h2, h3, h4, h5, h6') || !el.querySelector('a[href]')) return false;
  const total = normalizeText(el.textContent).length;
  if (total === 0 || total > PROMO_MAX_CHARS) return false;
  let linked = 0;
  el.querySelectorAll('a[href]').forEach((a) => {
    if (a.parentElement?.closest('a[href]')) return;
    if (isSameSiteHref(a.getAttribute('href') || '', siteDomain)) {
      linked += normalizeText(a.textContent).length;
    }
  });
  return linked / total >= PROMO_LINK_SHARE;
}

function boilerplateHeadingBlocks(root: Element): Set<Element> {
  const blocks = new Set<Element>();
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const text = normalizeText(h.textContent);
    if (!BOILERPLATE_HEADINGS.some((re) => re.test(text))) return;
    const level = parseInt(h.tagName[1], 10);
    const rankSelector = Array.from({ length: level }, (_, i) => `h${i + 1}`).join(',');
    let block: Element = h;
    for (let parent = h.parentElement; parent && parent !== root; parent = parent.parentElement) {
      if (NEVER_BOILERPLATE.has(parent.tagName)) break;
      const otherHeading = Array.from(parent.querySelectorAll(rankSelector)).some((o) => o !== h);
      if (otherHeading) break;
      // The block must begin with the label, otherwise content before it
      // (a whole article without subheadings) would be swallowed.
      if (!normalizeText(parent.textContent).startsWith(text)) break;
      block = parent;
    }
    blocks.add(block);
  });
  return blocks;
}

// Scopes pinned for the duration of one extraction pass (see
// withContentScope). Outside such a pass every call recomputes, because the
// live DOM may have changed in between (accordions opened, SPA navigation).
const pinnedScopes = new WeakMap<Document, ContentScope>();

/**
 * Runs `fn` with the content scope of `doc` computed once and shared by every
 * extractor called inside — instead of once per extractor. Only for code that
 * reads the DOM without changing it.
 */
export function withContentScope<T>(doc: Document, fn: () => T): T {
  if (pinnedScopes.has(doc)) return fn();
  pinnedScopes.set(doc, computeContentScope(doc));
  try {
    return fn();
  } finally {
    pinnedScopes.delete(doc);
  }
}

export function getContentScope(doc: Document = document): ContentScope {
  return pinnedScopes.get(doc) ?? computeContentScope(doc);
}

function computeContentScope(doc: Document): ContentScope {
  const body = doc.body ?? doc.documentElement;
  const h1 =
    Array.from(doc.querySelectorAll('h1')).find(
      (h) => normalizeText(h.textContent) && !isLandmarkChrome(h)
    ) ?? null;

  const articles = Array.from(doc.querySelectorAll('article')).filter(
    (a) => !a.parentElement?.closest('article') && !isLandmarkChrome(a)
  );
  let root: Element | null = null;
  if (articles.length === 1) root = articles[0];
  else if (articles.length > 1) root = articles.find((a) => h1 && a.contains(h1)) ?? null;
  if (!root) {
    root = Array.from(doc.querySelectorAll('main')).find((m) => !isLandmarkChrome(m)) ?? body;
  }
  if (h1 && !root.contains(h1)) {
    let wider: Element = root;
    while (wider !== body && wider.parentElement && !wider.contains(h1)) wider = wider.parentElement;
    root = wider;
  }

  const headingBlocks = boilerplateHeadingBlocks(root);
  const cache = new Map<Element, boolean>();
  let siteDomain = '';
  try {
    siteDomain = registrableDomain(new URL(doc.baseURI).hostname);
  } catch {
    // about:blank and friends — only relative links count as same-site
  }
  const excludedSelf = (el: Element): boolean => {
    if (el.matches(LANDMARK_CHROME) || isPageLevelHeaderFooter(el)) return true;
    if (headingBlocks.has(el)) return true;
    if (NEVER_BOILERPLATE.has(el.tagName)) return false;
    if (h1 && el.contains(h1)) return false;
    return hasBoilerplateName(el) || isPromoBlock(el, siteDomain);
  };
  const isExcluded = (el: Element): boolean => {
    const path: Element[] = [];
    let verdict = false;
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const known = cache.get(cur);
      if (known !== undefined) {
        verdict = known;
        break;
      }
      path.push(cur);
      if (excludedSelf(cur)) {
        verdict = true;
        break;
      }
    }
    // Everything walked below the deciding ancestor shares its verdict
    path.forEach((p) => cache.set(p, verdict));
    return verdict;
  };

  return { root, h1, isExcluded };
}

// The heading elements of the content area, in document order. Shared with
// the highlight collectors so markers point at exactly the headings scored.
export function contentHeadingElements(doc: Document = document): Element[] {
  const scope = getContentScope(doc);
  // Headings inside a link are teaser-card titles ("Passende Artikel" grids,
  // sidebar promos), not the page's own outline.
  const elements = Array.from(scope.root.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
    (h) => !scope.isExcluded(h) && !h.closest('a[href]') && normalizeText(h.textContent)
  );
  // A page title placed in the site <header> (outside the content root) is
  // still the page's H1 when the content itself has none.
  if (!elements.some((h) => h.tagName === 'H1')) {
    const bannerH1 = Array.from(doc.querySelectorAll('header h1, [role="banner"] h1')).find(
      (h) => normalizeText(h.textContent) && !h.closest('nav, footer, [role="navigation"]')
    );
    if (bannerH1) elements.unshift(bannerH1);
  }
  return elements;
}

export function extractHeadings(doc: Document = document): HeadingData[] {
  return contentHeadingElements(doc).map((h) => ({
    level: parseInt(h.tagName[1]),
    text: h.textContent?.trim() || '',
  }));
}

// FAQ / accordion answer containers which often use div/dd. Queried
// globally (not only inside the content root) because FAQ blocks are often
// rendered outside of <article>/<main>; chrome is still excluded.
const FAQ_ANSWER_SELECTORS = [
  '[itemprop="text"]',
  '[itemprop="acceptedAnswer"]',
  'dd',
  '[class*="faq-answer" i]',
  '[class*="accordion-content" i]',
  '[class*="accordion-body" i]',
  'details > :not(summary)',
  // ARIA / Radix / shadcn accordion panels
  '[role="region"][aria-labelledby]',
  '[data-state] [role="region"]',
];

// The body-text blocks of the content area with their normalized text. Shared
// with the highlight collectors so markers point at exactly the paragraphs
// scored.
export function contentParagraphElements(
  doc: Document = document
): { el: Element; text: string }[] {
  const scope = getContentScope(doc);
  const result: { el: Element; text: string }[] = [];

  // A paragraph repeating the H1 is the title rendered as <h1><p>…</p></h1>
  // (CMS rich-text headings), not body text.
  const h1Texts = new Set(
    Array.from(doc.querySelectorAll('h1')).map((h) => normalizeText(h.textContent))
  );
  const seen = new Set<string>();
  const pushIfGood = (el: Element) => {
    const t = normalizeText(el.textContent);
    if (t.length > 30 && !seen.has(t) && !h1Texts.has(t)) {
      seen.add(t);
      result.push({ el, text: t });
    }
  };

  // <p> inside a heading is rich-text markup of the heading; <p> inside a
  // link is teaser/author-card copy — neither is body text.
  scope.root.querySelectorAll('p').forEach((p) => {
    if (p.closest('h1, h2, h3, h4, h5, h6, a[href]') || scope.isExcluded(p)) return;
    pushIfGood(p);
  });

  doc.querySelectorAll(FAQ_ANSWER_SELECTORS.join(',')).forEach((el) => {
    if (scope.isExcluded(el)) return;
    // Its <p> children were already taken one by one above.
    if (scope.root.contains(el) && el.querySelector('p')) return;
    pushIfGood(el);
  });

  return result;
}

export function extractParagraphs(doc: Document = document): string[] {
  return contentParagraphElements(doc).map(({ text }) => text);
}

// ---------------------------------------------------------------------------
// FAQ questions
// ---------------------------------------------------------------------------

// Accordion triggers: ARIA disclosure buttons inside a heading (WAI-ARIA
// accordion pattern, Radix/shadcn render `h3 > button[aria-expanded]`) or
// inside an open/closed accordion item. Dropdown/menu triggers carry
// aria-haspopup and are skipped.
function accordionTriggers(doc: Document, scope: ContentScope): Element[] {
  return Array.from(
    doc.querySelectorAll('button[aria-expanded], [role="button"][aria-expanded]')
  ).filter(
    (b) =>
      !b.hasAttribute('aria-haspopup') &&
      !scope.isExcluded(b) &&
      (b.closest('h1, h2, h3, h4, h5, h6') !== null || accordionItemOf(b) !== null)
  );
}

// The nearest open/closed [data-state] wrapper whose first disclosure
// trigger is `el` (or sits inside it) — a Radix/shadcn AccordionItem. A
// page-level wrapper that merely carries data-state doesn't qualify because
// its first trigger is somebody else's.
function accordionItemOf(el: Element): Element | null {
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    if (cur.matches('h1, h2, h3, h4, h5, h6, button')) continue;
    const state = cur.getAttribute('data-state');
    if (state === 'open' || state === 'closed') {
      const first = cur.querySelector('[aria-expanded]');
      return first && (first === el || el.contains(first)) ? cur : null;
    }
  }
  return null;
}

// The panel a trigger opens: aria-controls, else a region labelled by the
// trigger, else the region inside the same accordion item. null = missing.
function answerPanelOf(trigger: Element, doc: Document): Element | null {
  const controls = trigger.getAttribute('aria-controls');
  if (controls) {
    for (const id of controls.split(/\s+/)) {
      const el = id ? doc.getElementById(id) : null;
      if (el) return el;
    }
  }
  const id = trigger.id;
  if (id) {
    const labelled = Array.from(doc.querySelectorAll('[aria-labelledby]')).find((el) =>
      (el.getAttribute('aria-labelledby') || '').split(/\s+/).includes(id)
    );
    if (labelled) return labelled;
  }
  const item = accordionItemOf(trigger);
  return item?.querySelector('[role="region"]') ?? null;
}

interface FaqScan {
  questions: string[];
  hidden: number;
}

function scanFaq(doc: Document): FaqScan {
  const scope = getContentScope(doc);
  const questions = new Set<string>();
  const add = (text: string | null | undefined): boolean => {
    const t = normalizeText(text);
    if (t.length >= 5 && t.length <= 300) {
      questions.add(t);
      return true;
    }
    return false;
  };
  const visible = (el: Element) => !scope.isExcluded(el);
  let hidden = 0;

  // Microdata: schema.org Question
  doc
    .querySelectorAll('[itemscope][itemtype*="schema.org/Question" i]')
    .forEach((q) => {
      if (!visible(q)) return;
      const nameEl = q.querySelector('[itemprop="name"]');
      add(nameEl?.textContent || q.textContent);
    });

  // Within a FAQPage container
  doc
    .querySelectorAll('[itemscope][itemtype*="FAQPage" i]')
    .forEach((faq) => {
      if (!visible(faq)) return;
      faq.querySelectorAll('[itemprop="name"]').forEach((n) => add(n.textContent));
    });

  // <details><summary> accordions
  doc.querySelectorAll('details > summary').forEach((s) => {
    if (!visible(s)) return;
    const t = s.textContent?.trim() || '';
    if (!t.endsWith('?') || !add(t)) return;
    const body = Array.from(s.parentElement?.childNodes ?? [])
      .filter((n) => n !== s)
      .map((n) => n.textContent || '')
      .join('');
    if (!body.trim()) hidden++;
  });

  // ARIA / Radix / shadcn accordions
  const counted = new Set<Element>();
  accordionTriggers(doc, scope).forEach((trigger) => {
    const t = normalizeText(trigger.textContent);
    if (!t.endsWith('?') || !add(t)) return;
    counted.add(accordionItemOf(trigger) ?? trigger);
    const panel = answerPanelOf(trigger, doc);
    if (!panel || !normalizeText(panel.textContent)) hidden++;
  });

  // Headings h2–h4 inside an accordion item (the question may not end in '?')
  doc.querySelectorAll('[data-state] h2, [data-state] h3, [data-state] h4').forEach((h) => {
    if (!visible(h) || h.closest('[role="region"]')) return;
    const item = accordionItemOf(h);
    if (!item) return;
    const t = normalizeText(h.textContent);
    if (!add(t) || counted.has(item)) return;
    counted.add(item);
    const trigger = item.querySelector('[aria-expanded]');
    const panel = trigger ? answerPanelOf(trigger, doc) : item.querySelector('[role="region"]');
    if (!panel || !normalizeText(panel.textContent)) hidden++;
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
    if (visible(el)) add(el.textContent);
  });

  return { questions: [...questions], hidden };
}

export function extractFaqQuestions(doc: Document = document): string[] {
  return scanFaq(doc).questions;
}

// Accordion/FAQ questions whose answer is not in the DOM: closed Radix items
// render an empty `hidden` region and only mount the text on click, a
// <details> without body text. A crawler sees the question but no answer.
export function countHiddenFaqAnswers(doc: Document = document): number {
  return scanFaq(doc).hidden;
}

// ---------------------------------------------------------------------------
// Question → answer pairs
// ---------------------------------------------------------------------------

const QUESTION_START = GEO_CONFIG.aiCitation.patterns.questions;

function isQuestionText(text: string): boolean {
  return /[?？]$/.test(text) || QUESTION_START.some((p) => p.test(text));
}

const follows = (a: Node, b: Node): boolean =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/**
 * Pairs every question in the content area — a heading phrased as a question
 * or an accordion trigger — with the body text between it and the next
 * heading or trigger: the content paragraphs (incl. accordion panels) and
 * lists in that stretch. A question whose answer is not in the DOM gets an
 * empty answer.
 */
export function extractQuestionAnswers(doc: Document = document): QuestionAnswer[] {
  const scope = getContentScope(doc);
  const headings = contentHeadingElements(doc).filter((h) => h.tagName !== 'H1');
  const triggers = accordionTriggers(doc, scope).filter(
    (b) => !b.closest('h1, h2, h3, h4, h5, h6')
  );
  const markers = [...headings, ...triggers].sort((a, b) => (follows(a, b) ? -1 : 1));

  const blocks: { el: Element; text: string }[] = [
    ...contentParagraphElements(doc),
    ...Array.from(scope.root.querySelectorAll('ul, ol'))
      .filter((list) => !scope.isExcluded(list) && !list.parentElement?.closest('ul, ol'))
      // Item by item: textContent would glue "<li>A</li><li>B</li>" into "AB"
      .map((list) => ({
        el: list,
        text: Array.from(list.querySelectorAll(':scope > li'))
          .map((li) => normalizeText(li.textContent))
          .filter(Boolean)
          .join(' '),
      })),
  ]
    .filter(({ text }) => text.length > 0)
    .sort((a, b) => (follows(a.el, b.el) ? -1 : 1));

  const pairs: QuestionAnswer[] = [];
  markers.forEach((marker, i) => {
    const question = normalizeText(marker.textContent);
    if (question.length < 5 || question.length > 300 || !isQuestionText(question)) return;
    const next = markers[i + 1];
    const answer = blocks
      .filter(
        ({ el }) =>
          !marker.contains(el) &&
          follows(marker, el) &&
          (!next || follows(el, next))
      )
      .map(({ text }) => text)
      .join(' ');
    pairs.push({ question, answer });
  });
  return pairs;
}

export function extractLists(doc: Document = document): ListData[] {
  const scope = getContentScope(doc);
  const lists: ListData[] = [];
  scope.root.querySelectorAll('ul, ol').forEach((list) => {
    if (scope.isExcluded(list)) return;
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

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

// Second-level labels under which ccTLDs sell domains (example.co.uk,
// example.com.au). Approximation of the public suffix list: enough to keep
// shop.example.co.uk and example.co.uk together without shipping the PSL.
const COMMON_SLDS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'or', 'ne', 'go', 'gv']);

// Registrable domain (≈ eTLD+1): last two labels, three when the second-level
// label is a known SLD in front of a two-letter ccTLD. IPs and single-label
// hosts are returned unchanged.
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (/^[\d.]+$/.test(host) || host.includes(':')) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const take = tld.length === 2 && COMMON_SLDS.has(sld) ? 3 : 2;
  return labels.slice(-take).join('.');
}

// Share-intent endpoints: "post this page to X" buttons, not references.
const SHARE_URL =
  /(facebook\.com\/(sharer|share\.php|dialog\/share)|(twitter|x)\.com\/(intent|share)|linkedin\.com\/(sharing|shareArticle|cws\/share)|xing\.com\/(spi\/shares|social\/share)|pinterest\.[a-z.]+\/pin\/create|reddit\.com\/submit|wa\.me\/\?|api\.whatsapp\.com\/send|whatsapp:\/\/send|t\.me\/share|telegram\.me\/share|bsky\.app\/intent)/i;
const SHARE_WIDGET = /share|sharing|teilen|social/i;

function inShareWidget(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (cur.tagName === 'BODY' || cur.tagName === 'HTML' || cur.tagName === 'MAIN') return false;
    const names = `${cur.getAttribute('class') || ''} ${cur.id || ''}`;
    // Matched as whole words of the class/id so `shared-layout` stays content
    if (names.split(/[\s_-]+/).some((t) => /^(share|sharing|teilen|social|socials)$/i.test(t))) {
      return true;
    }
    const aria = cur.getAttribute('aria-label');
    if (aria && SHARE_WIDGET.test(aria) && cur !== el) return true;
  }
  return false;
}

export function extractLinks(doc: Document = document, baseUrl: string = window.location.href): LinkData[] {
  const links: LinkData[] = [];
  const base = new URL(baseUrl);
  const siteDomain = registrableDomain(base.hostname);
  const scope = getContentScope(doc);

  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = (a.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#')) return;

    let url: URL;
    try {
      url = new URL(href, base.href);
    } catch {
      return;
    }
    // tel:, mailto:, javascript:, data:, … are not links a crawler follows
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    const text = a.textContent?.trim() || '';
    const isExternal = registrableDomain(url.hostname) !== siteDomain;
    const isNavigational =
      scope.isExcluded(a) ||
      inShareWidget(a) ||
      SHARE_URL.test(url.href) ||
      // Cloudflare email obfuscation and other /cdn-cgi/ endpoints
      (!isExternal && url.pathname.startsWith('/cdn-cgi/'));

    // Resolved URL, so protocol-relative and <base>-relative links parse
    // the same way everywhere downstream (source filter, dedup).
    links.push({ href: url.href, text, isExternal, isNavigational });
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
  const raw: Record<string, unknown>[] = [];

  // Top-level nodes of a JSON-LD value: arrays and @graph containers are
  // unwrapped at any depth (`[{"@context":…,"@graph":[…]}]` is common).
  const collect = (data: unknown): void => {
    if (Array.isArray(data)) {
      data.forEach(collect);
      return;
    }
    if (!data || typeof data !== 'object') return;
    const node = data as Record<string, unknown>;
    const graph = node['@graph'];
    if (graph !== undefined && graph !== null) {
      collect(graph);
      // A container is only a node of its own when it carries a type
      if (node['@type'] === undefined) return;
    }
    raw.push(node);
  };

  doc
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((script) => {
      try {
        collect(JSON.parse(script.textContent || ''));
      } catch {
        // Ignore parse errors
      }
    });

  const schemas = raw.map(normalizeSchemaNode);
  schemas.push(...extractMicrodata(doc));
  schemas.push(...extractRdfa(doc));

  // The same node emitted twice (two plugins, SSR + hydration) counts once
  const seen = new Set<string>();
  return schemas.filter((s) => {
    let key: string;
    try {
      key = JSON.stringify(s);
    } catch {
      return true;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSchemaType(type: string): string {
  return type
    .trim()
    .replace(/^https?:\/\/(www\.)?schema\.org\//i, '')
    .replace(/^schema:/i, '');
}

// '@type' is always the first type as a plain string ('' when there is
// none) and '@types' holds them all, schema.org prefixes stripped.
function normalizeSchemaNode(node: Record<string, unknown>): SchemaData {
  const rawType = node['@type'];
  const types = (Array.isArray(rawType) ? rawType : [rawType])
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map(normalizeSchemaType)
    .filter((t) => t.length > 0);
  node['@type'] = types[0] ?? '';
  node['@types'] = types;
  return node as SchemaData;
}

function typesFromItemtype(itemtype: string | null): string[] {
  if (!itemtype) return [];
  // itemtype may list several URLs: "https://schema.org/Article https://schema.org/NewsArticle"
  return itemtype
    .split(/\s+/)
    .map((url) => url.match(/schema\.org\/([A-Za-z]+)/)?.[1])
    .filter((t): t is string => !!t);
}

// One node per itemscope: a top-level scope yields its full item (name,
// author, dates, nested items as values), a nested scope a type-only node so
// type checks (Question inside FAQPage, Person as author) still see it. The
// top-level scope used to be emitted twice — once type-only, once full.
export function extractMicrodata(doc: Document = document): SchemaData[] {
  const results: SchemaData[] = [];
  doc.querySelectorAll('[itemscope][itemtype]').forEach((el) => {
    const types = typesFromItemtype(el.getAttribute('itemtype'));
    if (types.length === 0) return;
    const isTopLevel = !el.parentElement?.closest('[itemscope][itemtype]');
    const node = isTopLevel ? parseMicrodataItem(el) : { '@type': types[0] };
    results.push(normalizeSchemaNode({ ...node, '@type': types }));
  });
  return results;
}

function parseMicrodataItem(el: Element): SchemaData {
  const type = typesFromItemtype(el.getAttribute('itemtype'))[0] || 'Thing';
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
    if (el.parentElement?.closest('[typeof]')) return;
    // typeof may hold several types, each like "schema:FAQPage" or a full URL
    const types = (el.getAttribute('typeof') || '')
      .split(/\s+/)
      .map((t) => t.split(/[:/#]/).pop() || '')
      .filter(Boolean);
    if (types.length === 0) return;
    results.push(normalizeSchemaNode({ '@type': types }));
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

// Section labels that author selectors pick up instead of a name
const GENERIC_AUTHOR_LABEL =
  /^(über (den|die) (autor|autorin|autoren|autorinnen)|zum autor|zur autorin|about the authors?|the authors?|autor(in|en|innen)?|authors?|verfasser(in)?|redaktion|von|by|written by|geschrieben von|à propos de l'auteur|auteur)\s*:?$/i;
const AUTHOR_PREFIX =
  /^(über (den|die) (autor|autorin)|about the author|geschrieben von|written by|von|by|autor(in)?:|author:|verfasser(in)?:)\s*:?\s*/i;
const NAME_PARTICLES = new Set(['von', 'van', 'der', 'den', 'de', 'la', 'le', 'di', 'du', 'da', 'del', 'dos', 'zu', 'ten', 'ter', 'und', 'and', '&']);

// "Jane Doe", "Hans-Peter von Arx": 2–5 words, each capitalized or a name
// particle. "Read more from our authors" is not.
function looksLikePersonName(text: string): boolean {
  if (/[\d?!|@:;/]/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => NAME_PARTICLES.has(w.toLowerCase()) || /^\p{Lu}/u.test(w));
}

// Author candidates from DOM bylines, cleaned, in selector priority order.
// Site navigation and the page footer don't credit anyone.
function domAuthorCandidates(doc: Document): string[] {
  const authorSelectors = [
    '[rel="author"]',
    '[itemprop="author"]',
    '[class*="byline"]',
    '[class*="author"]',
  ];
  const candidates: string[] = [];
  for (const selector of authorSelectors) {
    doc.querySelectorAll(selector).forEach((element) => {
      if (isLandmarkChrome(element) && !element.closest('aside, [role="complementary"]')) return;
      const text = normalizeText(element.textContent);
      if (text.length <= 2 || text.length >= 100) return;
      if (GENERIC_AUTHOR_LABEL.test(text)) return;
      const cleaned = text.replace(AUTHOR_PREFIX, '').trim();
      if (cleaned.length > 2 && !GENERIC_AUTHOR_LABEL.test(cleaned)) candidates.push(cleaned);
    });
  }
  return candidates;
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

  // 3. A visible byline naming a person ("von Jane Doe") credits the content
  // more specifically than the publishing organization does, so it comes
  // before the publisher. Only name-shaped text qualifies here; looser DOM
  // guesses ("Read more from our authors") stay behind the publisher.
  const domCandidates = domAuthorCandidates(doc);
  const personByline = domCandidates.find(looksLikePersonName);
  if (personByline) return { name: personByline, source: 'dom' };

  // 4. Schema.org publisher — an organization behind the content still makes
  // it attributable, which is what the criterion asks for. Standalone
  // Organization nodes don't count: nearly every site emits one.
  for (const schema of schemas) {
    const name = resolveSchemaName(schema.publisher, byId);
    if (name) return { name, source: 'publisher' };
  }

  // 5. Any other DOM byline guess
  if (domCandidates.length > 0) return { name: domCandidates[0], source: 'dom' };

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

  // 3. Schema.org dates — both of them, dateModified first.
  //
  // This used to read `datePublished || dateModified`, so a page that was
  // published in 2021 and updated today was scored on 2021 and counted as
  // stale. For a freshness criterion the modification date is the relevant
  // signal, and both belong in the list: the publication date still answers
  // "when did this appear", it just must not hide the newer one.
  const schemas = extractSchemaData(doc);
  const gesehen = new Set<number>();
  for (const schema of schemas) {
    for (const key of ['dateModified', 'datePublished'] as const) {
      const dateStr = schema[key];
      if (!dateStr || typeof dateStr !== 'string') continue;
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) continue;
        // Several schema blocks on one page usually repeat the same dates.
        if (gesehen.has(date.getTime())) continue;
        gesehen.add(date.getTime());
        dates.push({
          date,
          formatted: dateStr,
          source: 'schema',
        });
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

// RFC 9309 groups: one or more User-agent lines followed by their rules. A
// group ends only at the next User-agent line that comes after a rule —
// blank lines don't end it (`User-agent: GPTBot`, blank line, `Disallow: /`
// is still one group), and Sitemap / Crawl-delay / unknown lines are ignored.
function parseBlocks(content: string): RobotsBlock[] {
  const blocks: RobotsBlock[] = [];
  let current: RobotsBlock | null = null;
  let groupHasRules = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines group into one block
      if (!current || groupHasRules) {
        if (current) blocks.push(current);
        current = { agents: [], rules: [] };
        groupHasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === 'disallow' || field === 'allow') {
      if (current) {
        current.rules.push({ type: field, path: value });
        groupHasRules = true;
      }
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
