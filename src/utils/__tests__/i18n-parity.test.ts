import { describe, it, expect } from 'vitest';
import { translations, type Lang } from '../i18n';

// t() silently falls back to English, so a key added only to en/de shows up
// as English text in the other four languages without any error.
describe('translations', () => {
  const english = Object.keys(translations.en).sort();
  (Object.keys(translations) as Lang[])
    .filter((lang) => lang !== 'en')
    .forEach((lang) => {
      it(`${lang} has exactly the English keys`, () => {
        expect(Object.keys(translations[lang]).sort()).toEqual(english);
      });
    });
});
