import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, robotsForPath, robotsPathFromUrl } from '../../utils/dom-helpers';
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

describe('parseRobotsTxt path matching', () => {
  it('blocks a page inside a disallowed directory', () => {
    const txt = `User-agent: *
Disallow: /blog/`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/blog/post-1').allowedBots['GPTBot']).toBe(false);
    expect(parseRobotsTxt(txt, BOTS, undefined, '/about').allowedBots['GPTBot']).toBe(true);
  });

  it('lets the longer Allow rule win over a shorter Disallow', () => {
    const txt = `User-agent: *
Disallow: /
Allow: /public/`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/public/page').allowedBots['GPTBot']).toBe(true);
    expect(parseRobotsTxt(txt, BOTS, undefined, '/private/page').allowedBots['GPTBot']).toBe(false);
  });

  it('lets the longer Disallow rule win over a shorter Allow', () => {
    const txt = `User-agent: *
Allow: /docs/
Disallow: /docs/internal/`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/docs/guide').allowedBots['GPTBot']).toBe(true);
    expect(parseRobotsTxt(txt, BOTS, undefined, '/docs/internal/x').allowedBots['GPTBot']).toBe(false);
  });

  it('gives Allow the win on equally long rules', () => {
    const txt = `User-agent: *
Disallow: /page
Allow: /page`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/page').allowedBots['GPTBot']).toBe(true);
  });

  it('supports * wildcards inside rule paths', () => {
    const txt = `User-agent: *
Disallow: /*.pdf`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/files/report.pdf').allowedBots['GPTBot']).toBe(false);
    expect(parseRobotsTxt(txt, BOTS, undefined, '/files/report.html').allowedBots['GPTBot']).toBe(true);
  });

  it('honors the $ end-of-path anchor', () => {
    const txt = `User-agent: *
Disallow: /page$`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/page').allowedBots['GPTBot']).toBe(false);
    expect(parseRobotsTxt(txt, BOTS, undefined, '/page/sub').allowedBots['GPTBot']).toBe(true);
  });

  it('treats an empty Disallow value as no restriction', () => {
    const txt = `User-agent: *
Disallow:`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/anything').allowedBots['GPTBot']).toBe(true);
  });

  it('matches against the query string as well', () => {
    const txt = `User-agent: *
Disallow: /*?print=`;
    expect(parseRobotsTxt(txt, BOTS, undefined, '/article?print=1').allowedBots['GPTBot']).toBe(false);
    expect(parseRobotsTxt(txt, BOTS, undefined, '/article').allowedBots['GPTBot']).toBe(true);
  });

  it('keeps the bot-specific block winning over the wildcard per path', () => {
    const txt = `User-agent: *
Disallow: /blog/

User-agent: GPTBot
Allow: /`;
    const result = parseRobotsTxt(txt, BOTS, undefined, '/blog/post');
    expect(result.allowedBots['GPTBot']).toBe(true);
    expect(result.allowedBots['ClaudeBot']).toBe(false);
  });
});

describe('robotsPathFromUrl', () => {
  it('returns path plus query', () => {
    expect(robotsPathFromUrl('https://example.com/blog/post?a=1#frag')).toBe('/blog/post?a=1');
  });

  it('falls back to the root for garbage input', () => {
    expect(robotsPathFromUrl('not a url')).toBe('/');
  });
});

describe('robotsForPath', () => {
  const txt = `User-agent: *
Disallow: /blog/`;

  it('re-evaluates a cached robots.txt for another URL', () => {
    const cached = parseRobotsTxt(txt, BOTS, 'https://example.com/robots.txt', '/');
    expect(cached.allowedBots['GPTBot']).toBe(true);

    const forBlog = robotsForPath(cached, 'https://example.com/blog/post');
    expect(forBlog.allowedBots['GPTBot']).toBe(false);
    expect(forBlog.blockedBots).toContain('GPTBot');
    expect(forBlog.url).toBe('https://example.com/robots.txt');
  });

  it('returns the input unchanged when the path already matches', () => {
    const cached = parseRobotsTxt(txt, BOTS, undefined, '/blog/post');
    expect(robotsForPath(cached, 'https://example.com/blog/post')).toBe(cached);
  });

  it('handles a missing robots.txt without re-parsing', () => {
    const none = {
      exists: false,
      allowedBots: { GPTBot: true },
      blockedBots: [],
      totalChecked: 1,
    };
    const result = robotsForPath(none, 'https://example.com/blog/post');
    expect(result.exists).toBe(false);
    expect(result.allowedBots['GPTBot']).toBe(true);
    expect(result.path).toBe('/blog/post');
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
    canonical: { href: null },
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

describe('parseRobotsTxt with several groups for one bot', () => {
  // Splitting rules for a bot across groups is common in hand-written files
  const txt = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: GPTBot
Disallow: /spa.html`;

  it('merges every group of the same bot', () => {
    expect(parseRobotsTxt(txt, BOTS, undefined, '/spa.html').allowedBots['GPTBot']).toBe(false);
    expect(parseRobotsTxt(txt, BOTS, undefined, '/').allowedBots['GPTBot']).toBe(true);
  });

  it('leaves the other bots on the wildcard group', () => {
    const result = parseRobotsTxt(txt, BOTS, undefined, '/spa.html');
    expect(result.allowedBots['ClaudeBot']).toBe(true);
    expect(result.blockedBots).toEqual(['GPTBot']);
  });

  it('does not fall back to the wildcard when the bot has its own group elsewhere', () => {
    const split = `User-agent: *
Disallow: /

User-agent: GPTBot
Crawl-delay: 5

User-agent: GPTBot
Allow: /`;
    expect(parseRobotsTxt(split, BOTS, undefined, '/page').allowedBots['GPTBot']).toBe(true);
    expect(parseRobotsTxt(split, BOTS, undefined, '/page').allowedBots['CCBot']).toBe(false);
  });
});
