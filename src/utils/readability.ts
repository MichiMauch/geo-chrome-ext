import type { Lang } from './i18n';

const VOWELS_LATIN = /[aeiouyäöüáéíóúàèìòùâêîôûãõ]/i;
const VOWEL_GROUPS = /[aeiouyäöüáéíóúàèìòùâêîôûãõ]+/gi;
// German vowel nuclei inside a vowel group: diphthongs and doubled vowels
// are one syllable, every other vowel starts a new one. So "neue" (eu|e),
// "Feuer" (eu|e) and "Mauer" (au|e) count 2, "Seele" (ee|e) 2, "Haus" 1.
const DE_NUCLEI = /ei|ai|au|eu|äu|ie|ey|ay|aa|ee|oo|[aeiouyäöü]/gi;
const SENTENCE_SPLIT = /[.!?…]+(?:\s|$)/;
const WORD_SPLIT = /\s+/;

const SUPPORTED_LANGS: readonly Lang[] = ['en', 'de', 'fr', 'es', 'pt', 'it'];

// High-frequency function words for the cheap DE/EN guess. Only words that
// do not exist in the other language, so a German page with English product
// names (or vice versa) still lands on the right side.
const DE_STOPWORDS = new Set([
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'sich', 'des', 'auf',
  'für', 'dem', 'den', 'ein', 'eine', 'auch', 'werden', 'wird', 'sind',
  'von', 'zu', 'bei', 'oder', 'wir', 'sie', 'nach', 'aus', 'noch', 'über',
]);
const EN_STOPWORDS = new Set([
  'the', 'and', 'is', 'are', 'of', 'to', 'with', 'for', 'that', 'this',
  'not', 'be', 'by', 'from', 'or', 'have', 'has', 'was', 'were', 'which',
  'they', 'you', 'it', 'on', 'at', 'as', 'can', 'will', 'their', 'there',
]);

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ');
}

interface TextStats {
  words: string[];
  sentenceCount: number;
}

// Tokenizes each block on its own and treats the end of every block as a
// sentence end: paragraphs, list items and FAQ answers often lack a final
// period, and joining them with ' ' used to merge them into one giant
// "sentence" that wrecked words-per-sentence.
function tokenize(blocks: string[]): TextStats {
  const words: string[] = [];
  let sentenceCount = 0;

  for (const block of blocks) {
    const clean = stripHtml(block).replace(/\s+/g, ' ').trim();
    if (!clean) continue;

    sentenceCount += clean
      .split(SENTENCE_SPLIT)
      .map((s) => s.trim())
      .filter((s) => s.length > 0).length;

    clean
      .split(WORD_SPLIT)
      .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
      .filter((w) => w.length > 0 && VOWELS_LATIN.test(w))
      .forEach((w) => words.push(w));
  }

  return { words, sentenceCount };
}

