import { PageData, AnalysisCategory, CategoryDetail, PageType, EvidenceLine } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';
import { getSourceLinks } from '../utils/source-links';
import { hasSchemaType } from '../utils/schema-types';
import { excerpt, excludedLinkEvidence, hostList, matchExcerpt } from './trust-evidence';
import { findDefinitionSentence } from './answerability';
import { QUESTION_HEADING, normalizeQuestion, visibleQuestions } from '../utils/visible-questions';

interface FaqEvaluation {
  score: number;
  questionCount: number;
  // Questions whose answer is not in the DOM (closed accordions etc.)
  hiddenCount: number;
  hasFaqSchema: boolean;
  evidence: EvidenceLine[];
}

interface Evaluation {
  score: number;
  evidence: EvidenceLine[];
}

const MAX_EXAMPLES = 3;

export class AiCitationAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_aiCitation';

  analyze(pageData: PageData, pageType?: PageType): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.aiCitation;

    // A homepage is a hub, not an answer document — FAQ sections and an
    // upfront definition belong on content pages, not here.
    const isHomepage = pageType === 'homepage';

    // FAQ first: its hidden answers also explain missing facts (check 1).
    const faq = this.evaluateFaqSections(pageData);

    // Check 1: Citable fact statements
    const facts = this.evaluateFactStatements(pageData.paragraphs);
    const factScore = facts.score;
    const hasFacts = factScore > 0.3;
    const factPercent = Math.round(factScore * 100);
    // Figures may sit in the answers a crawler never gets to see.
    const factsHiddenAnswers = faq.hiddenCount > 0 && factScore < 1;
    if (factsHiddenAnswers) facts.evidence.push({ key: 'ev_facts_hidden_faq', params: { hidden: faq.hiddenCount } });

    details.push({
      criterionKey: 'criterion_facts',
      found: hasFacts,
      value: `${factPercent}%`,
      weight: config.weights.factStatements,
      evidence: facts.evidence,
      ...(factsHiddenAnswers ? { fixKey: 'fix_facts_hidden' } : {}),
      progress: {
        current: factPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += factScore * config.weights.factStatements;
    totalWeight += config.weights.factStatements;

    // Check 2: FAQ / Q&A sections
    const faqScore = faq.score;
    const hasFaq = faqScore > 0;
    const faqPercent = Math.round(faqScore * 100);
    // Answers missing from the HTML are a finding of their own: crawlers see
    // the questions but nothing to cite.
    const faqAnswersHidden = !isHomepage && faq.hiddenCount > 0;

    if (isHomepage) {
      details.push(this.notApplicable('criterion_faq'));
    } else {
      details.push({
        criterionKey: 'criterion_faq',
        found: hasFaq,
        value: faqAnswersHidden ? 'value_faqAnswersHidden' : `${faqPercent}%`,
        valueParams: faqAnswersHidden
          ? { hidden: String(faq.hiddenCount), total: String(faq.questionCount) }
          : undefined,
        weight: config.weights.faqQa,
        evidence: faq.evidence,
        fixKey: faqAnswersHidden
          ? 'fix_faq_hidden'
          : faq.questionCount > 0
            ? 'fix_faq_more'
            : faq.hasFaqSchema ? 'fix_faq_schema_only' : 'fix_faq',
        progress: {
          current: faqPercent,
          target: 100,
          unitKey: 'unit_percent',
        },
      });

      weightedScore += faqScore * config.weights.faqQa;
      totalWeight += config.weights.faqQa;
    }

    // Check 3: Sourced claims
    const sourced = this.evaluateSourcedClaims(pageData);
    const sourcedScore = sourced.score;
    const hasSourcedClaims = sourcedScore > 0.3;
    const sourcedPercent = Math.round(sourcedScore * 100);

    details.push({
      criterionKey: 'criterion_sourcedClaims',
      found: hasSourcedClaims,
      value: `${sourcedPercent}%`,
      weight: config.weights.sourcedClaims,
      evidence: sourced.evidence,
      progress: {
        current: sourcedPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += sourcedScore * config.weights.sourcedClaims;
    totalWeight += config.weights.sourcedClaims;

    // Check 4: Key information upfront
    const upfront = this.evaluateKeyInfoUpfront(pageData);
    const upfrontScore = upfront.score;
    const hasKeyInfoUpfront = upfrontScore > 0.5;
    const upfrontPercent = Math.round(upfrontScore * 100);

    if (isHomepage) {
      details.push(this.notApplicable('criterion_keyInfoUpfront'));
    } else {
      details.push({
        criterionKey: 'criterion_keyInfoUpfront',
        found: hasKeyInfoUpfront,
        value: `${upfrontPercent}%`,
        weight: config.weights.keyInfoUpfront,
        evidence: upfront.evidence,
        progress: {
          current: upfrontPercent,
          target: 100,
          unitKey: 'unit_percent',
        },
      });

      weightedScore += upfrontScore * config.weights.keyInfoUpfront;
      totalWeight += config.weights.keyInfoUpfront;
    }

    const recommendations: string[] = [];
    if (!hasFacts) recommendations.push('no_facts');
    if (faqAnswersHidden) recommendations.push('faq_answers_hidden');
    else if (!isHomepage && !hasFaq) recommendations.push('no_faq');
    if (!hasSourcedClaims) recommendations.push('no_sourced_claims');
    if (!isHomepage && !hasKeyInfoUpfront) recommendations.push('no_key_info_upfront');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  private isFact(text: string): boolean {
    return GEO_CONFIG.aiCitation.patterns.facts.some((p) => p.test(text));
  }

  private evaluateFactStatements(paragraphs: string[]): Evaluation {
    const target = GEO_CONFIG.aiCitation.thresholds.factCountDivisor;
    const factParagraphs = paragraphs.filter((p) => this.isFact(p));
    const score = Math.min(1, factParagraphs.length / target);

    const content = paragraphs.filter((p) => p.trim().length > 0);
    if (content.length === 0) return { score, evidence: [{ key: 'ev_facts_no_paragraphs' }] };
    const evidence: EvidenceLine[] = [
      { key: 'ev_facts_counted', params: { total: content.length, facts: factParagraphs.length, target } },
    ];
    for (const p of factParagraphs.slice(0, MAX_EXAMPLES)) {
      const text = matchExcerpt(p, GEO_CONFIG.aiCitation.patterns.facts);
      if (text) evidence.push({ key: 'ev_facts_example', params: { text } });
    }
    return { score, evidence };
  }

  private evaluateFaqSections(pageData: PageData): FaqEvaluation {
    const t = GEO_CONFIG.aiCitation.thresholds;

    const hasFaqSchema = pageData.schema.some((s) => hasSchemaType(s, ['FAQPage', 'QAPage']));

    // Detected FAQ/accordion questions plus question-style headings, counted
    // once each (a FAQ item is often both).
    const detected = pageData.faqQuestions ?? [];
    const questions = visibleQuestions(pageData);

    const questionCount = questions.size;
    const hiddenCount = Math.min(
      Math.max(0, pageData.faqAnswersHidden ?? 0),
      questionCount
    );

    // Hidden answers earn nothing. A question counts as answered when the
    // text under it is substantive. Analyses without question/answer pairs
    // (stored before 4.5) fall back to at most one answered question per
    // substantive paragraph.
    const substantive = (text: string) => text.trim().split(/\s+/).length >= t.upfrontMinWords;
    const answeredQuestions = pageData.questionAnswers
      ? new Set(
          pageData.questionAnswers
            .filter(({ answer }) => substantive(answer))
            .map(({ question }) => normalizeQuestion(question))
        ).size
      : pageData.paragraphs.filter(substantive).length;
    const answered = Math.min(questionCount - hiddenCount, answeredQuestions);
    // Answers that are in the HTML but too short to count
    const shortAnswers = pageData.questionAnswers
      ? new Set(
          pageData.questionAnswers
            .filter(({ answer }) => answer.trim().length > 0 && !substantive(answer))
            .map(({ question }) => normalizeQuestion(question))
        ).size
      : 0;

    let score = 0;
    if (answered >= t.faqAnsweredFull) score = 1;
    else if (answered >= t.faqAnsweredPartial) score = 0.6;
    else if (answered >= 1) score = 0.3;

    // Markup without visible questions describes nothing on the page
    if (hasFaqSchema && questionCount > 0) score += t.faqSchemaBonus;

    const evidence: EvidenceLine[] = [];
    if (questionCount === 0) {
      evidence.push({ key: hasFaqSchema ? 'ev_faq_schema_only' : 'ev_faq_none' });
    } else {
      evidence.push({
        key: 'ev_faq_questions',
        params: { count: questionCount, answered, full: t.faqAnsweredFull },
      });
      if (hiddenCount > 0) evidence.push({ key: 'ev_faq_hidden', params: { hidden: hiddenCount, total: questionCount } });
      if (shortAnswers > 0) evidence.push({ key: 'ev_faq_short', params: { count: shortAnswers, min: t.upfrontMinWords } });
      // Example questions: the ones without an answer when answers are
      // missing, otherwise the first ones found.
      const unanswered = (pageData.questionAnswers ?? [])
        .filter(({ answer }) => answer.trim().length === 0)
        .map(({ question }) => question);
      const examples = hiddenCount > 0 && unanswered.length > 0
        ? unanswered
        : [...detected, ...pageData.headings.map((h) => h.text).filter((h) => QUESTION_HEADING.test(h.trim()))];
      for (const q of [...new Set(examples)].slice(0, 2)) {
        evidence.push({ key: 'ev_faq_example', params: { text: excerpt(q) } });
      }
    }
    if (questionCount > 0 || !hasFaqSchema) {
      evidence.push({ key: hasFaqSchema ? 'ev_faq_schema_yes' : 'ev_faq_schema_no' });
    }

    return { score: Math.min(1, score), questionCount, hiddenCount, hasFaqSchema, evidence };
  }

  private evaluateSourcedClaims(pageData: PageData): Evaluation {
    const t = GEO_CONFIG.aiCitation.thresholds;
    const allText = this.getFullText(pageData);
    const citationPatterns = GEO_CONFIG.aiCitation.patterns.citations;

    let citationCount = 0;
    const citationExamples: string[] = [];
    for (const pattern of citationPatterns) {
      // Keep the pattern's own flags (u for \p{…}); only add g to count.
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      const matches = allText.match(new RegExp(pattern.source, flags));
      if (matches) {
        citationCount += matches.length;
        citationExamples.push(...matches);
      }
    }

    // Same filter as TrustSources: no social/share/nav links, no tel:/mailto:
    const links = getSourceLinks(pageData.links);
    const sourceLinks = links.length;
    const hasNumbers = pageData.paragraphs.some((p) => this.isFact(p));

    let score = Math.min(0.5, citationCount / 4);
    if (sourceLinks >= t.sourceLinksWithNumbers && hasNumbers) score += 0.3;
    if (sourceLinks >= t.sourceLinksMany) score += 0.2;

    const evidence: EvidenceLine[] = [];
    if (citationCount > 0) {
      evidence.push({ key: 'ev_sourcedClaims_citations', params: { count: citationCount } });
      for (const text of [...new Set(citationExamples.map((c) => excerpt(c)))].slice(0, 2)) {
        evidence.push({ key: 'ev_sourcedClaims_citation_example', params: { text } });
      }
    } else {
      evidence.push({ key: 'ev_sourcedClaims_no_citations' });
    }
    evidence.push(
      sourceLinks > 0
        ? { key: 'ev_sourcedClaims_links', params: { count: sourceLinks, hosts: hostList(links), many: t.sourceLinksMany } }
        : { key: 'ev_sourcedClaims_no_links' }
    );
    if (sourceLinks >= t.sourceLinksWithNumbers && !hasNumbers) {
      evidence.push({ key: 'ev_sourcedClaims_links_no_numbers' });
    }
    evidence.push(...excludedLinkEvidence(pageData.links));

    return { score: Math.min(1, score), evidence };
  }

  // The first paragraphs a reader (and an AI) actually reads: skips a
  // repeated H1 and short bylines, teasers or captions above the text.
  private leadParagraphs(pageData: PageData): string[] {
    const minWords = GEO_CONFIG.aiCitation.thresholds.upfrontMinWords;
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const h1 = pageData.headings.find((h) => h.level === 1);
    const h1Text = h1 ? norm(h1.text) : '';

    const lead = pageData.paragraphs.filter((p) => {
      const text = norm(p);
      if (text.length === 0) return false;
      if (h1Text && (text === h1Text || (h1Text.includes(text) && text.length < h1Text.length + 20))) {
        return false;
      }
      return text.split(' ').length >= minWords;
    });

    return (lead.length > 0 ? lead : pageData.paragraphs).slice(0, 3);
  }

  private evaluateKeyInfoUpfront(pageData: PageData): Evaluation {
    const firstParagraphs = this.leadParagraphs(pageData);
    const firstText = firstParagraphs.join(' ');
    const words = firstText.split(/\s+/).filter(Boolean);
    const first150 = words.slice(0, 150).join(' ');

    if (first150.length === 0) return { score: 0, evidence: [{ key: 'ev_keyInfoUpfront_no_text' }] };

    // Each part adds its share; the evidence lists every part as met or
    // missing, with that share, so the percentage adds up for the reader.
    const evidence: EvidenceLine[] = [{ key: 'ev_keyInfoUpfront_lead', params: { text: excerpt(first150) } }];
    let score = 0;

    const h1 = pageData.headings.find((h) => h.level === 1);
    const h1Min = GEO_CONFIG.contentClarity.thresholds.h1MinLength;
    if (h1 && h1.text.length >= h1Min) {
      score += 0.2;
      evidence.push({ key: 'ev_keyInfoUpfront_h1_ok', params: { text: excerpt(h1.text), points: 20 } });
    } else if (h1) {
      evidence.push({ key: 'ev_keyInfoUpfront_h1_short', params: { text: excerpt(h1.text), min: h1Min, points: 20 } });
    } else {
      evidence.push({ key: 'ev_keyInfoUpfront_h1_missing', params: { points: 20 } });
    }

    const leadChars = firstParagraphs.length > 0 ? firstParagraphs[0].length : 0;
    if (firstParagraphs.length > 0 && leadChars < 500) {
      score += 0.15;
      evidence.push({ key: 'ev_keyInfoUpfront_short_ok', params: { chars: leadChars, points: 15 } });
    } else {
      evidence.push({ key: 'ev_keyInfoUpfront_short_long', params: { chars: leadChars, points: 15 } });
    }

    const description = pageData.meta.description ?? '';
    if (description && description.length > 50) {
      score += 0.15;
      evidence.push({ key: 'ev_keyInfoUpfront_meta_ok', params: { chars: description.length, points: 15 } });
    } else if (description.trim()) {
      evidence.push({ key: 'ev_keyInfoUpfront_meta_short', params: { chars: description.length, points: 15 } });
    } else {
      evidence.push({ key: 'ev_keyInfoUpfront_meta_missing', params: { points: 15 } });
    }

    // Same anchored, per-sentence test as the answerability check: a bare
    // "ist der" anywhere ("Hier ist ein Überblick") defines nothing.
    const definitionSentence = findDefinitionSentence(first150);
    const definition = definitionSentence ? excerpt(definitionSentence) : null;
    if (definition) {
      score += 0.3;
      evidence.push({ key: 'ev_keyInfoUpfront_definition_ok', params: { text: definition, points: 30 } });
    } else {
      evidence.push({ key: 'ev_keyInfoUpfront_definition_missing', params: { points: 30 } });
    }

    const figure = matchExcerpt(first150, GEO_CONFIG.aiCitation.patterns.facts);
    if (figure) {
      score += 0.2;
      evidence.push({ key: 'ev_keyInfoUpfront_number_ok', params: { text: figure, points: 20 } });
    } else {
      evidence.push({ key: 'ev_keyInfoUpfront_number_missing', params: { points: 20 } });
    }

    return { score: Math.min(1, score), evidence };
  }
}
