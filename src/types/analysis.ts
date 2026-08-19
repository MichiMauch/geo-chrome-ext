// Einzelner Analyse-Bereich
export interface AnalysisCategory {
  nameKey: string; // Translation key instead of plain text
  score: number; // 0-5
  maxScore: 5;
  details: CategoryDetail[];
  recommendations: string[]; // These are translation keys
}

export interface CategoryDetail {
  criterionKey: string; // Translation key
  found: boolean;
  value?: string | number;
  weight: number;
  // Progress info for partial completion (e.g., "2/3" or "67%")
  progress?: {
    current: number;
    target: number;
    unitKey?: string; // Translation key for unit (e.g., "unit_lists")
  };
}

// Detected page type — drives adjusted check expectations (a homepage is not
// scored like an article) and the badge in the panel. 'other' means "not
// confidently detected" and MUST behave exactly like the pre-detection logic.
export type PageType = 'homepage' | 'article' | 'product' | 'other';

// Gesamtergebnis
export interface GEOAnalysisResult {
  url: string;
  timestamp: string;
  totalScore: number; // 0-30 (6 categories × 5)
  maxTotalScore: 30;
  rating: ScoreRating;
  categories: {
    contentClarity: AnalysisCategory;
    answerability: AnalysisCategory;
    trustSources: AnalysisCategory;
    machineReadability: AnalysisCategory;
    aiCitation: AnalysisCategory;
    onPageSeo: AnalysisCategory;
  };
  topRecommendations: string[];
  pageType?: PageType;
  // Recommendation key → affected page elements, computed in the content
  // script at analysis time. Only keys with visible DOM targets are present;
  // consumed by the "show on page" buttons in the panel. Labels are localized
  // per-element explanations rendered as badges next to the marker.
  highlightTargets?: Record<string, HighlightTarget[]>;
  // Heading outline (H1–H6) of the page, attached to the live analyze response
  // only (not persisted to history). Powers the collapsible outline under the
  // "Content clarity" category that visualizes skipped heading levels.
  headings?: HeadingData[];
  // Comparison of the rendered page with the HTML an AI crawler downloads.
  // Live analyses only — absent for the sitemap batch (which already analyzes
  // raw HTML) and when the comparison fetch failed.
  crawlerView?: CrawlerViewData;
}

export interface HighlightTarget {
  selector: string;
  label: string;
  // Optional per-target marker color (outline + badge). When set, it overrides
  // the call-wide severity color — used by the readability markers to color
  // each passage by its own LIX/Flesch band.
  color?: string;
}

export interface ScoreRating {
  level: 'excellent' | 'good' | 'moderate' | 'poor';
  label: string;
  color: string;
}

// DOM-Daten vom Content Script
export interface PageData {
  url: string;
  headings: HeadingData[];
  paragraphs: string[];
  lists: ListData[];
  links: LinkData[];
  meta: MetaData;
  schema: SchemaData[];
  author: AuthorData | null;
  dates: DateData[];
  semanticElements: SemanticElements;
  llmsTxt: LlmsTxtData;
  robotsTxt: RobotsTxtData;
  faqQuestions?: string[];
  images: ImageData[];
  openGraph: OpenGraphData;
  twitterCard: TwitterCardData;
  robotsMeta: RobotsMetaData;
  viewport: ViewportData;
  canonical: CanonicalData;
  // Only set for a live page analysis. The sitemap batch already works on raw
  // HTML, so there is nothing to compare there, and history/report re-renders
  // don't carry it.
  crawlerView?: CrawlerViewData;
}

export interface CanonicalData {
  // Absolute resolved href of <link rel="canonical">; null when the tag is
  // missing, empty, or unparseable (a broken canonical counts as none).
  href: string | null;
}

export interface ViewportData {
  hasViewport: boolean;
  hasDeviceWidth: boolean;
  userScalableNo: boolean;
  rawContent: string | null;
}

export interface ImageData {
  src: string;
  alt: string | null; // null = attribute missing, '' = explicitly empty (decorative)
  hasAltAttribute: boolean;
}

