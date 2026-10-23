import { PageData, PageType, AnalysisCategory, CategoryDetail, SchemaData, EvidenceLine } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { schemaTypesOf } from '../utils/schema-types';
import { ARTICLE_SCHEMA_TYPES, detectPageType } from '../utils/page-type';
import { visibleQuestions } from '../utils/visible-questions';

// Types the schema check counts. Each distinct type counts once, however many
// nodes carry it.
const RELEVANT_SCHEMA_TYPES = new Set<string>([
  ...ARTICLE_SCHEMA_TYPES,
  'FAQPage', 'HowTo', 'Product',
  'Organization', 'NewsMediaOrganization', 'Corporation', 'LocalBusiness',
  'Person', 'WebPage', 'CollectionPage', 'AboutPage', 'ContactPage', 'BreadcrumbList',
]);

const ORGANIZATION_TYPES = new Set<string>([
  'Organization', 'NewsMediaOrganization', 'Corporation', 'LocalBusiness',
  'NGO', 'EducationalOrganization', 'GovernmentOrganization',
]);

type SchemaNode = Record<string, unknown>;

// What each checked AI crawler is for, for the report: blocking a search or
// user-fetch bot removes the site from AI answers, blocking a training bot
// mainly keeps the content out of future model training.
type BotPurpose = 'index' | 'search' | 'user' | 'training';
const BOT_INFO: Record<string, { owner: string; purpose: BotPurpose }> = {
  Googlebot: { owner: 'Google', purpose: 'index' },
  Bingbot: { owner: 'Microsoft', purpose: 'index' },
  GPTBot: { owner: 'OpenAI', purpose: 'training' },
  'OAI-SearchBot': { owner: 'OpenAI', purpose: 'search' },
  'ChatGPT-User': { owner: 'OpenAI', purpose: 'user' },
  ClaudeBot: { owner: 'Anthropic', purpose: 'training' },
  'Claude-SearchBot': { owner: 'Anthropic', purpose: 'search' },
  'Claude-User': { owner: 'Anthropic', purpose: 'user' },
  PerplexityBot: { owner: 'Perplexity', purpose: 'search' },
  'Perplexity-User': { owner: 'Perplexity', purpose: 'user' },
  'Google-Extended': { owner: 'Google Gemini', purpose: 'training' },
  'Applebot-Extended': { owner: 'Apple', purpose: 'training' },
  'meta-externalagent': { owner: 'Meta', purpose: 'training' },
  CCBot: { owner: 'Common Crawl', purpose: 'training' },
};

