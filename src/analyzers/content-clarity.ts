import { PageData, AnalysisCategory, CategoryDetail } from '../types/analysis';
import { BaseAnalyzer, AnalyzerResult } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { computeReadabilityScore, resolveContentLang } from '../utils/readability';
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
      valueParams: { count: String(h1s.length) },
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
      // Partial credit for basic presence, as a share of the weight so it
      // matches the 0.5 progress shown above.
      weightedScore += config.thresholds.h1PartialCredit * config.weights.h1;
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

    // Check 4: Lesbarkeit (Flesch / LIX, gewählt nach Sprache des Inhalts —
    // nicht nach UI-Sprache: eine deutsche Seite bleibt LIX, auch mit EN-UI)
    const contentLang = resolveContentLang(pageData.lang, pageData.paragraphs, getLang());
    const readability = computeReadabilityScore(pageData.paragraphs, contentLang);
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
    const scoring = GEO_CONFIG.contentClarity.scoring;
    const deductions = scoring.hierarchyDeductions;
    let penalty = 0;

    const h1Count = headings.filter((h) => h.level === 1).length;
    if (h1Count === 0) penalty += deductions.noH1;
    if (h1Count > 1) penalty += deductions.multipleH1s;

    const firstH1Index = headings.findIndex((h) => h.level === 1);
    if (firstH1Index > 2) penalty += deductions.lateH1;

    // Every jump of more than one level (H2 → H4) costs the same; mirrored
    // by collectHierarchyBreaks in highlight-targets.
    for (let i = 1; i < headings.length; i++) {
      const levelDiff = headings[i].level - headings[i - 1].level;
      if (levelDiff > 1) penalty += deductions.levelSkip;
    }

    const subheadings = headings.filter((h) => h.level >= 2 && h.level <= 3);
    if (subheadings.length < 2) penalty += deductions.fewSubheadings;

    let score = 1.0 - penalty;
    // The bonus rewards a rich outline that is otherwise flawless; it must
    // not compensate any deduction (e.g. 20 H3s lifting a late H1 to 100%).
    if (penalty === 0 && subheadings.length >= scoring.hierarchyBonus.subheadingMinCount) {
      score += scoring.hierarchyBonus.bonus;
    }
    // No H1 → never a passing hierarchy, however good the rest looks.
    if (h1Count === 0) score = Math.min(score, scoring.noH1Cap);

    return Math.max(0, Math.min(1, score));
  }

  private evaluateScanability(pageData: PageData): number {
    let score = 0;
    const scoring = GEO_CONFIG.contentClarity.scoring;
    const factors = scoring.scanFactors;
    // Short snippets (captions, teasers, "Mehr erfahren"-lines) are not
    // paragraphs a reader scans; they would only drag the average length
    // down and inflate the count.
    const paragraphs = pageData.paragraphs.filter(
      (p) => p.length >= scoring.substantiveParagraphMinChars
    );

    if (paragraphs.length >= 3) score += factors.paragraphCountMany;
    else if (paragraphs.length >= 1) score += factors.paragraphCountFew;

    if (paragraphs.length > 0) {
      const tiers = scoring.paragraphLengthChars;
      const avgLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
      if (avgLength < tiers.good) score += factors.paragraphLengthGood;
      else if (avgLength < tiers.ok) score += factors.paragraphLengthOk;
      else if (avgLength < tiers.max) score += factors.paragraphLengthMax;
    }

    if (pageData.lists.length >= 2) score += factors.listsMany;
    else if (pageData.lists.length >= 1) score += factors.listsOne;

    // Heading density: subheadings per content block, rewarded only inside a
    // sweet spot. More headings than blocks means headings without content.
    const subheadings = pageData.headings.filter((h) => h.level >= 2 && h.level <= 3);
    const contentBlocks = paragraphs.length + pageData.lists.length;
    if (contentBlocks > 0) {
      const r = scoring.headingRatio;
      const ratio = subheadings.length / contentBlocks;
      if (ratio >= r.good && ratio <= r.max) score += factors.headingRatioGood;
      else if (ratio >= r.ok && ratio <= r.excessive) score += factors.headingRatioOk;
    }

    return Math.min(1, score);
  }
}
