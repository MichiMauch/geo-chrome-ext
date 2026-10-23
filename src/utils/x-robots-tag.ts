import type { RobotsMetaData } from '../types/analysis';
import { GEO_CONFIG } from '../config/geo-config';
import { parseMaxSnippet } from './dom-helpers';

// X-Robots-Tag: the HTTP-header twin of <meta name="robots">. A server (or a
// CDN rule) can set "noindex" there without any trace in the HTML, so the
// meta tag alone can call a page indexable that search engines drop.
//
// Syntax (Google): comma-separated directives, optionally scoped to one
// crawler with a "<user-agent>: " prefix that applies until the next prefix:
//   X-Robots-Tag: noindex, nofollow
//   X-Robots-Tag: googlebot: noindex, otherbot: nofollow
// fetch() joins repeated headers with ", ", which keeps that reading intact.

// Directives that carry their own "name: value" and are no user-agent prefix
const VALUED_DIRECTIVES = new Set([
  'unavailable_after', 'max-snippet', 'max-image-preview', 'max-video-preview',
]);

// Crawlers whose scoped directives matter here: the big search engines plus
// the AI crawlers the robots.txt check covers.
const RELEVANT_AGENTS = new Set([
  'googlebot', 'bingbot',
  ...GEO_CONFIG.machineReadability.aiBots.map((b) => b.toLowerCase()),
]);

/** Directives (lowercased) that apply to search engines and AI crawlers. */
export function parseXRobotsTag(header: string | null | undefined): string[] {
  if (!header) return [];
  const directives: string[] = [];
  let agent: string | null = null;
  for (const raw of header.split(',')) {
    let part = raw.trim().toLowerCase();
    if (!part) continue;
    const prefix = part.match(/^([a-z0-9_.-]+)\s*:\s*(.*)$/);
    if (prefix && !VALUED_DIRECTIVES.has(prefix[1])) {
      agent = prefix[1];
      part = prefix[2].trim();
      if (!part) continue;
    }
    if (agent === null || agent === '*' || RELEVANT_AGENTS.has(agent)) directives.push(part);
  }
  return directives;
}

/** The robots meta data with the X-Robots-Tag header's directives added. */
export function withXRobotsTag(meta: RobotsMetaData, header: string | null | undefined): RobotsMetaData {
  const value = header?.trim();
  if (!value) return meta;
  const tokens = parseXRobotsTag(value);
  const headerLimit = parseMaxSnippet(tokens);
  const limits = [meta.maxSnippet, headerLimit].filter((n): n is number => n !== undefined);
  const bounded = limits.filter((n) => n >= 0);
  const maxSnippet = limits.length === 0 ? undefined : bounded.length > 0 ? Math.min(...bounded) : -1;
  return {
    ...meta,
    hasNoIndex: meta.hasNoIndex || tokens.includes('noindex') || tokens.includes('none'),
    hasNoFollow: meta.hasNoFollow || tokens.includes('nofollow') || tokens.includes('none'),
    hasNoArchive: meta.hasNoArchive || tokens.includes('noarchive'),
    hasNoSnippet: meta.hasNoSnippet || tokens.includes('nosnippet'),
    headerContent: value,
    ...(maxSnippet !== undefined ? { maxSnippet } : {}),
  };
}
