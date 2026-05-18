import type { Lang } from './i18n';

const VOWELS_LATIN = /[aeiouyäöüáéíóúàèìòùâêîôûãõ]/i;
const VOWEL_GROUPS = /[aeiouyäöüáéíóúàèìòùâêîôûãõ]+/gi;
const SENTENCE_SPLIT = /[.!?…]+(?:\s|$)/;
const WORD_SPLIT = /\s+/;

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ');
}

function tokenize(text: string): { words: string[]; sentences: string[] } {
  const clean = stripHtml(text).replace(/\s+/g, ' ').trim();
  if (!clean) return { words: [], sentences: [] };

  const sentences = clean
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const words = clean
    .split(WORD_SPLIT)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter((w) => w.length > 0 && VOWELS_LATIN.test(w));

  return { words, sentences };
}

export function countSyllables(word: string, lang: Lang): number {
  const w = word.toLowerCase();
  if (w.length === 0) return 0;
  if (w.length <= 2) return 1;

  const groups = w.match(VOWEL_GROUPS);
  let count = groups ? groups.length : 0;

  // English: silent trailing 'e' — but keep a syllable for consonant+"le"
  // (table, simple, candle) which is pronounced as a separate syllable.
  if (
    lang === 'en' &&
    count > 1 &&
    /e$/.test(w) &&
    !/[aeiouy]e$/.test(w) &&
    !/[^aeiouy]le$/.test(w)
  ) {
    count -= 1;
  }

  return Math.max(1, count);
}

/**
 * Flesch Reading Ease (English formula, used as approximation for EN/FR/ES/PT/IT).
 * Returns 0-100; higher is easier. ~60+ is plain English.
 */
export function computeFleschReadingEase(text: string, lang: Lang): number | null {
  const { words, sentences } = tokenize(text);
  if (words.length === 0 || sentences.length === 0) return null;

  const syllables = words.reduce((sum, w) => sum + countSyllables(w, lang), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;

  return 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
}

/**
 * LIX (Lasbarhetsindex) — well-suited for German.
 * Lower is easier: <30 very easy, 40 ok, 50 hard, 60+ very hard.
 */
export function computeLix(text: string): number | null {
  const { words, sentences } = tokenize(text);
  if (words.length === 0 || sentences.length === 0) return null;

  const longWords = words.filter((w) => w.length > 6).length;
  return words.length / sentences.length + (longWords * 100) / words.length;
}

/**
 * Returns a normalized readability score 0-1 (1 = easy to read, AI-friendly).
 * Picks Flesch for EN/FR/ES/PT/IT and LIX for DE.
 * Returns null if the text is too short to evaluate.
 */
export function computeReadabilityScore(
  paragraphs: string[],
  lang: Lang
): { score: number; raw: number; formula: 'flesch' | 'lix' } | null {
  const text = paragraphs.join(' ').trim();
  if (text.length < 50) return null;

  if (lang === 'de') {
    const lix = computeLix(text);
    if (lix === null) return null;
    // Map LIX: <=30 → 1.0, 60+ → 0.0, linear between
    const score = Math.max(0, Math.min(1, (60 - lix) / 30));
    return { score, raw: lix, formula: 'lix' };
  }

  const flesch = computeFleschReadingEase(text, lang);
  if (flesch === null) return null;
  // Map Flesch: 30 → 0, 90 → 1.0, linear between
  const score = Math.max(0, Math.min(1, (flesch - 30) / 60));
  return { score, raw: flesch, formula: 'flesch' };
}
