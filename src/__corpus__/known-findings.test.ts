// @vitest-environment jsdom
// Findings checked by hand on the live pages. Unlike the golden files these
// are statements the analysis must keep making, whatever else changes.
import { describe, it, expect } from 'vitest';
import { analyzeSnapshot, hasSnapshot } from './corpus';

const page = (id: string) => (hasSnapshot(id) ? it : it.skip);
const criterion = async (id: string, category: string, key: string) =>
  (await analyzeSnapshot(id)).categories[category].details.find((d) => d.criterionKey === key)!;
const keys = (d: { evidence?: { key: string }[] }) => (d.evidence ?? []).map((e) => e.key);

describe('Bekannte Befunde im Referenzkorpus', () => {
  page('economiesuisse-strom')('economiesuisse: FAQ-Antworten fehlen im HTML (Next.js-Accordion)', async () => {
    const d = await criterion('economiesuisse-strom', 'aiCitation', 'criterion_faq');
    expect(d.value).toBe('value_faqAnswersHidden');
    expect(keys(d)).toContain('ev_faq_hidden');
  });

  page('kokomo-rueckblick')('kokomo: FAQPage aus Zwischentiteln zählt nicht, Masseinheiten sind Fakten', async () => {
    expect(keys(await criterion('kokomo-rueckblick', 'machineReadability', 'criterion_schema'))).toContain('ev_schema_faq_unbacked');
    expect((await criterion('kokomo-rueckblick', 'aiCitation', 'criterion_facts')).found).toBe(true);
  });

  page('geo-mauch')('geo.mauch.rocks: Single-Page-App ohne Inhalt im HTML', async () => {
    const r = await analyzeSnapshot('geo-mauch');
    expect(r.pageData.headings).toHaveLength(0);
    expect(r.categories.contentClarity.recommendations).toContain('no_h1');
  });

  page('cloudflare-artikel')('Cloudflare: Content-Signal erlaubt alles, kein Abzug', async () => {
    const d = await criterion('cloudflare-artikel', 'machineReadability', 'criterion_robotsTxt');
    expect(d.found).toBe(true);
    expect(keys(d)).toContain('ev_robotsTxt_signal');
  });

  page('gov-uk-tax')('gov.uk: Tabelle mit Kopfzellen zählt', async () => {
    expect(keys(await criterion('gov-uk-tax', 'answerability', 'criterion_lists'))).toContain('ev_tables_found');
  });

  it.each(['admin-ch-start', 'eda-home', 'ch-ch-de', 'spruengli', 'uzh-home', 'stadt-zuerich'].map((id) => [id]))(
    '%s ist eine Startseite, trotz og:type article oder AEM-Pfad',
    async (id) => {
      if (!hasSnapshot(id)) return;
      expect((await analyzeSnapshot(id)).pageType).toBe('homepage');
    }
  );
});