export interface OpenGraphData {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
  type: string | null;
}

export interface TwitterCardData {
  card: string | null; // "summary", "summary_large_image", "app", "player"
  title: string | null;
  description: string | null;
  image: string | null;
}

export interface RobotsMetaData {
  hasNoIndex: boolean;
  hasNoFollow: boolean;
  hasNoArchive: boolean;
  hasNoSnippet: boolean;
  rawContent: string | null; // The original content of <meta name="robots">
}

export interface HeadingData {
  level: number;
  text: string;
}

export interface ListData {
  type: 'ul' | 'ol';
  itemCount: number;
  items: string[];
}

export interface LinkData {
  href: string;
  text: string;
  isExternal: boolean;
}

export interface MetaData {
  title: string;
  description: string;
  author: string;
  publishDate: string | null;
  modifiedDate: string | null;
  ogType: string | null;
}

export interface SchemaData {
  '@type': string;
  name?: string;
  author?: { name?: string; '@type'?: string };
  datePublished?: string;
  dateModified?: string;
  [key: string]: unknown;
}

export interface AuthorData {
  name: string;
  source: 'schema' | 'meta' | 'dom';
}

export interface DateData {
  date: Date;
  formatted: string;
  source: 'time-element' | 'meta' | 'schema' | 'text';
}

export interface SemanticElements {
  hasArticle: boolean;
  hasMain: boolean;
  hasNav: boolean;
  hasAside: boolean;
  hasHeader: boolean;
  hasFooter: boolean;
  hasSection: boolean;
}

export interface LlmsTxtData {
  exists: boolean;
  url?: string;
  hasContent?: boolean;
  contentLength?: number;
}

// What an AI crawler without JavaScript receives, compared with the rendered
// page. 'auth-wall' means the cookie-less fetch hit a login screen, so nothing
// can be said about JS rendering — it must not be scored as missing content.
export type CrawlerViewStatus = 'ok' | 'partial' | 'js-only' | 'auth-wall';

export interface CrawlerViewData {
  status: CrawlerViewStatus;
  httpStatus: number;
  renderedChars: number;
  rawChars: number;
  coverage: number; // rawChars / renderedChars, 0–1
  renderedHeadings: number;
  rawHeadings: number;
  renderedHasH1: boolean;
  rawHasH1: boolean;
  renderedSchemaBlocks: number;
  rawSchemaBlocks: number;
  rawBytes: number;
  // Headings visible in the browser but absent from the crawler's HTML
  missingHeadings: string[];
}

export interface RobotsTxtData {
  exists: boolean;
  url?: string;
  // The URL path (incl. query) the allow/disallow verdict was evaluated
  // against — a site may allow `/` but disallow `/blog/`.
  path?: string;
  // Raw robots.txt body, kept so the sitemap batch can re-evaluate the same
  // file against every analyzed URL without re-fetching it.
  content?: string;
  allowedBots: Record<string, boolean>;
  blockedBots: string[];
  totalChecked: number;
}

// Domain dashboard: one row per analyzed URL of a domain
export interface DomainPageSummary {
  url: string; // normalized URL
  path: string; // pathname + search for display
  lastScore: number;
  ratingLabel: string;
  ratingColor: string;
  lastTimestamp: string;
  delta: number | null; // score change vs previous analysis, null if only one
  analysisCount: number;
}

// History
export interface HistoryEntry {
  timestamp: string;
  totalScore: number;
  ratingLevel: 'excellent' | 'good' | 'moderate' | 'poor';
  ratingLabel: string;
  ratingColor: string;
}

export interface StoredHistory {
  url: string;
  entries: HistoryEntry[]; // newest-first, max 50
}

export interface TrendInfo {
  direction: 'up' | 'down' | 'flat';
  delta: number; // absolute value
  previousScore: number;
  previousTimestamp: string;
}

// Message Types
export interface AnalyzeMessage {
  action: 'analyze';
}

export interface AnalyzeResponse {
  success: boolean;
  result?: GEOAnalysisResult;
  error?: string;
}
