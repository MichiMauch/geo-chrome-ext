import { PageData, AnalysisCategory, CategoryDetail, EvidenceLine, PageType, QuestionAnswer } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { missingAnswers, quote, quoteList } from './clarity-evidence';

interface DefinitionStats {
  score: number;
  definitionCount: number;
  definitionExample: string | null;
  // Question headings, how many open with a direct answer (incl. those
  // already counted as a definition), and one example pair.
  questions: number;
  answered: number;
  answerExample: QuestionAnswer | null;
  structuredCount: number;
  // Definitions + direct answers as counted by the score.
  counted: number;
}

export class AnswerabilityAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_answerability';

  analyze(pageData: PageData, pageType?: PageType): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.answerability;

    // Homepages are navigation hubs — definition sentences ("X is …")
    // belong on content pages, so don't demand them here.
    const isHomepage = pageType === 'homepage';

    // Check 1: Direkte Antworten/Definitionen
    const definitionStats = this.evaluateDefinitions(pageData.paragraphs, pageData.questionAnswers);
    const definitionScore = definitionStats.score;
    const hasDefinitions = definitionScore > 0.3;
    const definitionPercent = Math.round(definitionScore * 100);

    if (isHomepage) {
      details.push(this.notApplicable('criterion_definitions'));
    } else {
      details.push({
        criterionKey: 'criterion_definitions',
        found: hasDefinitions,
        value: `${definitionPercent}%`,
        weight: config.weights.definitions,
        ...this.definitionEvidence(definitionStats, pageData),
        progress: {
          current: definitionPercent,
          target: 100,
          unitKey: 'unit_percent',
        },
      });

      weightedScore += definitionScore * config.weights.definitions;
      totalWeight += config.weights.definitions;
    }

    // Check 2: Listen & Aufzählungen
    const listCount = pageData.lists.length;
    const hasLists = listCount >= 1;
    const listScore = Math.min(1, listCount / config.thresholds.listMinCount);

    details.push({
      criterionKey: 'criterion_lists',
      found: hasLists,
      value: 'value_lists', // Now a key
      weight: config.weights.lists,
      progress: {
        current: Math.min(listCount, config.thresholds.listMinCount),
        target: config.thresholds.listMinCount,
        unitKey: 'unit_lists',
      },
      evidence: this.listEvidence(pageData.lists),
    });

    weightedScore += listScore * config.weights.lists;
    totalWeight += config.weights.lists;

    // Check 3: Strukturierte Abschnitte
    // Score = share of the target subheadings reached (same ratio as the
    // progress bar), halved when there is too little body text under them.
    const subheadingCount = pageData.headings.filter((h) => h.level >= 2).length;
    const hasEnoughParagraphs = pageData.paragraphs.length >= config.thresholds.sectionMinParagraphs;
    const hasStructuredSections = subheadingCount >= config.thresholds.sectionMinCount && hasEnoughParagraphs;
    const sectionCoverage = Math.min(1, subheadingCount / config.thresholds.sectionMinCount);
    const sectionScore = hasEnoughParagraphs
      ? sectionCoverage
      : sectionCoverage * config.thresholds.sectionThinContentFactor;

    details.push({
      criterionKey: 'criterion_sections',
      found: hasStructuredSections,
      value: 'value_subheadings', // Now a key
      weight: config.weights.sections,
      progress: {
        current: Math.min(subheadingCount, config.thresholds.sectionMinCount),
        target: config.thresholds.sectionMinCount,
        unitKey: 'unit_subheadings',
      },
      ...this.sectionEvidence(pageData, subheadingCount, hasEnoughParagraphs),
    });

    weightedScore += sectionScore * config.weights.sections;
    totalWeight += config.weights.sections;

    const recommendations: string[] = [];
    if (!isHomepage && !hasDefinitions) recommendations.push('no_definitions');
    if (!hasLists) recommendations.push('no_lists');
    if (!hasStructuredSections) recommendations.push('few_sections');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  private evaluateDefinitions(
    paragraphs: string[],
    questionAnswers: QuestionAnswer[] = []
  ): DefinitionStats {
    const definitionPatterns = GEO_CONFIG.answerability.patterns.definitions;
    const structuredPatterns = GEO_CONFIG.answerability.patterns.structured;

    let definitionCount = 0;
    let structuredCount = 0;
    const definitionParagraphs: string[] = [];
    let definitionExample: string | null = null;

    paragraphs.forEach((p) => {
      // Definition patterns are anchored at the sentence start, so test each
      // sentence on its own. Questions ("Was ist ein Smart Meter?") ask for
      // a definition rather than give one.
      const definition = splitSentences(p).find(
        (sentence) =>
          !sentence.endsWith('?') &&
          definitionPatterns.some((pattern) => pattern.test(sentence))
      );
      if (definition !== undefined) {
        definitionExample ??= definition;
        definitionCount++;
        definitionParagraphs.push(p);
      }

      if (structuredPatterns.some((pattern) => pattern.test(p))) structuredCount++;
    });

    // A question heading followed straight away by a statement is a direct
    // answer, whatever its wording. Answers that open with a paragraph
    // already counted as a definition are not counted twice.
    const minWords = GEO_CONFIG.answerability.thresholds.directAnswerMinWords;
    const opensWithStatement = ({ answer }: QuestionAnswer) => {
      const first = splitSentences(answer)[0];
      if (!first || first.endsWith('?')) return false;
      return first.split(/\s+/).length >= minWords;
    };
    const answeredPairs = questionAnswers.filter(opensWithStatement);
    const directAnswers = answeredPairs.filter(
      ({ answer }) => !definitionParagraphs.some((p) => answer.startsWith(p))
    ).length;

    const defScore = Math.min(
      1,
      (definitionCount + directAnswers) / GEO_CONFIG.answerability.thresholds.definitionMinCount
    );
    const structScore = Math.min(1, structuredCount / 2);

    return {
      score: defScore * 0.7 + structScore * 0.3,
      definitionCount,
      definitionExample,
      questions: questionAnswers.length,
      answered: answeredPairs.length,
      answerExample: answeredPairs[0] ?? null,
      structuredCount,
      counted: definitionCount + directAnswers,
    };
  }

  // ── Report evidence ────────────────────────────────────────────────────

  private definitionEvidence(
    stats: DefinitionStats,
    pageData: PageData
  ): Pick<CategoryDetail, 'evidence' | 'fixKey'> {
    const target = GEO_CONFIG.answerability.thresholds.definitionMinCount;
    const evidence: EvidenceLine[] = [];

    evidence.push(stats.definitionExample
      ? { key: 'ev_definitions_sentences', params: { count: stats.definitionCount, example: quote(stats.definitionExample, 80) } }
      : { key: 'ev_definitions_sentences_none' });

    const { hidden, empty } = missingAnswers(pageData);
    if (stats.questions === 0) {
      evidence.push({ key: 'ev_definitions_no_questions' });
    } else {
      evidence.push({
        key: 'ev_definitions_answers',
        params: { questions: stats.questions, answered: stats.answered },
      });
      if (stats.answerExample) {
        evidence.push({
          key: 'ev_definitions_answer_example',
          params: { question: quote(stats.answerExample.question, 60), answer: quote(stats.answerExample.answer, 70) },
        });
      }
      if (hidden > 0) evidence.push({ key: 'ev_definitions_answers_hidden', params: { count: hidden } });
      else if (empty > 0) evidence.push({ key: 'ev_definitions_answers_empty', params: { count: empty } });
    }

    evidence.push({ key: 'ev_definitions_total', params: { count: stats.counted, target } });
    evidence.push({ key: 'ev_definitions_structured', params: { count: stats.structuredCount } });

    if (hidden > 0 && stats.counted < target) return { evidence, fixKey: 'fix_definitions_hidden' };
    // Enough answers: only the step-form share (30 %) is missing.
    if (stats.counted >= target) return { evidence, fixKey: 'fix_definitions_structured' };
    return { evidence };
  }

  private listEvidence(lists: PageData['lists']): EvidenceLine[] {
    const target = GEO_CONFIG.answerability.thresholds.listMinCount;
    if (lists.length === 0) return [{ key: 'ev_lists_none', params: { target } }];
    const items = lists.reduce((sum, l) => sum + l.itemCount, 0);
    const firstItems = lists.map((l) => l.items[0]).filter((s): s is string => !!s && s.trim().length > 0);
    return [
      {
        key: 'ev_lists_found',
        params: {
          count: lists.length,
          ul: lists.filter((l) => l.type === 'ul').length,
          ol: lists.filter((l) => l.type === 'ol').length,
          items,
          target,
        },
      },
      ...(firstItems.length > 0
        ? [{ key: 'ev_lists_examples', params: { examples: quoteList(firstItems, 3) } }]
        : []),
    ];
  }

  private sectionEvidence(
    pageData: PageData,
    subheadingCount: number,
    hasEnoughParagraphs: boolean
  ): Pick<CategoryDetail, 'evidence' | 'fixKey'> {
    const { sectionMinCount, sectionMinParagraphs } = GEO_CONFIG.answerability.thresholds;
    const subheadings = pageData.headings.filter((h) => h.level >= 2);
    const evidence: EvidenceLine[] = [];
    evidence.push(subheadingCount > 0
      ? {
          key: 'ev_sections_count',
          params: { count: subheadingCount, target: sectionMinCount, examples: quoteList(subheadings.map((h) => h.text), 3) },
        }
      : { key: 'ev_sections_none', params: { target: sectionMinCount } });

    const paragraphs = pageData.paragraphs.length;
    if (hasEnoughParagraphs) {
      evidence.push({ key: 'ev_sections_paragraphs_ok', params: { paragraphs } });
      return { evidence };
    }
    evidence.push({
      key: subheadingCount >= sectionMinCount ? 'ev_sections_thin_half' : 'ev_sections_thin',
      params: { paragraphs, min: sectionMinParagraphs },
    });
    const { hidden } = missingAnswers(pageData);
    if (hidden > 0) {
      evidence.push({ key: 'ev_sections_hidden_answers', params: { count: hidden } });
      return { evidence, fixKey: 'fix_sections_hidden' };
    }
    return { evidence, fixKey: subheadingCount >= sectionMinCount ? 'fix_sections_thin' : undefined };
  }
}

// Splits after ., !, ? or … followed by whitespace. Abbreviations ("z. B.")
// over-split, which only ever yields extra non-matching fragments.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
