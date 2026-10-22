import { describe, it, expect } from 'vitest';
import { TrustSourcesAnalyzer } from '../trust-sources';
import { mapAnalysisResult } from '../../utils/analysis-mapper';
import { getSourceLinks, isSourceLink } from '../../utils/source-links';
import type { LinkData, PageData } from '../../types/analysis';

function makePage(links: LinkData[]): PageData {
  return {
    url: 'https://www.example.ch/artikel',
    headings: [{ level: 1, text: 'Titel' }],
    paragraphs: [],
    lists: [],
    links,
    meta: { title: 'Ein Titel', description: '', author: '', publishDate: null, modifiedDate: null, ogType: 'article' },
    schema: [],
    author: null,
    dates: [],
    semanticElements: { hasArticle: false, hasMain: false, hasNav: false, hasAside: false, hasHeader: false, hasFooter: false, hasSection: false },
    llmsTxt: { exists: false },
    robotsTxt: { exists: false, allowedBots: {}, blockedBots: [], totalChecked: 0 },
    images: [],
    openGraph: { title: null, description: null, image: null, url: null, type: null },
    twitterCard: { card: null, title: null, description: null, image: null },
    robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
    viewport: { hasViewport: true, hasDeviceWidth: true, userScalableNo: false, rawContent: 'width=device-width, initial-scale=1' },
    canonical: { href: 'https://www.example.ch/artikel' },
  };
}

function link(href: string, text = 'Studie', extra: Partial<LinkData> = {}): LinkData {
  return { href, text, isExternal: true, ...extra };
}

function sourcesDetail(links: LinkData[]) {
  const category = new TrustSourcesAnalyzer().analyze(makePage(links), 'article');
  return { category, detail: category.details.find((d) => d.criterionKey === 'criterion_sources') };
}

describe('isSourceLink', () => {
  it.each([
    'https://www.facebook.com/economiesuisse',
    'https://m.facebook.com/sharer.php?u=x',
    'https://x.com/economiesuisse',
    'https://twitter.com/intent/tweet?url=x',
    'https://www.linkedin.com/sharing/share-offsite/?url=x',
    'https://ch.linkedin.com/company/economiesuisse',
    'https://www.instagram.com/economiesuisse',
    'https://www.tiktok.com/@economiesuisse',
    'https://www.youtube.com/@economiesuisse',
    'https://youtu.be/abc',
    'https://www.threads.net/@economiesuisse',
    'https://www.xing.com/pages/economiesuisse',
    'https://wa.me/?text=x',
    'https://t.me/share/url?url=x',
    'https://mastodon.example.org/@economiesuisse',
  ])('schliesst Social-/Share-Host %s aus', (href) => {
    expect(isSourceLink(link(href))).toBe(false);
  });

  it('prüft den Host, nicht einen Teil des Pfads', () => {
    expect(isSourceLink(link('https://www.bfs.admin.ch/studie-facebook-nutzung'))).toBe(true);
    expect(isSourceLink(link('https://notfacebook.com/bericht'))).toBe(true);
  });

  it('schliesst interne, navigationelle, textlose und Nicht-HTTP-Links aus', () => {
    expect(isSourceLink(link('https://www.bfe.admin.ch/', 'BFE', { isExternal: false }))).toBe(false);
    expect(isSourceLink(link('https://www.bfe.admin.ch/', 'BFE', { isNavigational: true }))).toBe(false);
    expect(isSourceLink(link('https://www.bfe.admin.ch/', '   '))).toBe(false);
    expect(isSourceLink(link('tel:+41444213535', '044 421 35 35'))).toBe(false);
    expect(isSourceLink(link('mailto:info@example.ch', 'Mail'))).toBe(false);
  });

  it('zählt denselben Link nur einmal', () => {
    const links = [
      link('https://www.bfe.admin.ch/studie'),
      link('https://www.bfe.admin.ch/studie#kapitel-2'),
      link('https://www.bfe.admin.ch/studie/'),
    ];
    expect(getSourceLinks(links)).toHaveLength(1);
  });
});

describe('TrustSourcesAnalyzer — externe Quellen', () => {
  it('gibt für Social- und Navigationslinks keine Quellen-Punkte', () => {
    const { category, detail } = sourcesDetail([
      link('https://www.facebook.com/economiesuisse', 'Facebook', { isNavigational: true }),
      link('https://x.com/economiesuisse', 'X'),
      link('https://www.linkedin.com/sharing/share-offsite/?url=x', 'Teilen'),
      link('https://www.youtube.com/@economiesuisse', 'YouTube'),
      link('https://www.admin.ch/', 'Bundesverwaltung', { isNavigational: true }),
    ]);
    expect(detail?.found).toBe(false);
    expect(detail?.valueParams).toEqual({ count: '0', target: '2' });
    expect(detail?.progress?.current).toBe(0);
    expect(category.recommendations).toContain('few_sources');
  });

  it('zeigt die tatsächliche Anzahl, die Fortschrittsanzeige deckelt beim Ziel', () => {
    const { category, detail } = sourcesDetail([
      link('https://www.bfe.admin.ch/studie', 'BFE-Studie'),
      link('https://www.bfs.admin.ch/statistik', 'BFS-Statistik'),
      link('https://www.iea.org/report', 'IEA-Report'),
      link('https://www.facebook.com/economiesuisse', 'Facebook'),
    ]);
    expect(detail?.found).toBe(true);
    expect(detail?.value).toBe('value_sourceLinks');
    expect(detail?.valueParams).toEqual({ count: '3', target: '2' });
    expect(detail?.progress).toMatchObject({ current: 2, target: 2 });
    expect(category.recommendations).not.toContain('few_sources');

    const mapped = mapAnalysisResult(category).details.find((d) => String(d.value).includes('3'));
    expect(String(mapped?.value)).not.toContain('{count}');
  });

  it('gibt Teilpunkte für eine einzelne Quelle', () => {
    const { category, detail } = sourcesDetail([link('https://www.bfe.admin.ch/studie', 'BFE-Studie')]);
    expect(detail?.found).toBe(false);
    expect(detail?.progress?.current).toBe(1);
    expect(category.recommendations).toContain('few_sources');
  });
});
