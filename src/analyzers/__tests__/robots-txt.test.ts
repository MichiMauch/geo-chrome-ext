import { describe, it, expect } from 'vitest';
import { parseRobotsTxt } from '../../utils/dom-helpers';
import { MachineReadabilityAnalyzer } from '../machine-readability';
import type { PageData, RobotsTxtData } from '../../types/analysis';

const BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'] as const;

describe('parseRobotsTxt', () => {
  it('allows all bots when robots.txt is empty', () => {
    const result = parseRobotsTxt('', BOTS);
    expect(result.blockedBots).toEqual([]);
    for (const b of BOTS) expect(result.allowedBots[b]).toBe(true);
  });

  it('blocks GPTBot via specific block', () => {
    const txt = `User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.blockedBots).toEqual(['GPTBot']);
    expect(result.allowedBots['GPTBot']).toBe(false);
    expect(result.allowedBots['ClaudeBot']).toBe(true);
  });

  it('blocks all bots via wildcard', () => {
    const txt = `User-agent: *
Disallow: /`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.blockedBots.length).toBe(BOTS.length);
  });

  it('is case-insensitive for user-agent names', () => {
    const txt = `User-agent: gptbot
Disallow: /`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.allowedBots['GPTBot']).toBe(false);
  });

  it('treats specific bot block as overriding the wildcard fallback', () => {
    const txt = `User-agent: *
Disallow: /

User-agent: ClaudeBot
Allow: /`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.allowedBots['ClaudeBot']).toBe(true);
    expect(result.allowedBots['GPTBot']).toBe(false);
  });

  it('treats path-specific Disallow (non-root) as allowed', () => {
    const txt = `User-agent: GPTBot
Disallow: /private/`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.allowedBots['GPTBot']).toBe(true);
  });

  it('handles comments and whitespace', () => {
    const txt = `# my comment
User-agent: GPTBot   # trailing comment
Disallow: /   # block everything

User-agent: *
Allow: /`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.allowedBots['GPTBot']).toBe(false);
  });

  it('groups consecutive user-agent lines into one block', () => {
    const txt = `User-agent: GPTBot
User-agent: CCBot
Disallow: /`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.blockedBots).toContain('GPTBot');
    expect(result.blockedBots).toContain('CCBot');
    expect(result.allowedBots['ClaudeBot']).toBe(true);
  });

  it('Allow: / overrides Disallow: / in the same block', () => {
    const txt = `User-agent: GPTBot
Disallow: /
Allow: /`;
    const result = parseRobotsTxt(txt, BOTS);
    expect(result.allowedBots['GPTBot']).toBe(true);
  });
});

describe('MachineReadabilityAnalyzer robots.txt scoring', () => {
  const analyzer = new MachineReadabilityAnalyzer();

  const mockPage = (robotsTxt: RobotsTxtData): PageData => ({
    url: 'https://example.com',
    headings: [{ level: 1, text: 'Hello' }],
    paragraphs: ['Body'],
    lists: [],
    links: [],
    meta: { title: 'T', description: 'D', author: 'A', publishDate: null, modifiedDate: null, ogType: null },
    schema: [],
    author: null,
    dates: [],
    semanticElements: { hasArticle: false, hasMain: false, hasNav: false, hasAside: false, hasHeader: false, hasFooter: false, hasSection: false },
    llmsTxt: { exists: false },
    robotsTxt,
    images: [],
    openGraph: { title: null, description: null, image: null, url: null, type: null },
    twitterCard: { card: null, title: null, description: null, image: null },
    robotsMeta: { hasNoIndex: false, hasNoFollow: false, hasNoArchive: false, hasNoSnippet: false, rawContent: null },
    viewport: { hasViewport: false, hasDeviceWidth: false, userScalableNo: false, rawContent: null },
  });

  it('recommends ai_bots_blocked when any bot is blocked', () => {
    const result = analyzer.analyze(mockPage({
      exists: true,
      allowedBots: { GPTBot: false, ClaudeBot: true, PerplexityBot: true, 'Google-Extended': true, CCBot: true },
      blockedBots: ['GPTBot'],
      totalChecked: 5,
    }));
    expect(result.recommendations).toContain('ai_bots_blocked');
    const detail = result.details.find((d) => d.criterionKey === 'criterion_robotsTxt');
    expect(detail?.found).toBe(false);
    expect(detail?.progress?.current).toBe(4);
    expect(detail?.progress?.target).toBe(5);
  });

  it('does not recommend ai_bots_blocked when all bots allowed', () => {
    const result = analyzer.analyze(mockPage({
      exists: true,
      allowedBots: { GPTBot: true, ClaudeBot: true, PerplexityBot: true, 'Google-Extended': true, CCBot: true },
      blockedBots: [],
      totalChecked: 5,
    }));
    expect(result.recommendations).not.toContain('ai_bots_blocked');
    const detail = result.details.find((d) => d.criterionKey === 'criterion_robotsTxt');
    expect(detail?.found).toBe(true);
    expect(detail?.value).toBe('value_allBotsAllowed');
  });

  it('uses value_allBotsBlocked when every bot is blocked', () => {
    const result = analyzer.analyze(mockPage({
      exists: true,
      allowedBots: { GPTBot: false, ClaudeBot: false, PerplexityBot: false, 'Google-Extended': false, CCBot: false },
      blockedBots: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'],
      totalChecked: 5,
    }));
    const detail = result.details.find((d) => d.criterionKey === 'criterion_robotsTxt');
    expect(detail?.value).toBe('value_allBotsBlocked');
  });
});
