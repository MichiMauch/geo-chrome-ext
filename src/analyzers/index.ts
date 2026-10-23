import type { PageData, PageType, AnalysisCategory, GEOAnalysisResult } from '../types/analysis';
import { ContentClarityAnalyzer } from './content-clarity';
import { AnswerabilityAnalyzer } from './answerability';
import { TrustSourcesAnalyzer } from './trust-sources';
import { MachineReadabilityAnalyzer } from './machine-readability';
import { AiCitationAnalyzer } from './ai-citation';
import { OnPageSeoAnalyzer } from './on-page-seo';
import { calculateTotalScore, getScoreRating } from '../utils/scoring';
import { collectAllRecommendations } from '../utils/recommendations';
import { mapAnalysisResult } from '../utils/analysis-mapper';
import { detectPageType } from '../utils/page-type';

type CategoryKey = keyof GEOAnalysisResult['categories'];

const analyzers = {
  contentClarity: new ContentClarityAnalyzer(),
  answerability: new AnswerabilityAnalyzer(),
  trustSources: new TrustSourcesAnalyzer(),
  machineReadability: new MachineReadabilityAnalyzer(),
  aiCitation: new AiCitationAnalyzer(),
  onPageSeo: new OnPageSeoAnalyzer(),
};

// The six analyzers on one page, results not yet translated (criterion and
// evidence keys intact). The reference corpus compares these.
export function runRawAnalysis(pageData: PageData): { pageType: PageType; categories: Record<CategoryKey, AnalysisCategory> } {
  // Optimize performance: join text once for all analyzers
  (pageData as any).fullText = pageData.paragraphs.join(' ');

  // Page type relaxes expectations where checks don't apply (homepage ≠
  // article); 'other' keeps the exact pre-detection behavior.
  const pageType = detectPageType(pageData);

  return {
    pageType,
    categories: {
      contentClarity: analyzers.contentClarity.analyze(pageData),
      answerability: analyzers.answerability.analyze(pageData, pageType),
      trustSources: analyzers.trustSources.analyze(pageData, pageType),
      machineReadability: analyzers.machineReadability.analyze(pageData),
      aiCitation: analyzers.aiCitation.analyze(pageData, pageType),
      onPageSeo: analyzers.onPageSeo.analyze(pageData),
    },
  };
}

export function runFullAnalysis(pageData: PageData): GEOAnalysisResult {
  const raw = runRawAnalysis(pageData);
  const pageType = raw.pageType;
  const categories = {
    contentClarity: mapAnalysisResult(raw.categories.contentClarity),
    answerability: mapAnalysisResult(raw.categories.answerability),
    trustSources: mapAnalysisResult(raw.categories.trustSources),
    machineReadability: mapAnalysisResult(raw.categories.machineReadability),
    aiCitation: mapAnalysisResult(raw.categories.aiCitation),
    onPageSeo: mapAnalysisResult(raw.categories.onPageSeo),
  };

  const totalScore = calculateTotalScore(categories);
  const rating = getScoreRating(totalScore);
  const topRecommendations = collectAllRecommendations(categories);

  return {
    url: pageData.url,
    timestamp: new Date().toISOString(),
    totalScore,
    maxTotalScore: 30,
    rating,
    categories,
    topRecommendations,
    pageType,
  };
}

export {
  ContentClarityAnalyzer,
  AnswerabilityAnalyzer,
  TrustSourcesAnalyzer,
  MachineReadabilityAnalyzer,
  AiCitationAnalyzer,
  OnPageSeoAnalyzer,
}
