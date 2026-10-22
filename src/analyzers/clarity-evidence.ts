import { PageData } from '../types/analysis';
import { getLang, t } from '../utils/i18n';

// Helpers for the report evidence of the Content Clarity and Answerability
// checks (see src/i18n/report/README.md).

/** Shortens text to `max` characters (cutting at a word) and adds "…". */
export function clip(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/** Clipped text in the UI language's quotation marks. */
export function quote(text: string, max = 60): string {
  return t('ev_clarity_quote', { text: clip(text, max) });
}

export function quoteList(texts: string[], limit = 3): string {
  return texts.slice(0, limit).map((s) => quote(s, 50)).join(', ');
}

/**
 * Questions whose answer is missing: `hidden` = FAQ answers the extractor
 * found missing from the HTML (closed accordions that load on click),
 * `empty` = question headings with no text at all before the next heading.
 */
export function missingAnswers(pageData: PageData): { hidden: number; empty: number } {
  return {
    hidden: Math.max(0, pageData.faqAnswersHidden ?? 0),
    empty: (pageData.questionAnswers ?? []).filter((qa) => qa.answer.trim() === '').length,
  };
}

// Language name in the UI language ("Deutsch", "German"); the code if the
// runtime cannot name it.
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([getLang()], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** One decimal in the UI language's number format ("1.6" / "1,6"). */
export function formatDecimal(n: number): string {
  try {
    return new Intl.NumberFormat(getLang(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  } catch {
    return n.toFixed(1);
  }
}
