import { describe, it, expect } from 'vitest';
import {
  computeFleschReadingEase,
  computeLix,
  computeReadabilityScore,
  countSyllables,
  readabilityBand,
} from '../readability';

describe('readability', () => {
  describe('countSyllables', () => {
    it('counts single-syllable words', () => {
      expect(countSyllables('cat', 'en')).toBe(1);
      expect(countSyllables('dog', 'en')).toBe(1);
    });

    it('counts multi-syllable words', () => {
      expect(countSyllables('extension', 'en')).toBeGreaterThanOrEqual(3);
      expect(countSyllables('analyzer', 'en')).toBeGreaterThanOrEqual(3);
    });

    it('strips trailing silent e in English', () => {
      expect(countSyllables('place', 'en')).toBe(1);
      expect(countSyllables('table', 'en')).toBe(2); // -le keeps a syllable
    });
  });

  describe('computeFleschReadingEase', () => {
    it('returns a high score for simple short sentences', () => {
      const text = 'The cat sat on the mat. The dog ran fast. The sun is hot.';
      const score = computeFleschReadingEase(text, 'en');
      expect(score).not.toBeNull();
      expect(score!).toBeGreaterThan(80);
    });

    it('returns a lower score for long, complex sentences', () => {
      const text =
        'The phenomenological investigation of consciousness necessitates a comprehensive understanding of intentionality and the constitutive operations performed by transcendental subjectivity throughout temporally extended experiential horizons.';
      const score = computeFleschReadingEase(text, 'en');
      expect(score).not.toBeNull();
      expect(score!).toBeLessThan(30);
    });

    it('returns null for empty input', () => {
      expect(computeFleschReadingEase('', 'en')).toBeNull();
    });
  });

  describe('computeLix', () => {
    it('returns a low LIX for short German words', () => {
      const text = 'Der Tag ist gut. Das Brot ist warm. Die Sonne ist hell.';
      const lix = computeLix(text);
      expect(lix).not.toBeNull();
      expect(lix!).toBeLessThan(35);
    });

    it('returns a high LIX for long German compound words', () => {
      const text =
        'Die Bundespräsidentenwahlbeobachtungsorganisation hat die Studienabschlussfeierlichkeitenvorbereitungen erfolgreich abgeschlossen und übermittelt nun die Gesamtbewertungsergebnisse.';
      const lix = computeLix(text);
      expect(lix).not.toBeNull();
      expect(lix!).toBeGreaterThan(55);
    });
  });

  describe('computeReadabilityScore', () => {
    it('returns null for very short text', () => {
      expect(computeReadabilityScore(['Hi.'], 'en')).toBeNull();
    });

    it('uses LIX for German', () => {
      const result = computeReadabilityScore(
        ['Der Tag ist gut. Das Brot ist warm. Die Sonne ist hell. Wir sind hier.'],
        'de'
      );
      expect(result).not.toBeNull();
      expect(result!.formula).toBe('lix');
      expect(result!.score).toBeGreaterThan(0.5);
    });

    it('uses Flesch for English', () => {
      const result = computeReadabilityScore(
        ['The cat sat on the mat. The dog ran fast. The sun is hot today. We have fun here.'],
        'en'
      );
      expect(result).not.toBeNull();
      expect(result!.formula).toBe('flesch');
      expect(result!.score).toBeGreaterThan(0.5);
    });

    it('returns a low score for hard text', () => {
      const result = computeReadabilityScore(
        [
          'The phenomenological investigation of consciousness necessitates a comprehensive understanding of intentionality and the constitutive operations performed by transcendental subjectivity throughout temporally extended experiential horizons.',
        ],
        'en'
      );
      expect(result).not.toBeNull();
      expect(result!.score).toBeLessThan(0.3);
    });

    it('clamps scores to [0, 1]', () => {
      const result = computeReadabilityScore(
        ['Yes. No. Go. Run. Sit. Eat. Drink. Sleep. Wake. Live.'],
        'en'
      );
      expect(result).not.toBeNull();
      expect(result!.score).toBeLessThanOrEqual(1);
      expect(result!.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('readabilityBand', () => {
    it('maps LIX values to the five bands (lower = easier)', () => {
      expect(readabilityBand(25, 'lix').band).toBe('very_easy');
      expect(readabilityBand(35, 'lix').band).toBe('easy');
      expect(readabilityBand(48, 'lix').band).toBe('medium');
      expect(readabilityBand(55, 'lix').band).toBe('hard');
      expect(readabilityBand(66, 'lix').band).toBe('very_hard');
    });

    it('uses inclusive lower / exclusive upper LIX boundaries', () => {
      expect(readabilityBand(30, 'lix').band).toBe('easy');
      expect(readabilityBand(40, 'lix').band).toBe('medium');
      expect(readabilityBand(50, 'lix').band).toBe('hard');
      expect(readabilityBand(60, 'lix').band).toBe('very_hard');
    });

    it('maps Flesch values to the five bands (higher = easier)', () => {
      expect(readabilityBand(85, 'flesch').band).toBe('very_easy');
      expect(readabilityBand(72, 'flesch').band).toBe('easy');
      expect(readabilityBand(65, 'flesch').band).toBe('medium');
      expect(readabilityBand(52, 'flesch').band).toBe('hard');
      expect(readabilityBand(40, 'flesch').band).toBe('very_hard');
    });

    it('carries an i18n key and a color per band', () => {
      const band = readabilityBand(66, 'lix');
      expect(band.i18nKey).toBe('read_band_very_hard');
      expect(band.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});
