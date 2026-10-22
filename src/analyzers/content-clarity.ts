import { PageData, AnalysisCategory, CategoryDetail, EvidenceLine } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import {
  computeFleschReadingEase,
  computeLix,
  computeReadabilityScore,
  readabilityBand,
  readabilityRawForScore,
  readabilityStats,
  resolveContentLang,
} from '../utils/readability';
import { t } from '../utils/i18n';
import { formatDecimal, languageName, missingAnswers, quote, quoteList } from './clarity-evidence';

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
      ...this.h1Evidence(pageData.headings, h1s),
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
      ...this.hierarchyEvidence(pageData.headings),
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
      ...this.scanabilityEvidence(pageData),
      progress: {
        current: scanPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += scanScore * config.weights.scanability;
    totalWeight += config.weights.scanability;

    // Check 4: Lesbarkeit (Flesch nur für englischen Inhalt, sonst LIX —
    // gewählt nach Sprache des Inhalts, nie nach UI-Sprache)
    const contentLang = resolveContentLang(pageData.lang, pageData.paragraphs);
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
        ...this.readabilityEvidence(pageData.paragraphs, contentLang, readability),
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

  // ── Report evidence ────────────────────────────────────────────────────

  private h1Evidence(
    headings: PageData['headings'],
    h1s: PageData['headings']
  ): Pick<CategoryDetail, 'evidence' | 'fixKey'> {
    const { h1MinLength, h1MaxLength } = GEO_CONFIG.contentClarity.thresholds;
    if (h1s.length === 0) {
      const evidence: EvidenceLine[] = [{ key: 'ev_h1_none' }];
      if (headings.length > 0) {
        evidence.push({
          key: 'ev_h1_first_heading',
          params: { level: headings[0].level, text: quote(headings[0].text) },
        });
      }
      return { evidence };
    }
    if (h1s.length > 1) {
      return {
        evidence: [{
          key: 'ev_h1_multiple',
          params: { count: h1s.length, examples: quoteList(h1s.map((h) => h.text)) },
        }],
        fixKey: 'fix_h1_multiple',
      };
    }
    const text = h1s[0].text;
    if (text.length < h1MinLength) {
      return {
        evidence: [{ key: 'ev_h1_too_short', params: { text: quote(text), length: text.length, min: h1MinLength } }],
        fixKey: 'fix_h1_length',
      };
    }
    if (text.length > h1MaxLength) {
      return {
        evidence: [{ key: 'ev_h1_too_long', params: { text: quote(text), length: text.length, max: h1MaxLength } }],
        fixKey: 'fix_h1_length',
      };
    }
    return { evidence: [{ key: 'ev_h1_ok', params: { text: quote(text, 100) } }] };
  }

  // Mirrors evaluateHeadingHierarchy: one line per deduction it applies.
  private hierarchyEvidence(headings: PageData['headings']): Pick<CategoryDetail, 'evidence' | 'fixKey'> {
    if (headings.length === 0) {
      return { evidence: [{ key: 'ev_hierarchy_none' }], fixKey: 'fix_hierarchy_none' };
    }
    const evidence: EvidenceLine[] = [];
    const countOf = (level: number) => headings.filter((h) => h.level === level).length;
    const outline = [1, 2, 3, 4, 5, 6]
      .map((level) => ({ level, n: countOf(level) }))
      .filter(({ level, n }) => n > 0 || level <= 3)
      .map(({ level, n }) => `${n} × H${level}`)
      .join(', ');
    evidence.push({ key: 'ev_hierarchy_outline', params: { outline } });

    const h1Count = countOf(1);
    let problems = 0;
    if (h1Count === 0) {
      evidence.push({ key: 'ev_hierarchy_no_h1' });
      problems++;
    } else if (h1Count > 1) {
      evidence.push({ key: 'ev_hierarchy_multiple_h1', params: { count: h1Count } });
      problems++;
    }

    const firstH1Index = headings.findIndex((h) => h.level === 1);
    if (firstH1Index > 2) {
      evidence.push({
        key: 'ev_hierarchy_late_h1',
        params: {
          position: firstH1Index + 1,
          before: quoteList(headings.slice(0, firstH1Index).map((h) => h.text), 2),
        },
      });
      problems++;
    }

    const skips: string[] = [];
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level - headings[i - 1].level > 1) {
        skips.push(`H${headings[i - 1].level} → H${headings[i].level} ${quote(headings[i].text, 50)}`);
      }
    }
    if (skips.length > 0) {
      evidence.push({
        key: 'ev_hierarchy_skips',
        params: { count: skips.length, examples: skips.slice(0, 3).join('; ') },
      });
      problems++;
    }

    const subheadings = headings.filter((h) => h.level >= 2 && h.level <= 3).length;
    if (subheadings < 2) {
      evidence.push({ key: 'ev_hierarchy_few_subheadings', params: { count: subheadings } });
      problems++;
    }

    if (problems === 0) evidence.push({ key: 'ev_hierarchy_ok' });
    return { evidence, ...(h1Count === 0 ? { fixKey: 'fix_hierarchy_no_h1' } : {}) };
  }

  // Mirrors evaluateScanability: paragraphs, their length, lists and
  // heading density, plus a hint when question headings carry no text.
  private scanabilityEvidence(pageData: PageData): Pick<CategoryDetail, 'evidence' | 'fixKey'> {
    const scoring = GEO_CONFIG.contentClarity.scoring;
    const minChars = scoring.substantiveParagraphMinChars;
    const tiers = scoring.paragraphLengthChars;
    const paragraphs = pageData.paragraphs.filter((p) => p.length >= minChars);
    const evidence: EvidenceLine[] = [];

    if (paragraphs.length === 0) {
      evidence.push({ key: 'ev_scannable_no_paragraphs', params: { min: minChars } });
    } else {
      const avg = Math.round(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length);
      evidence.push({
        key: 'ev_scannable_paragraphs',
        params: { count: paragraphs.length, avg, min: minChars, good: tiers.good },
      });
      const longest = paragraphs.reduce((a, b) => (b.length > a.length ? b : a));
      if (paragraphs.length > 1 && longest.length > tiers.good) {
        const tooLong = paragraphs.filter((p) => p.length > tiers.good).length;
        evidence.push({
          key: 'ev_scannable_longest',
          params: { length: longest.length, text: quote(longest), count: tooLong, good: tiers.good },
        });
      }
    }

    const lists = pageData.lists.length;
    evidence.push(lists > 0
      ? { key: 'ev_scannable_lists', params: { count: lists } }
      : { key: 'ev_scannable_no_lists' });

    const subheadings = pageData.headings.filter((h) => h.level >= 2 && h.level <= 3).length;
    const blocks = paragraphs.length + lists;
    if (blocks > 0) {
      const r = scoring.headingRatio;
      const ratio = subheadings / blocks;
      const params = { headings: subheadings, blocks };
      if (ratio > r.max) evidence.push({ key: 'ev_scannable_headings_too_many', params });
      else if (ratio < r.good) evidence.push({ key: 'ev_scannable_headings_too_few', params });
      else evidence.push({ key: 'ev_scannable_headings_ok', params });
    }

    const { hidden, empty } = missingAnswers(pageData);
    if (hidden > 0) {
      evidence.push({ key: 'ev_scannable_hidden_answers', params: { count: hidden } });
      return { evidence, fixKey: 'fix_scannable_hidden' };
    }
    if (empty > 0) evidence.push({ key: 'ev_scannable_empty_questions', params: { count: empty } });
    return { evidence };
  }

  private readabilityEvidence(
    paragraphs: string[],
    contentLang: string | null,
    readability: NonNullable<ReturnType<typeof computeReadabilityScore>>
  ): Pick<CategoryDetail, 'evidence'> {
    const { formula, raw } = readability;
    const blocks = paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);
    const evidence: EvidenceLine[] = [];

    if (formula === 'flesch') {
      evidence.push({ key: 'ev_readability_formula_flesch' });
    } else if (contentLang) {
      evidence.push({ key: 'ev_readability_formula_lix', params: { lang: languageName(contentLang) } });
    } else {
      evidence.push({ key: 'ev_readability_formula_lix_unknown' });
    }

    const value = Math.round(raw);
    const band = t(readabilityBand(raw, formula).i18nKey);
    // Pass mark as a whole number on the safe side (LIX 52.5 → 52).
    const passRaw = readabilityRawForScore(GEO_CONFIG.contentClarity.thresholds.readabilityScoreMin, formula);
    const pass = formula === 'lix' ? Math.floor(passRaw) : Math.ceil(passRaw);
    evidence.push({
      key: formula === 'lix' ? 'ev_readability_value_lix' : 'ev_readability_value_flesch',
      params: { value, band, pass },
    });

    const stats = readabilityStats(blocks, 'en');
    if (stats) {
      const wps = Math.round(stats.words / stats.sentences);
      evidence.push(formula === 'lix'
        ? {
            key: 'ev_readability_stats_lix',
            params: { wps, longPct: Math.round((stats.longWords * 100) / stats.words) },
          }
        : {
            key: 'ev_readability_stats_flesch',
            params: { wps, syllables: formatDecimal(stats.syllables / stats.words) },
          });
      if (stats.words < 150) {
        evidence.push({ key: 'ev_readability_little_text', params: { words: stats.words, paragraphs: blocks.length } });
      }
    }

    // Hardest substantive paragraph: where the editorial team should start.
    const scored = blocks
      .filter((p) => p.length >= GEO_CONFIG.contentClarity.scoring.substantiveParagraphMinChars)
      .map((p) => ({ p, v: formula === 'lix' ? computeLix(p) : computeFleschReadingEase(p, 'en') }))
      .filter((x): x is { p: string; v: number } => x.v !== null);
    if (scored.length >= 1) {
      const hardest = scored.reduce((a, b) =>
        (formula === 'lix' ? b.v > a.v : b.v < a.v) ? b : a
      );
      evidence.push({
        key: formula === 'lix' ? 'ev_readability_hardest_lix' : 'ev_readability_hardest_flesch',
        params: { value: Math.round(hardest.v), text: quote(hardest.p) },
      });
    }
    return { evidence };
  }
}
