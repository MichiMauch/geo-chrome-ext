import { describe, it, expect } from 'vitest';
import {
  computeFleschReadingEase,
  computeLix,
  computeReadabilityScore,
  countSyllables,
  detectTextLang,
  readabilityBand,
  readabilityFormula,
  resolveContentLang,
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

    it('splits German vowel groups after a diphthong', () => {
      expect(countSyllables('neue', 'de')).toBe(2);
      expect(countSyllables('Feuer', 'de')).toBe(2);
      expect(countSyllables('Mauer', 'de')).toBe(2);
      expect(countSyllables('Haus', 'de')).toBe(1);
      expect(countSyllables('Seele', 'de')).toBe(2);
      expect(countSyllables('Versorgung', 'de')).toBe(3);
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

    it('clamps the raw value to 0–100', () => {
      const hard =
        'The phenomenological investigation of consciousness necessitates a comprehensive understanding of intentionality and the constitutive operations performed by transcendental subjectivity throughout temporally extended experiential horizons.';
      expect(computeFleschReadingEase(hard, 'en')).toBe(0);
      expect(computeFleschReadingEase('Go. Run. Sit. Eat.', 'en')).toBeLessThanOrEqual(100);
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

  describe('paragraph boundaries', () => {
    it('treats each paragraph end as a sentence end', () => {
      // FAQ fragments without a final period used to merge into one giant
      // sentence when the paragraphs were joined with ' '.
      const fragments = [
        'Strompreise steigen im nächsten Jahr',
        'Netzkosten machen einen grossen Teil aus',
        'Der Bund prüft neue Massnahmen',
        'Haushalte können selbst sparen',
      ];
      const perParagraph = computeLix(fragments)!;
      const merged = computeLix(fragments.join(' '))!;
      expect(perParagraph).toBeLessThan(merged);
      // 20 words in 4 sentences instead of 1: words/sentence drops 20 → 5
      expect(merged - perParagraph).toBeCloseTo(20 - 5, 5);
    });
  });

  describe('language resolution', () => {
    const de = ['Die Stromversorgung in der Schweiz ist sicher und wird auch in Zukunft von den Netzbetreibern gewährleistet.'];
    const en = ['The power supply is safe and will be guaranteed by the grid operators in the future, as they have said.'];

    it('prefers the declared page language over the text', () => {
      expect(resolveContentLang('de', en)).toBe('de');
      expect(resolveContentLang('de-CH', en)).toBe('de');
      expect(resolveContentLang('EN_us', de)).toBe('en');
      expect(resolveContentLang('en-GB', de)).toBe('en');
    });

    it('keeps any declared language, not only UI languages', () => {
      expect(resolveContentLang('nl', de)).toBe('nl');
      expect(resolveContentLang('sv-SE', en)).toBe('sv');
      expect(resolveContentLang('nb', en)).toBe('nb');
      expect(resolveContentLang(' PL ', en)).toBe('pl');
    });

    it('falls back to the stopword guess, else unknown (null)', () => {
      expect(resolveContentLang(undefined, de)).toBe('de');
      expect(resolveContentLang('', en)).toBe('en');
      expect(resolveContentLang('und', en)).toBe('en');
      expect(resolveContentLang('x-default', en)).toBe('en');
      expect(resolveContentLang(undefined, ['Hallo Welt'])).toBeNull();
    });

    it('uses Flesch only for English, LIX for every other or unknown language', () => {
      expect(readabilityFormula('en')).toBe('flesch');
      for (const lang of ['de', 'nl', 'sv', 'da', 'no', 'nb', 'nn', 'fi', 'pl', 'fr', 'es', 'pt', 'it']) {
        expect(readabilityFormula(lang)).toBe('lix');
      }
      expect(readabilityFormula(null)).toBe('lix');
    });

    it('detectTextLang needs a clear majority', () => {
      expect(detectTextLang(de[0])).toBe('de');
      expect(detectTextLang(en[0])).toBe('en');
      expect(detectTextLang('Smart Meter Rollout')).toBeNull();
    });
  });

  describe('computeReadabilityScore', () => {
    it('maps LIX linearly: ≤40 full points, ≥65 zero', () => {
      // 5 short words per sentence, none long → LIX 5
      const easy = computeReadabilityScore(['Der Tag ist gut. Das Brot ist warm. Die Sonne ist hell heute.'], 'de')!;
      expect(easy.score).toBe(1);

      // 1 sentence of 10 words, 6 of them long → LIX 10 + 60 = 70 → clamped 0
      const hard = computeReadabilityScore(
        ['Die Stromversorgung braucht zusätzliche Kraftwerke und mehr Speicherkapazitäten im Winterhalbjahr.'],
        'de'
      )!;
      expect(hard.raw).toBeCloseTo(10 + 60, 5);
      expect(hard.score).toBe(0);
    });

    it('lets a typical German Sachtext around LIX 50 pass', () => {
      // LIX 50 → (65-50)/25 = 0.6 ≥ readabilityScoreMin 0.5
      const result = computeReadabilityScore(
        [
          'Die Stromversorgung in der Schweiz ist heute sicher. Im Winter importiert das Land jedoch einen Teil seines Stroms aus dem Ausland.',
          'Deshalb braucht es zusätzliche Kraftwerke und mehr Speicher. Der Bund prüft verschiedene Massnahmen, um eine Mangellage zu verhindern.',
        ],
        'de'
      )!;
      expect(result.formula).toBe('lix');
      expect(result.raw).toBeGreaterThan(40);
      expect(result.raw).toBeLessThan(55);
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    });

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

    // End-to-end: page language → formula, independent of the UI language
    // (which resolveContentLang no longer takes at all).
    const nl = ['De energievoorziening in Nederland is veilig. Netbeheerders investeren de komende jaren fors in het stroomnet.'];
    const sv = ['Elförsörjningen i Sverige är trygg. Nätägarna investerar mycket i elnätet under de kommande åren.'];
    const enText = ['The power supply is safe. The grid operators will invest a lot in the network over the next years.'];

    it('measures a Dutch page with LIX (e.g. under an English UI)', () => {
      const result = computeReadabilityScore(nl, resolveContentLang('nl-NL', nl))!;
      expect(result.formula).toBe('lix');
    });

    it('measures a Swedish page with LIX', () => {
      const result = computeReadabilityScore(sv, resolveContentLang('sv', sv))!;
      expect(result.formula).toBe('lix');
    });

    it('measures an English page with Flesch (e.g. under a German UI)', () => {
      expect(computeReadabilityScore(enText, resolveContentLang('en', enText))!.formula).toBe('flesch');
      expect(computeReadabilityScore(enText, resolveContentLang('en-GB', enText))!.formula).toBe('flesch');
    });

    it('measures undeclared English text with Flesch, undeclared unknown text with LIX', () => {
      expect(computeReadabilityScore(enText, resolveContentLang(undefined, enText))!.formula).toBe('flesch');
      expect(computeReadabilityScore(nl, resolveContentLang(undefined, nl))!.formula).toBe('lix');
    });

    it('measures French, Spanish, Portuguese and Italian pages with LIX', () => {
      const fr = ['La sécurité de l’approvisionnement est garantie. Les gestionnaires de réseau investissent beaucoup.'];
      const es = ['El suministro eléctrico es seguro. Los operadores de la red invierten mucho en los próximos años.'];
      const pt = ['O fornecimento de energia é seguro. Os operadores da rede investem muito nos próximos anos.'];
      const it = ['La fornitura di energia è sicura. I gestori della rete investono molto nei prossimi anni.'];
      for (const [lang, text] of [['fr', fr], ['es', es], ['pt-BR', pt], ['it', it]] as const) {
        expect(computeReadabilityScore([...text], resolveContentLang(lang, [...text]))!.formula).toBe('lix');
      }
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
