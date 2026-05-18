import { describe, it, expect } from 'vitest';
import {
  computeFleschReadingEase,
  computeLix,
  computeReadabilityScore,
  countSyllables,
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
});
