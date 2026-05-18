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
  source: 'time-element' | 'meta' | 'schema';
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

export interface RobotsTxtData {
  exists: boolean;
  url?: string;
  allowedBots: Record<string, boolean>;
  blockedBots: string[];
  totalChecked: number;
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
