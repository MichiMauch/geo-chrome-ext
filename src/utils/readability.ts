const VOWELS_LATIN = /[aeiouyäöüáéíóúàèìòùâêîôûãõ]/i;
const VOWEL_GROUPS = /[aeiouyäöüáéíóúàèìòùâêîôûãõ]+/gi;
// German vowel nuclei inside a vowel group: diphthongs and doubled vowels
// are one syllable, every other vowel starts a new one. So "neue" (eu|e),
// "Feuer" (eu|e) and "Mauer" (au|e) count 2, "Seele" (ee|e) 2, "Haus" 1.
const DE_NUCLEI = /ei|ai|au|eu|äu|ie|ey|ay|aa|ee|oo|[aeiouyäöü]/gi;
const SENTENCE_SPLIT = /[.!?…]+(?:\s|$)/;
const WORD_SPLIT = /\s+/;

// Declared language tags that carry no language: "undetermined", "multiple"
// and "no linguistic content" (BCP 47 / ISO 639-2 special codes).
const NON_LANGS = new Set(['und', 'mul', 'zxx', 'mis']);

/** Readability formula used for a content language. */
export type ReadabilityFormula = 'flesch' | 'lix';

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

export function countSyllables(word: string, lang: string): number {
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
 * Language of the PAGE content (not the UI), as lowercase ISO 639 primary
 * subtag: the declared page language (<html lang>/inLanguage, e.g. 'de-CH'
 * → 'de', 'nl', 'sv') always wins, whatever language it is. Otherwise a
 * DE/EN stopword guess from the text, else null (unknown). The UI language
 * says nothing about the page and is deliberately not used: a Dutch page
 * analyzed with an English UI must not be measured with English Flesch.
 */
export function resolveContentLang(
  pageLang: string | null | undefined,
  paragraphs: string[]
): string | null {
  const declared = (pageLang ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (/^[a-z]{2,3}$/.test(declared) && !NON_LANGS.has(declared)) return declared;
  return detectTextLang(paragraphs.join(' '));
}

/**
 * Formula for a content language: Flesch only for English, LIX for every
 * other (or unknown) language.
 *
 * Flesch Reading Ease is calibrated on English syllable and sentence norms;
 * applied to other languages it systematically under-rates them (German,
 * Dutch or Finnish compounds and Romance words simply have more syllables).
 * LIX (Björnsson) counts only words per sentence and words > 6 letters, so
 * it needs no syllable rules; Björnsson (1983) validated it on newspaper
 * text in eleven European languages.
 *
 * FR/ES/PT/IT deliberately use LIX too instead of the adapted Flesch
 * variants (Kandel-Moles, Fernández-Huerta, Martins, Flesch-Vacca): those
 * only work with a proper syllabifier per language (French mute e and
 * -ent endings, Spanish/Italian diphthongs vs. hiatus) that our vowel-group
 * count does not provide, each has its own scale (Martins shifts Flesch by
 * +42, Fernández-Huerta's published coefficients are disputed), and every
 * one would need its own band mapping. Four half-right formulas are worse
 * than one sound, language-neutral one.
 */
export function readabilityFormula(contentLang: string | null): ReadabilityFormula {
  return contentLang === 'en' ? 'flesch' : 'lix';
}

/**
 * Flesch Reading Ease (English formula; only applied to English content).
 * Clamped to 0-100; higher is easier. ~60+ is plain English. Unclamped, a
 * dense text yields negative values ("-10 Flesch") that mean nothing to users.
 */
export function computeFleschReadingEase(text: string | string[], lang = 'en'): number | null {
  const { words, sentenceCount } = tokenize(Array.isArray(text) ? text : [text]);
  if (words.length === 0 || sentenceCount === 0) return null;

  const syllables = words.reduce((sum, w) => sum + countSyllables(w, lang), 0);
  const wordsPerSentence = words.length / sentenceCount;
  const syllablesPerWord = syllables / words.length;

  const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  return Math.max(0, Math.min(100, flesch));
}

/**
 * LIX (Läsbarhetsindex) — language-neutral, used for all non-English content.
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
// readabilityScoreMin of 0.5 sits at LIX 52.5. The same scale applies to
// all LIX languages: Dutch and the Scandinavian languages compound like
// German. For sv/da/no LIX's original Swedish norms (the bands in
// readabilityBand) apply unchanged; FR/ES/PT/IT texts compound less and
// tend to score a few points lower, so the scale is slightly lenient there.
const LIX_FULL = 40;
const LIX_ZERO = 65;

/**
 * Returns a normalized readability score 0-1 (1 = easy to read, AI-friendly).
 * Picks the formula via readabilityFormula (Flesch for English, LIX for
 * everything else) — pass the CONTENT language (see resolveContentLang),
 * not the UI language; null (unknown) means LIX.
 * Returns null if the text is too short to evaluate.
 */
export function computeReadabilityScore(
  paragraphs: string[],
  lang: string | null
): { score: number; raw: number; formula: ReadabilityFormula } | null {
  const blocks = paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);
  if (blocks.join(' ').length < 50) return null;

  if (readabilityFormula(lang) === 'lix') {
    const lix = computeLix(blocks);
    if (lix === null) return null;
    const score = Math.max(0, Math.min(1, (LIX_ZERO - lix) / (LIX_ZERO - LIX_FULL)));
    return { score, raw: lix, formula: 'lix' };
  }

  const flesch = computeFleschReadingEase(blocks, 'en');
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
  formula: ReadabilityFormula
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
