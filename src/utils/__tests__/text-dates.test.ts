// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseDateText, extractTextDates } from '../text-dates';

function doc(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html'
  );
}

const THIS_YEAR = new Date().getFullYear();

describe('parseDateText', () => {
  it('parses ISO dates', () => {
    const d = parseDateText('Last updated: 2026-08-11')!.date;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 11]);
  });

  it('parses English month-first dates', () => {
    const d = parseDateText('Last updated: August 11, 2026')!.date;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 11]);
  });

  it('parses abbreviated months and ordinals', () => {
    const d = parseDateText('Updated Aug 3rd, 2025')!.date;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2025, 7, 3]);
  });

  it('parses German day-first dates with umlauts', () => {
    const d = parseDateText('Zuletzt aktualisiert am 5. März 2026')!.date;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 5]);
  });

  it('treats dotted numeric dates as day first', () => {
    const d = parseDateText('Stand: 11.08.2026')!.date;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 11]);
  });

  it('treats slashed numeric dates as month first unless impossible', () => {
    const us = parseDateText('08/11/2026')!.date;
    expect([us.getMonth(), us.getDate()]).toEqual([7, 11]);
    const eu = parseDateText('25/12/2025')!.date;
    expect([eu.getMonth(), eu.getDate()]).toEqual([11, 25]);
  });

  it('rejects implausible years and impossible days', () => {
    expect(parseDateText('Order no. 31.02.2026')).toBeNull();
    expect(parseDateText('since 1685-04-01')).toBeNull();
    expect(parseDateText(`valid until ${THIS_YEAR + 5}-01-01`)).toBeNull();
  });

  it('returns null when there is no date', () => {
    expect(parseDateText('Last updated: recently')).toBeNull();
  });
});

describe('extractTextDates', () => {
  it('finds a labelled date in plain text (fisba.com footer case)', () => {
    const dates = extractTextDates(
      doc('<div class="footer-updated">Last updated: August 11, 2026</div>')
    );
    expect(dates).toHaveLength(1);
    expect(dates[0].source).toBe('text');
    expect(dates[0].formatted).toBe('Last updated: August 11, 2026');
    expect(dates[0].date.getMonth()).toBe(7);
  });

  it('finds a bare date when the element class hints at a date', () => {
    const dates = extractTextDates(doc('<span class="post-date">12.06.2026</span>'));
    expect(dates).toHaveLength(1);
  });

  it('finds a bare date when the parent class hints at a date', () => {
    const dates = extractTextDates(doc('<div class="entry-meta"><span>12.06.2026</span></div>'));
    expect(dates).toHaveLength(0);
    const hinted = extractTextDates(doc('<div class="lastmod"><span>12.06.2026</span></div>'));
    expect(hinted).toHaveLength(1);
  });

  it('ignores dates in unrelated body copy', () => {
    const dates = extractTextDates(
      doc('<p>The company was founded on 1. Januar 2005 in St. Gallen.</p>')
    );
    expect(dates).toHaveLength(0);
  });

  it('deduplicates the same day found twice', () => {
    const dates = extractTextDates(
      doc(
        '<div class="footer-updated">Last updated: August 11, 2026</div>' +
          '<span class="date">Updated 11.08.2026</span>'
      )
    );
    expect(dates).toHaveLength(1);
  });

  it('respects the result limit', () => {
    const html = Array.from(
      { length: 10 },
      (_, i) => `<span class="date">Updated ${i + 1}.06.2026</span>`
    ).join('');
    expect(extractTextDates(doc(html))).toHaveLength(5);
  });
});