// Short text for evidence lines
function clip(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function quoteList(items: string[], max = 3): string {
  return items.slice(0, max).map((i) => `«${clip(i)}»`).join(', ');
}

// Names behind an about/mentions value: plain strings or nodes with a name
function topicNames(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const names: string[] = [];
  for (const v of values) {
    if (typeof v === 'string' && v.trim() && !/^(https?:\/\/|#)/i.test(v.trim())) names.push(v.trim());
    else if (v && typeof v === 'object') {
      const name = nodeName(v as SchemaNode);
      if (name) names.push(name);
    }
  }
  return names;
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function nodeTypes(node: SchemaNode): string[] {
  return schemaTypesOf(node as SchemaData);
}

function isOrganizationNode(node: SchemaNode): boolean {
  return nodeTypes(node).some((t) => ORGANIZATION_TYPES.has(t));
}

function nodeName(node: SchemaNode): string | null {
  return typeof node.name === 'string' && node.name.trim() ? node.name.trim() : null;
}

function indexById(schemas: SchemaData[]): Map<string, SchemaNode> {
  const byId = new Map<string, SchemaNode>();
  for (const schema of schemas) {
    const id = schema['@id'];
    if (typeof id === 'string' && id) byId.set(id, schema);
  }
  return byId;
}

// The nodes behind an author/publisher-style value: inline nodes, arrays of
// them, and @id references into @graph (as a bare string or {"@id": …}).
// A reference node is replaced by the node it points at.
function resolveNodes(value: unknown, byId: Map<string, SchemaNode>, seen = new Set<string>()): SchemaNode[] {
  if (Array.isArray(value)) return value.flatMap((v) => resolveNodes(v, byId, seen));
  if (typeof value === 'string') {
    const referenced = byId.get(value.trim());
    if (!referenced || seen.has(value.trim())) return [];
    seen.add(value.trim());
    return resolveNodes(referenced, byId, seen);
  }
  if (value && typeof value === 'object') {
    const node = value as SchemaNode;
    const id = node['@id'];
    if (!nodeName(node) && typeof id === 'string' && byId.has(id) && byId.get(id) !== node && !seen.has(id)) {
      seen.add(id);
      return resolveNodes(byId.get(id), byId, seen);
    }
    return [node];
  }
  return [];
}

// A plain string author/publisher is the name itself unless it is a URL or
// fragment (a broken @id reference).
function plainName(value: unknown, byId: Map<string, SchemaNode>): string | null {
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (trimmed && !byId.has(trimmed) && !/^(https?:\/\/|#)/i.test(trimmed)) return trimmed;
  }
  return null;
}

// True when the value credits someone by name — {"@type":"Person"} alone
// names nobody and must not satisfy a required author field.
function hasNamedEntity(value: unknown, byId: Map<string, SchemaNode>): boolean {
  return plainName(value, byId) !== null || resolveNodes(value, byId).some((n) => nodeName(n) !== null);
}

// Link targets compared without hash, trailing slash or host case. Returns
// null for targets that are no content path: non-http(s), Cloudflare's
// /cdn-cgi/ endpoints (email protection etc.) and links back to the page
// itself (jump links).
function normalizeLinkTarget(href: string, pageUrl: string): string | null {
  try {
    const u = new URL(href, pageUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.pathname.startsWith('/cdn-cgi/')) return null;
    const key = (url: URL) =>
      `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '') || '/'}${url.search}`;
    let self: string | null = null;
    try {
      self = key(new URL(pageUrl));
    } catch {
      // unparseable page URL — nothing counts as a self-link
    }
    const target = key(u);
    return target === self ? null : target;
  } catch {
    return null;
  }
}

interface SchemaTypeCheck {
  foundTypes: string[];
  // Types on the page that this check does not count (WebSite, ImageObject …)
  otherTypes: string[];
  // FAQPage without a single visible question: describes nothing on the page
  faqUnbacked: boolean;
  missing: string[];
  current: number;
  target: number;
}

interface CompletenessResult {
  foundRequired: number;
  totalRequired: number;
  missingByType: { type: string; missing: string[] }[];
  completeTypes: string[];
  // An author field is set but names nobody ({"@type": "Person"} alone)
  unnamedAuthor: boolean;
}

interface LinkCheck {
  score: number;
  internalCount: number;
  descriptiveRatio: number;
  // Internal links in header/nav/footer, which the check leaves out
  navCount: number;
  descriptiveExamples: string[];
  genericExamples: string[];
}

export class MachineReadabilityAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_machineReadability';

  analyze(pageData: PageData, pageType: PageType = detectPageType(pageData)): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.machineReadability;

    // Check 1: Schema.org Structured Data — distinct relevant types, so two
    // NewsArticle nodes (or one multi-typed node) can't fake breadth.
    const schemaCheck = this.evaluateSchemaTypes(pageData, pageType);
    const hasSchema = schemaCheck.foundTypes.length > 0;
    const schemasNeeded = schemaCheck.target;
    const schemaScore = schemaCheck.current / schemasNeeded;

    details.push({
      criterionKey: 'criterion_schema',
      found: hasSchema,
      value: !hasSchema
        ? 'value_noneFound'
        : schemaCheck.missing.length > 0
          ? 'value_schemaTypesMissing'
          : 'value_schemaTypes',
      ...(hasSchema
        ? {
            valueParams: {
              types: schemaCheck.foundTypes.join(', '),
              missing: schemaCheck.missing.join(', '),
            },
          }
        : {}),
      weight: config.weights.schemaOrg,
      progress: {
        current: schemaCheck.current,
        target: schemasNeeded,
        unitKey: 'unit_schemaTypes',
      },
      ...this.schemaEvidence(pageData, schemaCheck),
    });

    weightedScore += schemaScore * config.weights.schemaOrg;
    totalWeight += config.weights.schemaOrg;

    // Check 1b: Schema-Completeness — required fields per @type.
    // Only schemas with actual property data (typically JSON-LD) are validated.
    // Microdata / RDFa entries that carry only @type are skipped from validation
    // so they don't fail the score just because the extractor can't read them.
    const completeness = this.evaluateSchemaCompleteness(pageData.schema);
    if (completeness.totalRequired > 0) {
      const completenessRatio = completeness.foundRequired / completeness.totalRequired;
      const isComplete = completenessRatio >= 0.99;
      const summary =
        completeness.missingByType.length > 0
          ? completeness.missingByType
              .map((m) => `${m.type}: ${m.missing.join(', ')}`)
              .join(' · ')
          : 'value_complete';

      details.push({
        criterionKey: 'criterion_schema_completeness',
        found: isComplete,
        value: summary,
        weight: config.weights.schemaCompleteness,
        progress: {
          current: completeness.foundRequired,
          target: completeness.totalRequired,
          unitKey: 'unit_required_fields',
        },
        evidence: this.completenessEvidence(completeness),
        ...(completeness.unnamedAuthor ? { fixKey: 'fix_schema_completeness_author' } : {}),
      });

      weightedScore += completenessRatio * config.weights.schemaCompleteness;
      totalWeight += config.weights.schemaCompleteness;
    }

    // Check 2: Klare Entitäten erkannt
    const entities = this.evaluateEntities(pageData);
    const entityScore = entities.score;
    const hasEntities = entityScore > 0.3;
    const entityPercent = Math.round(entityScore * 100);

    details.push({
      criterionKey: 'criterion_entities',
      found: hasEntities,
      value: `${entityPercent}%`,
      weight: config.weights.entities,
      progress: {
        current: entityPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
      evidence: entities.evidence,
    });

    weightedScore += entityScore * config.weights.entities;
    totalWeight += config.weights.entities;

    // Check 3: Semantisches HTML
    const semanticScore = this.evaluateSemanticHTML(pageData.semanticElements);
    const hasSemanticHTML = semanticScore > 0.5;
    const semanticPercent = Math.round(semanticScore * 100);

    details.push({
      criterionKey: 'criterion_semanticHtml',
      found: hasSemanticHTML,
      value: `${semanticPercent}%`,
      weight: config.weights.semanticHtml,
      progress: {
        current: semanticPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
      evidence: this.semanticEvidence(pageData.semanticElements),
    });

    weightedScore += semanticScore * config.weights.semanticHtml;
    totalWeight += config.weights.semanticHtml;

    // Check 3b: Interne Verlinkung — Kontext-Pfade für Crawler und Agents.
    // Zwei Aspekte, je zur Hälfte gewichtet: genug interne Links und ein
    // hoher Anteil beschreibender Ankertexte (kein "hier klicken"). Gezählt
    // werden nur kontextuelle Links (ohne Header/Nav/Footer), je Ziel einmal.
    const linking = this.evaluateInternalLinks(pageData.links, pageData.url);
    // Passing needs both halves: a single descriptive link scores 67% but
    // offers no real topic path.
    const hasGoodLinking =
      linking.internalCount >= config.internalLinks.minCount &&
      linking.descriptiveRatio >= config.internalLinks.descriptiveRatioMin;

    details.push({
      criterionKey: 'criterion_internalLinks',
      found: hasGoodLinking,
      value:
        linking.internalCount === 0
          ? 'value_notPresent'
          : `${linking.internalCount} (${Math.round(linking.descriptiveRatio * 100)}%)`,
      weight: config.weights.internalLinks,
      progress: {
        current: Math.round(linking.score * 100),
        target: 100,
        unitKey: 'unit_percent',
      },
      evidence: this.linkEvidence(linking),
      ...(linking.internalCount >= config.internalLinks.minCount &&
      linking.descriptiveRatio < config.internalLinks.descriptiveRatioMin
        ? { fixKey: 'fix_internalLinks_anchors' }
        : {}),
    });

    weightedScore += linking.score * config.weights.internalLinks;
    totalWeight += config.weights.internalLinks;

    // Check 4: llms.txt vorhanden (llms-full.txt zählt als Langfassung mit)
    const hasLlmsTxt = pageData.llmsTxt?.exists ?? false;
    const hasLlmsFullTxt = pageData.llmsTxt?.fullExists ?? false;
    // llms.txt is the index crawlers look for, so it carries the full credit.
    // llms-full.txt on its own still beats nothing and earns partial credit.
    const llmsTxtScore = hasLlmsTxt ? 1 : hasLlmsFullTxt ? config.thresholds.llmsFullOnlyCredit : 0;

    let llmsTxtValue: string;
    if (hasLlmsTxt && hasLlmsFullTxt) {
      llmsTxtValue = 'value_llms_both';
    } else if (hasLlmsTxt) {
      llmsTxtValue = 'value_llms_indexOnly';
    } else if (hasLlmsFullTxt) {
      llmsTxtValue = 'value_llms_fullOnly';
    } else {
      llmsTxtValue = 'value_notFound';
    }

    details.push({
      criterionKey: 'criterion_llmsTxt',
      found: hasLlmsTxt || hasLlmsFullTxt,
      value: llmsTxtValue,
      weight: config.weights.llmsTxt,
      progress: {
        // Mirrors the score: llms-full.txt is a bonus, not a second requirement,
        // so a site with just llms.txt must not read as half done.
        current: llmsTxtScore,
        target: 1,
        unitKey: 'unit_file',
      },
      evidence: this.llmsTxtEvidence(pageData),
      ...(!hasLlmsTxt && hasLlmsFullTxt ? { fixKey: 'fix_llmsTxt_fullOnly' } : {}),
    });

    weightedScore += llmsTxtScore * config.weights.llmsTxt;
    totalWeight += config.weights.llmsTxt;

    // Check 5: AI-Crawler in robots.txt nicht blockiert
    const robotsTxt = pageData.robotsTxt;
    const total = robotsTxt?.totalChecked ?? 0;
    const blockedCount = robotsTxt?.blockedBots.length ?? 0;
    const allowedCount = Math.max(0, total - blockedCount);
    // Weighted by purpose (GEO_CONFIG.machineReadability.botPurposeWeights):
    // what counts is whether the page can appear in AI answers.
    const purposeWeights = config.botPurposeWeights;
    const botWeight = (bot: string) => purposeWeights[BOT_INFO[bot]?.purpose ?? 'training'];
    const checkedBots = Object.keys(robotsTxt?.allowedBots ?? {});
    const blockedBots = robotsTxt?.blockedBots ?? [];
    const totalBotWeight = checkedBots.reduce((sum, b) => sum + botWeight(b), 0);
    const blockedBotWeight = blockedBots.reduce((sum, b) => sum + botWeight(b), 0);
    const robotsScore = totalBotWeight > 0 ? 1 - blockedBotWeight / totalBotWeight : 1;
    const allBotsAllowed = blockedCount === 0;
    // Only training crawlers blocked: a deliberate opt-out that keeps the
    // page in AI answers — passes, without a recommendation.
    const answerBotsBlocked =
      robotsTxt?.unreachable === true ||
      blockedBots.some((b) => (BOT_INFO[b]?.purpose ?? 'training') !== 'training');
    const hasAnyBlock = answerBotsBlocked;

    const robotsValue = robotsTxt?.unreachable
      ? 'value_allBotsBlocked'
      : !robotsTxt?.exists
      ? 'value_allBotsAllowed'
      : allBotsAllowed
        ? 'value_allBotsAllowed'
        : blockedCount === total
          ? 'value_allBotsBlocked'
          : 'value_someBotsBlocked';

    details.push({
      criterionKey: 'criterion_robotsTxt',
      found: !answerBotsBlocked,
      value: robotsValue,
      weight: config.weights.robotsTxt,
      progress: {
        current: allowedCount,
        target: total,
        unitKey: 'unit_bots',
      },
      ...this.robotsEvidence(robotsTxt, total),
    });

    weightedScore += robotsScore * config.weights.robotsTxt;
    totalWeight += config.weights.robotsTxt;

    // Check 6: content survives without JavaScript.
    // Only scored when the comparison actually ran and says something about
    // rendering — no data or a login wall leaves the weight out entirely, so
    // batch results and history re-renders score exactly as before.
    const crawlerView = pageData.crawlerView;
    const jsRenderingIssue =
      crawlerView?.status === 'partial' || crawlerView?.status === 'js-only';

    if (crawlerView && crawlerView.status !== 'auth-wall') {
      const crawlerScore = crawlerView.status === 'ok' ? 1 : crawlerView.coverage;
      const crawlerValue =
        crawlerView.status === 'ok'
          ? 'value_crawlerOk'
          : crawlerView.status === 'partial'
            ? 'value_crawlerPartial'
            : 'value_crawlerJsOnly';

      details.push({
        criterionKey: 'criterion_crawlerView',
        found: crawlerView.status === 'ok',
        value: crawlerValue,
        weight: config.weights.crawlerView,
        progress: {
          current: Math.round(crawlerScore * 100),
          target: 100,
          unitKey: 'unit_percent',
        },
        evidence: this.crawlerEvidence(crawlerView),
      });

      weightedScore += crawlerScore * config.weights.crawlerView;
      totalWeight += config.weights.crawlerView;
    }

    const recommendations: string[] = [];
    // Also when the type the page type calls for (Article, FAQPage) is missing
    // A page that only lacks FAQPage gets the FAQ template, not the Article one
    const onlyFaqMissing =
      hasSchema && schemaCheck.missing.length === 1 && schemaCheck.missing[0] === 'FAQPage';
    if (onlyFaqMissing) recommendations.push('no_faq_schema');
    else if (!hasSchema || schemaCheck.missing.length > 0) recommendations.push('no_schema');
    if (completeness.totalRequired > 0 && completeness.missingByType.length > 0) {
      recommendations.push('schema_incomplete');
    }
    if (!hasEntities) recommendations.push('few_entities');
    if (!hasSemanticHTML) recommendations.push('weak_semantic_html');
    if (!hasGoodLinking) recommendations.push('weak_internal_links');
    if (!hasLlmsTxt) recommendations.push('no_llms_txt');
    if (hasAnyBlock) recommendations.push('ai_bots_blocked');
    if (jsRenderingIssue) recommendations.push('js_only_content');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  // Distinct relevant types plus the page-type rule (see
  // GEO_CONFIG.machineReadability.schemaTypes): an article page needs an
  // Article-family type, a page with a visible FAQ needs FAQPage. A missing
  // expected type keeps the check one short of its target.
  private evaluateSchemaTypes(
    pageData: PageData,
    pageType: PageType
  ): SchemaTypeCheck {
    const config = GEO_CONFIG.machineReadability.schemaTypes;
    const allTypes = [...new Set(pageData.schema.flatMap(schemaTypesOf))];
    // FAQPage counts only with questions a reader can see; Google expects the
    // markup to mirror visible Q&A, and section titles are no questions.
    const faqUnbacked = allTypes.includes('FAQPage') && visibleQuestions(pageData).size === 0;
    const foundTypes = allTypes.filter(
      (t) => RELEVANT_SCHEMA_TYPES.has(t) && !(faqUnbacked && t === 'FAQPage')
    );
    const otherTypes = allTypes.filter((t) => !RELEVANT_SCHEMA_TYPES.has(t));

    const missing: string[] = [];
    if (pageType === 'article' && !foundTypes.some((t) => ARTICLE_SCHEMA_TYPES.includes(t))) {
      missing.push('Article');
    }
    if ((pageData.faqQuestions?.length ?? 0) >= config.faqMinQuestions && !foundTypes.includes('FAQPage')) {
      missing.push('FAQPage');
    }

    let current = Math.min(foundTypes.length, config.target);
    if (missing.length > 0) current = Math.min(current, config.target - 1);
    return { foundTypes, otherTypes, faqUnbacked, missing, current, target: config.target };
  }

  // Report evidence for the schema type check: what was found, which type
  // the page calls for and why, and which fix applies.
  private schemaEvidence(
    pageData: PageData,
    check: SchemaTypeCheck
  ): { evidence: EvidenceLine[]; fixKey?: string } {
    const evidence: EvidenceLine[] = [];
    const faqQuestions = pageData.faqQuestions ?? [];
    if (check.foundTypes.length > 0) {
      evidence.push({ key: 'ev_schema_found', params: { types: check.foundTypes.join(', ') } });
    } else if (!check.faqUnbacked) {
      evidence.push({ key: 'ev_schema_none' });
    }
    if (check.otherTypes.length > 0) {
      evidence.push({ key: 'ev_schema_other', params: { types: check.otherTypes.slice(0, 6).join(', ') } });
    }
    if (check.faqUnbacked) evidence.push({ key: 'ev_schema_faq_unbacked' });
    if (check.missing.includes('Article')) evidence.push({ key: 'ev_schema_missing_article' });
    if (check.missing.includes('FAQPage')) {
      evidence.push({
        key: 'ev_schema_missing_faq',
        params: { count: faqQuestions.length, example: clip(faqQuestions[0] ?? '') },
      });
    } else if (
      check.foundTypes.includes('FAQPage') &&
      faqQuestions.length >= GEO_CONFIG.machineReadability.schemaTypes.faqMinQuestions
    ) {
      evidence.push({ key: 'ev_schema_faq_ok', params: { count: faqQuestions.length } });
    }
    // Even with the expected types added, the page would stay below target
    const tooFew = check.foundTypes.length + check.missing.length < check.target;
    if (check.current < check.target) {
      evidence.push({ key: 'ev_schema_target', params: { count: check.current, target: check.target } });
      if (tooFew) evidence.push({ key: 'ev_schema_too_few' });
    }

    let fixKey: string | undefined;
    if (check.foundTypes.length === 0) fixKey = undefined; // default fix_schema
    else if (check.missing.includes('Article')) fixKey = 'fix_schema_article';
    else if (check.missing.includes('FAQPage')) fixKey = 'fix_schema_faq';
    else if (tooFew) fixKey = 'fix_schema_more';
    return { evidence, ...(fixKey ? { fixKey } : {}) };
  }

  private completenessEvidence(c: CompletenessResult): EvidenceLine[] {
    const evidence: EvidenceLine[] = [
      { key: 'ev_schema_completeness_summary', params: { found: c.foundRequired, total: c.totalRequired } },
    ];
    for (const m of c.missingByType.slice(0, 3)) {
      evidence.push({ key: 'ev_schema_completeness_missing', params: { type: m.type, fields: m.missing.join(', ') } });
    }
    if (c.unnamedAuthor) evidence.push({ key: 'ev_schema_completeness_author_unnamed' });
    if (c.completeTypes.length > 0) {
      evidence.push({ key: 'ev_schema_completeness_ok', params: { types: [...new Set(c.completeTypes)].join(', ') } });
    }
    return evidence;
  }

  private semanticEvidence(el: PageData['semanticElements']): EvidenceLine[] {
    const { semanticElements: weights, semanticBonus } = GEO_CONFIG.machineReadability.scoring;
    const has = (key: string) =>
      el[('has' + key.charAt(0).toUpperCase() + key.slice(1)) as keyof typeof el];
    const keys = [...Object.keys(weights), ...Object.keys(semanticBonus)];
    const present = keys.filter(has);
    const evidence: EvidenceLine[] = [];
    if (present.length > 0) {
      evidence.push({ key: 'ev_semanticHtml_present', params: { elements: present.map((k) => `<${k}>`).join(', ') } });
    } else {
      evidence.push({ key: 'ev_semanticHtml_none' });
    }
    // Missing required landmarks, each with what it is for
    for (const key of Object.keys(weights)) {
      if (!has(key)) evidence.push({ key: `ev_semanticHtml_missing_${key}` });
    }
    return evidence;
  }

  private linkEvidence(linking: LinkCheck): EvidenceLine[] {
    const config = GEO_CONFIG.machineReadability.internalLinks;
    const evidence: EvidenceLine[] = [];
    if (linking.internalCount === 0) {
      evidence.push({ key: 'ev_internalLinks_none', params: { min: config.minCount, nav: linking.navCount } });
      return evidence;
    }
    evidence.push({
      key: 'ev_internalLinks_count',
      params: { count: linking.internalCount, min: config.minCount, nav: linking.navCount },
    });
    if (linking.descriptiveExamples.length > 0) {
      evidence.push({ key: 'ev_internalLinks_examples', params: { examples: quoteList(linking.descriptiveExamples) } });
    }
    if (linking.genericExamples.length > 0) {
      evidence.push({
        key: 'ev_internalLinks_generic',
        params: { count: linking.genericExamples.length, examples: quoteList(linking.genericExamples) },
      });
    }
    evidence.push({
      key: 'ev_internalLinks_ratio',
      params: {
        percent: Math.round(linking.descriptiveRatio * 100),
        min: Math.round(config.descriptiveRatioMin * 100),
      },
    });
    return evidence;
  }

  private llmsTxtEvidence(pageData: PageData): EvidenceLine[] {
    const llms = pageData.llmsTxt;
    let origin = '';
    try {
      origin = new URL(pageData.url).origin;
    } catch {
      // keep the bare file name
    }
    const indexUrl = llms?.url ?? `${origin}/llms.txt`;
    const fullUrl = llms?.fullUrl ?? `${origin}/llms-full.txt`;
    const evidence: EvidenceLine[] = [];
    if (llms?.exists) {
      evidence.push({ key: 'ev_llmsTxt_found', params: { url: indexUrl, chars: llms.contentLength ?? 0 } });
    } else {
      evidence.push({ key: 'ev_llmsTxt_missing', params: { url: indexUrl } });
    }
    if (llms?.fullExists) {
      evidence.push({ key: 'ev_llmsTxt_full_found', params: { url: fullUrl, chars: llms.fullContentLength ?? 0 } });
    } else {
      evidence.push({ key: 'ev_llmsTxt_full_missing' });
    }
    return evidence;
  }

  private robotsEvidence(
    robots: PageData['robotsTxt'] | undefined,
    total: number
  ): { evidence: EvidenceLine[]; fixKey?: string } {
    if (robots?.unreachable) {
      return {
        evidence: [{ key: 'ev_robotsTxt_unreachable', params: { status: robots.httpStatus ?? 500 } }],
        fixKey: 'fix_robotsTxt_unreachable',
      };
    }
    if (!robots?.exists) return { evidence: [{ key: 'ev_robotsTxt_none' }] };
    const path = robots.path || '/';
    const blocked = robots.blockedBots;
    if (blocked.length === 0) {
      return { evidence: [{ key: 'ev_robotsTxt_all_allowed', params: { count: total, path } }] };
    }
    const label = (bot: string) => (BOT_INFO[bot] ? `${bot} (${BOT_INFO[bot].owner})` : bot);
    const byPurpose = (purpose: BotPurpose) =>
      blocked.filter((b) => (BOT_INFO[b]?.purpose ?? 'training') === purpose).map(label).join(', ');
    const evidence: EvidenceLine[] = [
      { key: 'ev_robotsTxt_blocked_count', params: { blocked: blocked.length, total, path } },
    ];
    const index = byPurpose('index');
    const search = byPurpose('search');
    const user = byPurpose('user');
    const training = byPurpose('training');
    if (index) evidence.push({ key: 'ev_robotsTxt_blocked_index', params: { bots: index } });
    if (search) evidence.push({ key: 'ev_robotsTxt_blocked_search', params: { bots: search } });
    if (user) evidence.push({ key: 'ev_robotsTxt_blocked_user', params: { bots: user } });
    if (training) evidence.push({ key: 'ev_robotsTxt_blocked_training', params: { bots: training } });
    return { evidence, ...(!index && !search && !user ? { fixKey: 'fix_robotsTxt_training' } : {}) };
  }

  private crawlerEvidence(cv: NonNullable<PageData['crawlerView']>): EvidenceLine[] {
    const evidence: EvidenceLine[] = [
      {
        key: 'ev_crawlerView_text',
        params: {
          raw: cv.rawChars,
          rendered: cv.renderedChars,
          percent: Math.round(Math.min(1, cv.coverage) * 100),
        },
      },
      { key: 'ev_crawlerView_headings', params: { raw: cv.rawHeadings, rendered: cv.renderedHeadings } },
    ];
    if (cv.renderedHasH1 && !cv.rawHasH1) evidence.push({ key: 'ev_crawlerView_h1_missing' });
    if (cv.missingHeadings.length > 0) {
      evidence.push({
        key: 'ev_crawlerView_missing_headings',
        params: { count: cv.missingHeadings.length, examples: quoteList(cv.missingHeadings) },
      });
    }
    if (cv.rawSchemaBlocks < cv.renderedSchemaBlocks) {
      evidence.push({
        key: 'ev_crawlerView_schema',
        params: { raw: cv.rawSchemaBlocks, rendered: cv.renderedSchemaBlocks },
      });
    }
    return evidence;
  }

  private evaluateInternalLinks(links: PageData['links'], pageUrl: string): LinkCheck {
    const config = GEO_CONFIG.machineReadability.internalLinks;

    // Contextual links only: header/nav/footer menus repeat on every page and
    // say nothing about this page's topic. Each target counts once; it is
    // descriptive when any of its anchors is.
    const targets = new Map<string, boolean>();
    // Anchor texts per target, for the report examples
    const anchorText = new Map<string, string>();
    let navCount = 0;
    for (const link of links) {
      if (link.isExternal) continue;
      if (link.isNavigational) {
        navCount++;
        continue;
      }
      const target = normalizeLinkTarget(link.href, pageUrl);
      if (!target) continue;
      const descriptive = this.isDescriptiveAnchor(link.text);
      targets.set(target, (targets.get(target) ?? false) || descriptive);
      if (!anchorText.has(target) || descriptive) anchorText.set(target, link.text.trim());
    }

    const internalCount = targets.size;
    if (internalCount === 0) {
      return { score: 0, internalCount: 0, descriptiveRatio: 0, navCount, descriptiveExamples: [], genericExamples: [] };
    }
    const descriptiveExamples: string[] = [];
    const genericExamples: string[] = [];
    for (const [target, descriptive] of targets) {
      const text = anchorText.get(target) || '';
      if (descriptive) descriptiveExamples.push(text);
      else genericExamples.push(text || target.replace(/^[^/]+/, ''));
    }

    const descriptiveCount = [...targets.values()].filter(Boolean).length;
    const descriptiveRatio = descriptiveCount / internalCount;

    const countScore = Math.min(1, internalCount / config.minCount);
    const descriptiveScore = Math.min(1, descriptiveRatio / config.descriptiveRatioMin);

    return {
      score: countScore * 0.5 + descriptiveScore * 0.5,
      internalCount,
      descriptiveRatio,
      navCount,
      descriptiveExamples,
      genericExamples,
    };
  }

  private isDescriptiveAnchor(rawText: string): boolean {
    const text = rawText.trim();
    if (text.length <= 2) return false; // icons, arrows, bare symbols
    return !GEO_CONFIG.machineReadability.internalLinks.genericAnchorPatterns.some((p) => p.test(text));
  }

  // "Clear entities": signals that let a machine tie the page to known things
  // in a knowledge graph — not how often nouns appear in the text. Each
  // signal counts once (an author from schema and from the byline is one
  // signal); weights in GEO_CONFIG.machineReadability.scoring.entitySignals.
  private evaluateEntities(pageData: PageData): { score: number; evidence: EvidenceLine[] } {
    const w = GEO_CONFIG.machineReadability.scoring.entitySignals;
    const schemas = pageData.schema;
    const byId = indexById(schemas);

    // Organizations: standalone nodes, publishers, and organizations credited as author
    const credited = schemas.flatMap((s) => resolveNodes(s.author, byId));
    const orgNodes = [
      ...schemas.filter(isOrganizationNode),
      ...schemas.flatMap((s) => resolveNodes(s.publisher, byId)),
      ...credited.filter(isOrganizationNode),
    ];
    const personNodes = [
      ...schemas.filter((s) => schemaTypesOf(s).includes('Person')),
      ...credited.filter((n) => !isOrganizationNode(n)),
    ];
    const namedOrgs = orgNodes.filter((n) => nodeName(n) !== null);
    const namedPersons = personNodes.filter((n) => nodeName(n) !== null);

    const orgNamed =
      namedOrgs.length > 0 ||
      schemas.some((s) => plainName(s.publisher, byId) !== null) ||
      pageData.author?.source === 'publisher';
    const orgVerifiable = namedOrgs.some((n) => !isEmptyValue(n.logo) || !isEmptyValue(n.sameAs));

    const personNamed =
      namedPersons.length > 0 ||
      schemas.some((s) => plainName(s.author, byId) !== null) ||
      (pageData.author !== null && pageData.author.source !== 'publisher');
    const personVerifiable = namedPersons.some((n) => !isEmptyValue(n.sameAs) || !isEmptyValue(n.url));

    const topic = schemas.some((s) => !isEmptyValue(s.about) || !isEmptyValue(s.mentions));

    const linkedGraph = this.hasLinkedGraph(schemas, byId);

    let score = 0;
    if (orgNamed) score += w.organizationNamed;
    if (orgVerifiable) score += w.organizationVerifiable;
    if (personNamed) score += w.personNamed;
    if (personVerifiable) score += w.personVerifiable;
    if (linkedGraph) score += w.linkedGraph;
    if (topic) score += w.topic;

    // Report evidence: one line per signal, found or missing
    const evidence: EvidenceLine[] = [];
    const orgName =
      nodeName(namedOrgs[0] ?? {}) ??
      schemas.map((s) => plainName(s.publisher, byId)).find((n) => n !== null) ??
      (pageData.author?.source === 'publisher' ? pageData.author.name : null);
    if (orgNamed && orgName) {
      evidence.push({ key: 'ev_entities_org_named', params: { name: clip(orgName) } });
      evidence.push({ key: orgVerifiable ? 'ev_entities_org_verifiable' : 'ev_entities_org_unverifiable' });
    } else {
      evidence.push({ key: 'ev_entities_org_none' });
    }
    const schemaPerson =
      nodeName(namedPersons[0] ?? {}) ?? schemas.map((s) => plainName(s.author, byId)).find((n) => n !== null);
    if (personNamed && schemaPerson) {
      evidence.push({ key: 'ev_entities_person_named', params: { name: clip(schemaPerson) } });
      evidence.push({ key: personVerifiable ? 'ev_entities_person_verifiable' : 'ev_entities_person_unverifiable' });
    } else if (personNamed && pageData.author) {
      // Named only in the visible byline / meta tag, not in the data block
      evidence.push({ key: 'ev_entities_person_named_page', params: { name: clip(pageData.author.name) } });
    } else {
      evidence.push({ key: 'ev_entities_person_none' });
    }
    evidence.push({ key: linkedGraph ? 'ev_entities_graph_linked' : 'ev_entities_graph_loose' });
    const topics = [...new Set(schemas.flatMap((s) => [...topicNames(s.about), ...topicNames(s.mentions)]))];
    if (topic) {
      evidence.push(
        topics.length > 0
          ? { key: 'ev_entities_topic', params: { topics: quoteList(topics) } }
          : { key: 'ev_entities_topic_unnamed' }
      );
    } else {
      evidence.push({ key: 'ev_entities_topic_none' });
    }

    return { score: Math.min(1, score), evidence };
  }

  // Nodes that point at each other via @id (Article → author → Organization)
  // form one graph instead of loose fragments.
  private hasLinkedGraph(schemas: SchemaData[], byId: Map<string, SchemaNode>): boolean {
    if (byId.size === 0) return false;
    const refersElsewhere = (value: unknown, ownId: unknown): boolean => {
      if (Array.isArray(value)) return value.some((v) => refersElsewhere(v, ownId));
      if (typeof value === 'string') return value !== ownId && byId.has(value);
      if (value && typeof value === 'object') {
        const id = (value as SchemaNode)['@id'];
        return typeof id === 'string' && id !== ownId && byId.has(id);
      }
      return false;
    };
    return schemas.some((s) =>
      Object.entries(s).some(([key, value]) => !key.startsWith('@') && refersElsewhere(value, s['@id']))
    );
  }

  private evaluateSchemaCompleteness(
    schemas: PageData['schema']
  ): CompletenessResult {
    const required = GEO_CONFIG.machineReadability.schemaRequiredFields;
    const byId = indexById(schemas);
    let foundRequired = 0;
    let totalRequired = 0;
    const missingByType: { type: string; missing: string[] }[] = [];
    const completeTypes: string[] = [];
    let unnamedAuthor = false;
    const seen = new Set<string>();

    for (const schema of schemas) {
      // Identical nodes (the same block emitted twice) are validated once
      let fingerprint: string | null = null;
      try {
        fingerprint = JSON.stringify(schema);
      } catch {
        // not serializable — validate it anyway
      }
      if (fingerprint !== null) {
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
      }

      // A multi-typed node (["NewsArticle", "FAQPage"]) needs the fields of
      // every type it claims. Article subtypes fall back to Article.
      const checkedTypes = schemaTypesOf(schema).filter(
        (t) => required[t] || ARTICLE_SCHEMA_TYPES.includes(t)
      );
      if (checkedTypes.length === 0) continue;
      const requiredFields = [
        ...new Set(checkedTypes.flatMap((t) => required[t] ?? required.Article)),
      ];

      // A schema is "shallow" if it carries only @-keys (@type from
      // microdata/RDFa where we can't read properties, or a bare @id
      // reference). Skip those — we can't validate them fairly.
      const keys = Object.keys(schema).filter((k) => !k.startsWith('@'));
      if (keys.length === 0) continue;

      const missing: string[] = [];
      for (const field of requiredFields) {
        const value = (schema as Record<string, unknown>)[field];
        // An author must name someone; {"@type": "Person"} alone does not
        const present = field === 'author' ? hasNamedEntity(value, byId) : !isEmptyValue(value);
        if (present) {
          foundRequired++;
        } else {
          missing.push(field);
          if (field === 'author' && !isEmptyValue(value)) unnamedAuthor = true;
        }
        totalRequired++;
      }

      if (missing.length > 0) {
        missingByType.push({ type: checkedTypes.join('/'), missing });
      } else {
        completeTypes.push(checkedTypes.join('/'));
      }
    }

    return { foundRequired, totalRequired, missingByType, completeTypes, unnamedAuthor };
  }

  private evaluateSemanticHTML(
    semanticElements: PageData['semanticElements']
  ): number {
    const { semanticElements: weights, semanticBonus } = GEO_CONFIG.machineReadability.scoring;
    const present = (key: string) =>
      semanticElements[('has' + key.charAt(0).toUpperCase() + key.slice(1)) as keyof typeof semanticElements];

    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      if (present(key)) score += weight;
    }
    // Optional landmarks top up, never required
    for (const [key, weight] of Object.entries(semanticBonus)) {
      if (present(key)) score += weight;
    }

    return Math.min(1, score);
  }
}
