import type { DateData } from '../types/analysis';

/**
 * Text-based date extraction.
 *
 * Many sites print their publication or update date as plain text
 * ("Last updated: August 11, 2026") without <time>, meta tags or schema.org.
 * AI crawlers read that text just fine, so the analyzer should too.
 */

const MONTHS: Record<string, number> = {
  jan: 0, januar: 0, january: 0, jaenner: 0,
  feb: 1, februar: 1, february: 1,
  mar: 2, mrz: 2, maerz: 2, march: 2,
  apr: 3, april: 3,
  mai: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oct: 9, oktober: 9, october: 9,
  nov: 10, november: 10,
  dez: 11, dec: 11, dezember: 11, december: 11,
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');

/** Label that marks the text around a date as a publication/update date. */
const LABEL_PATTERN =
  /(last\s+updated|last\s+modified|last\s+revised|updated(?:\s+on)?|modified(?:\s+on)?|revised(?:\s+on)?|published(?:\s+on)?|posted(?:\s+on)?|zuletzt\s+aktualisiert|aktualisiert(?:\s+am)?|letzte\s+(?:aktualisierung|änderung|aenderung)|geändert(?:\s+am)?|geaendert(?:\s+am)?|veröffentlicht(?:\s+am)?|veroeffentlicht(?:\s+am)?|stand)\b/i;

/** Class/id hints used by CMS themes for date output. */
const ATTR_HINT_PATTERN = /updated|modified|published|pubdate|lastmod|datum|aktualis|(^|[-_])date([-_]|$)|date$/i;

const MIN_YEAR = 1990;

/** Normalize umlauts so "März" matches the ASCII month table. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function build(year: number, month: number, day: number): Date | null {
  const maxYear = new Date().getFullYear() + 1;
  if (year < MIN_YEAR || year > maxYear) return null;
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  // Reject overflow like 31 February
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Parse the first plausible date out of a short text snippet.
 * Supports ISO, German and English month names, and numeric formats.
 */
export function parseDateText(text: string): { date: Date; matched: string } | null {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const haystack = normalize(raw);

  // 1. ISO 8601: 2026-08-11 (optionally with time)
  const iso = haystack.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = build(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (date) return { date, matched: iso[0] };
  }

  // 2. Month name first: "August 11, 2026" / "Aug 11 2026"
  const monthFirst = haystack.match(
    new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`)
  );
  if (monthFirst) {
    const date = build(Number(monthFirst[3]), MONTHS[monthFirst[1]], Number(monthFirst[2]));
    if (date) return { date, matched: monthFirst[0] };
  }

  // 3. Day first: "11. August 2026" / "11 Aug 2026"
  const dayFirst = haystack.match(
    new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MONTH_NAMES})\\.?,?\\s+(\\d{4})\\b`)
  );
  if (dayFirst) {
    const date = build(Number(dayFirst[3]), MONTHS[dayFirst[2]], Number(dayFirst[1]));
    if (date) return { date, matched: dayFirst[0] };
  }

  // 4. Numeric: 11.08.2026 (day first) or 08/11/2026 (month first unless > 12)
  const numeric = haystack.match(/\b(\d{1,2})([./])(\d{1,2})\2(\d{4})\b/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[3]);
    const year = Number(numeric[4]);
    const dayFirstOrder = numeric[2] === '.' || a > 12;
    const date = dayFirstOrder ? build(year, b - 1, a) : build(year, a - 1, b);
    if (date) return { date, matched: numeric[0] };
  }

  return null;
}

/**
 * Scan the DOM for dates printed as plain text.
 * Only accepts a candidate when a date label ("Last updated: …") is present
 * or the element/ancestor carries a date-ish class or id, so unrelated dates
 * in body copy or teasers don't count.
 */
export function extractTextDates(doc: Document = document, limit = 5): DateData[] {
  const dates: DateData[] = [];
  const seen = new Set<string>();

  const candidates = doc.querySelectorAll(
    'time, span, div, p, small, li, td, dd, em, strong, b, i, footer'
  );

  for (const el of Array.from(candidates)) {
    if (dates.length >= limit) break;
    // Only leaf-ish elements — keeps the matched text tight
    if (el.querySelector('time, span, div, p, small, li, td, dd, em, strong, b, i, footer')) {
      continue;
    }

    const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text || text.length > 160) continue;

    const hasLabel = LABEL_PATTERN.test(text);
    const hasAttrHint =
      ATTR_HINT_PATTERN.test(typeof el.className === 'string' ? el.className : '') ||
      ATTR_HINT_PATTERN.test(el.id) ||
      ATTR_HINT_PATTERN.test(
        (el.parentElement && typeof el.parentElement.className === 'string'
          ? el.parentElement.className
          : '') || ''
      );
    if (!hasLabel && !hasAttrHint) continue;

    const parsed = parseDateText(text);
    if (!parsed) continue;

    const key = parsed.date.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);

    dates.push({ date: parsed.date, formatted: text, source: 'text' });
  }

  return dates;
}