export function countSyllables(word: string, lang: Lang): number {
  const w = word.toLowerCase();
  if (w.length === 0) return 0;
  if (w.length <= 2) return 1;

  const groups = w.match(VOWEL_GROUPS) ?? [];
  let count = lang === 'de'
    ? groups.reduce((sum, g) => sum + (g.match(DE_NUCLEI)?.length ?? 1), 0)
    : groups.length;

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
 * Cheap German-vs-English guess from function-word frequency. Returns null
 * when the text has too few hits to decide (or another language entirely).
 */
export function detectTextLang(text: string): 'de' | 'en' | null {
  const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let de = 0;
  let en = 0;
  for (const tok of tokens) {
    if (DE_STOPWORDS.has(tok)) de++;
    if (EN_STOPWORDS.has(tok)) en++;
  }
  if (de + en < 5) return null;
  if (de >= en * 2) return 'de';
  if (en >= de * 2) return 'en';
  return null;
}

/**
 * Language whose readability formula applies to the PAGE content (not the
 * UI): the declared page language (<html lang>/inLanguage, e.g. 'de' or
 * 'de-CH') when it is one we support, otherwise a stopword guess from the
 * text, and only as a last resort the fallback (the UI language). A German
 * page analyzed with an English UI must still be measured with LIX.
 */
export function resolveContentLang(
  pageLang: string | null | undefined,
  paragraphs: string[],
  fallback: Lang
): Lang {
  const declared = (pageLang ?? '').toLowerCase().split(/[-_]/)[0] as Lang;
  if (SUPPORTED_LANGS.includes(declared)) return declared;
  return detectTextLang(paragraphs.join(' ')) ?? fallback;
}

/**
 * Flesch Reading Ease (English formula, used as approximation for EN/FR/ES/PT/IT).
 * Clamped to 0-100; higher is easier. ~60+ is plain English. Unclamped, a
 * dense text yields negative values ("-10 Flesch") that mean nothing to users.
 */
export function computeFleschReadingEase(text: string | string[], lang: Lang): number | null {
  const { words, sentenceCount } = tokenize(Array.isArray(text) ? text : [text]);
  if (words.length === 0 || sentenceCount === 0) return null;

  const syllables = words.reduce((sum, w) => sum + countSyllables(w, lang), 0);
  const wordsPerSentence = words.length / sentenceCount;
  const syllablesPerWord = syllables / words.length;

  const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  return Math.max(0, Math.min(100, flesch));
}

/**
 * LIX (Lasbarhetsindex) — well-suited for German.
 * Lower is easier: <30 very easy, 40 ok, 50 hard, 60+ very hard.
 */
export function computeLix(text: string | string[]): number | null {
  const { words, sentenceCount } = tokenize(Array.isArray(text) ? text : [text]);
  if (words.length === 0 || sentenceCount === 0) return null;

  const longWords = words.filter((w) => w.length > 6).length;
  return words.length / sentenceCount + (longWords * 100) / words.length;
}

// LIX → 0-1 score. German compounds push LIX up by ~10 points compared with
// English text of the same difficulty; typical German Sachtexte (news,
// FAQs, guides) land at 50–60. The old scale (0 points from 60) failed
// almost every German page. Now: ≤40 (easy) full points, ≥65 (academic /
// legal prose) zero, linear between — so LIX 50 scores 0.6 and the
// readabilityScoreMin of 0.5 sits at LIX 52.5.
const LIX_FULL = 40;
const LIX_ZERO = 65;

/**
 * Returns a normalized readability score 0-1 (1 = easy to read, AI-friendly).
 * Picks Flesch for EN/FR/ES/PT/IT and LIX for DE — pass the CONTENT language
 * (see resolveContentLang), not the UI language.
 * Returns null if the text is too short to evaluate.
 */
export function computeReadabilityScore(
  paragraphs: string[],
  lang: Lang
): { score: number; raw: number; formula: 'flesch' | 'lix' } | null {
  const blocks = paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);
  if (blocks.join(' ').length < 50) return null;

  if (lang === 'de') {
    const lix = computeLix(blocks);
    if (lix === null) return null;
    const score = Math.max(0, Math.min(1, (LIX_ZERO - lix) / (LIX_ZERO - LIX_FULL)));
    return { score, raw: lix, formula: 'lix' };
  }

  const flesch = computeFleschReadingEase(blocks, lang);
  if (flesch === null) return null;
  // Map Flesch: 30 → 0, 90 → 1.0, linear between
  const score = Math.max(0, Math.min(1, (flesch - 30) / 60));
  return { score, raw: flesch, formula: 'flesch' };
}

// Five readability bands shared by LIX and Flesch, easiest → hardest. The
// i18nKey resolves to a localized label; color follows the score palette
// (green → red) so a marker's hue alone tells you how hard the passage is.
export type ReadabilityBand =
  | 'very_easy'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'very_hard';

interface BandInfo {
  band: ReadabilityBand;
  i18nKey: string;
  color: string;
}

const BANDS: Record<ReadabilityBand, BandInfo> = {
  very_easy: { band: 'very_easy', i18nKey: 'read_band_very_easy', color: '#22c55e' },
  easy: { band: 'easy', i18nKey: 'read_band_easy', color: '#84cc16' },
  medium: { band: 'medium', i18nKey: 'read_band_medium', color: '#eab308' },
  hard: { band: 'hard', i18nKey: 'read_band_hard', color: '#f59e0b' },
  very_hard: { band: 'very_hard', i18nKey: 'read_band_very_hard', color: '#dc2626' },
};

/**
 * Maps a raw readability value to one of five bands. LIX scale (lower is
 * easier): <30 very easy, 30–40 easy, 40–50 medium, 50–60 hard, ≥60 very hard.
 * Flesch (higher is easier) is mapped to the same five bands so callers can
 * treat both formulas uniformly.
 */
export function readabilityBand(
  raw: number,
  formula: 'flesch' | 'lix'
): BandInfo {
  if (formula === 'lix') {
    if (raw < 30) return BANDS.very_easy;
    if (raw < 40) return BANDS.easy;
    if (raw < 50) return BANDS.medium;
    if (raw < 60) return BANDS.hard;
    return BANDS.very_hard;
  }
  // Flesch Reading Ease, higher = easier
  if (raw >= 80) return BANDS.very_easy;
  if (raw >= 70) return BANDS.easy;
  if (raw >= 60) return BANDS.medium;
  if (raw >= 50) return BANDS.hard;
  return BANDS.very_hard;
}
