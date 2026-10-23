import type { PageData } from '../types/analysis';

// Headings count as questions only with a question mark: "Was wir bieten" is
// a section title. Accordion items without one come in via faqQuestions.
export const QUESTION_HEADING = /[?？]$/;

export const normalizeQuestion = (q: string): string =>
  q.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*\?$/, '');

/** Questions a reader sees on the page, normalized and counted once each. */
export function visibleQuestions(pageData: PageData): Set<string> {
  const questions = new Set((pageData.faqQuestions ?? []).map(normalizeQuestion));
  pageData.headings
    .filter((h) => QUESTION_HEADING.test(h.text.trim()))
    .forEach((h) => questions.add(normalizeQuestion(h.text)));
  questions.delete('');
  return questions;
}
