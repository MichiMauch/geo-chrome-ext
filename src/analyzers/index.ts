import type { PageData, GEOAnalysisResult } from '../types/analysis';
import { ContentClarityAnalyzer } from './content-clarity';
import { AnswerabilityAnalyzer } from './answerability';
import { TrustSourcesAnalyzer } from './trust-sources';
import { MachineReadabilityAnalyzer } from './machine-readability';
import { AiCitationAnalyzer } from './ai-citation';
import { OnPageSeoAnalyzer } from './on-page-seo';
import { calculateTotalScore, getScoreRating } from '../utils/scoring';
import { collectAllRecommendations } from '../utils/recommendations';
import { mapAnalysisResult } from '../utils/analysis-mapper';

const analyzers = {
  contentClarity: new ContentClarityAnalyzer(),
  answerability: new AnswerabilityAnalyzer(),
  trustSources: new TrustSourcesAnalyzer(),
  machineReadability: new MachineReadabilityAnalyzer(),
  aiCitation: new AiCitationAnalyzer(),
  onPageSeo: new OnPageSeoAnalyzer(),
};

export function runFullAnalysis(pageData: PageData): GEOAnalysisResult {
  // Optimize performance: join text once for all analyzers
  (pageData as any).fullText = pageData.paragraphs.join(' ');

  const categories = {
    contentClarity: mapAnalysisResult(analyzers.contentClarity.analyze(pageData)),
    answerability: mapAnalysisResult(analyzers.answerability.analyze(pageData)),
    trustSources: mapAnalysisResult(analyzers.trustSources.analyze(pageData)),
    machineReadability: mapAnalysisResult(analyzers.machineReadability.analyze(pageData)),
    aiCitation: mapAnalysisResult(analyzers.aiCitation.analyze(pageData)),
    onPageSeo: mapAnalysisResult(analyzers.onPageSeo.analyze(pageData)),
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
