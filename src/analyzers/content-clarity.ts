import { PageData, AnalysisCategory, CategoryDetail } from '../types/analysis';
import { BaseAnalyzer, AnalyzerResult } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { computeReadabilityScore } from '../utils/readability';
import { getLang } from '../utils/i18n';

export class ContentClarityAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_contentClarity';

  analyze(pageData: PageData): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;

    const config = GEO_CONFIG.contentClarity;

    // Check 1: H1 vorhanden und aussagekräftig
    const h1s = pageData.headings.filter((h) => h.level === 1);
    const hasGoodH1 =
      h1s.length === 1 &&
      h1s[0].text.length >= config.thresholds.h1MinLength &&
      h1s[0].text.length <= config.thresholds.h1MaxLength;

    details.push({
      criterionKey: 'criterion_h1',
      found: hasGoodH1,
      value: h1s.length > 0
        ? (hasGoodH1 ? 'value_present' : 'value_h1Optimal')
        : 'value_notPresent',
      weight: config.weights.h1,
      progress: {
        current: hasGoodH1 ? 1 : (h1s.length > 0 ? 0.5 : 0),
        target: 1,
        unitKey: 'unit_h1',
      },
    });

    if (hasGoodH1) {
      weightedScore += config.weights.h1;
    } else if (h1s.length > 0) {
      weightedScore += 0.5; // Partial credit remains for basic presence
    }
    totalWeight += config.weights.h1;

    // Check 2: Überschriften-Hierarchie
    const hierarchyScore = this.evaluateHeadingHierarchy(pageData.headings);
    const hasGoodHierarchy = hierarchyScore > config.thresholds.hierarchyScoreMin;
    const hierarchyPercent = Math.round(hierarchyScore * 100);

    details.push({
      criterionKey: 'criterion_hierarchy',
      found: hasGoodHierarchy,
      value: `${hierarchyPercent}%`,
      weight: config.weights.hierarchy,
      progress: {
        current: hierarchyPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += hierarchyScore * config.weights.hierarchy;
    totalWeight += config.weights.hierarchy;

    // Check 3: Scannbarkeit
    const scanScore = this.evaluateScanability(pageData);
    const hasGoodScanability = scanScore > config.thresholds.scanScoreMin;
    const scanPercent = Math.round(scanScore * 100);

    details.push({
      criterionKey: 'criterion_scannable',
      found: hasGoodScanability,
      value: `${scanPercent}%`,
      weight: config.weights.scanability,
      progress: {
        current: scanPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += scanScore * config.weights.scanability;
    totalWeight += config.weights.scanability;

    // Check 4: Lesbarkeit (Flesch / LIX, gewählt nach UI-Sprache)
    const readability = computeReadabilityScore(pageData.paragraphs, getLang());
    let hasGoodReadability = false;
    if (readability !== null) {
      hasGoodReadability = readability.score >= config.thresholds.readabilityScoreMin;
      const readPercent = Math.round(readability.score * 100);

      details.push({
        criterionKey: 'criterion_readability',
        found: hasGoodReadability,
        value: `${Math.round(readability.raw)} ${readability.formula === 'lix' ? 'LIX' : 'Flesch'}`,
        weight: config.weights.readability,
        progress: {
          current: readPercent,
          target: 100,
          unitKey: 'unit_percent',
        },
      });

      weightedScore += readability.score * config.weights.readability;
      totalWeight += config.weights.readability;
    }

    const recommendations: string[] = [];
    if (!hasGoodH1) recommendations.push('no_h1');
    if (!hasGoodHierarchy) recommendations.push('bad_hierarchy');
    if (!hasGoodScanability) recommendations.push('low_scanability');
    if (readability !== null && !hasGoodReadability) recommendations.push('low_readability');

    return this.createCategory(
      0, // score is calculated inside createCategory via normalizeScore
      weightedScore,
      totalWeight,
      details,
      recommendations
    );
  }

  private evaluateHeadingHierarchy(headings: PageData['headings']): number {
    if (headings.length === 0) return 0;
    let score = 1.0;
    const scoring = GEO_CONFIG.contentClarity.scoring.hierarchyDeductions;

    const h1Count = headings.filter((h) => h.level === 1).length;
    if (h1Count === 0) score -= scoring.skipH2;
    if (h1Count > 1) score -= scoring.tooManyH1s;

    const firstH1Index = headings.findIndex((h) => h.level === 1);
    if (firstH1Index > 2) score -= scoring.tooManyH2s;

    for (let i = 1; i < headings.length; i++) {
      const levelDiff = headings[i].level - headings[i - 1].level;
      if (levelDiff > 1) score -= scoring.h4OrDeeper;
    }

    const subheadings = headings.filter((h) => h.level >= 2 && h.level <= 3);
    if (subheadings.length < 2) score -= scoring.noHeadings;
    if (subheadings.length >= 4) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private evaluateScanability(pageData: PageData): number {
    let score = 0;
    const factors = GEO_CONFIG.contentClarity.scoring.scanFactors;
    const paragraphs = pageData.paragraphs;

    if (paragraphs.length >= 3) score += factors.shortParagraphs;
    else if (paragraphs.length >= 1) score += factors.bulletPoints / 2;

    if (paragraphs.length > 0) {
      const tiers = GEO_CONFIG.contentClarity.scoring.paragraphLengthChars;
      const avgLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
      if (avgLength < tiers.good) score += factors.boldText;
      else if (avgLength < tiers.ok) score += factors.numberedLists;
      else if (avgLength < tiers.max) score += factors.shortSentences;
    }

    if (pageData.lists.length >= 2) score += factors.whiteSpace;
    else if (pageData.lists.length >= 1) score += factors.conclusion;

    const subheadings = pageData.headings.filter((h) => h.level >= 2 && h.level <= 3);
    const contentBlocks = paragraphs.length + pageData.lists.length;
    if (contentBlocks > 0) {
      const ratio = subheadings.length / contentBlocks;
      if (ratio >= 0.2) score += factors.clearStructure;
      else if (ratio >= 0.1) score += factors.optimalLength;
    }

    return Math.min(1, score);
  }
}
