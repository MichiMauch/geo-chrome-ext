import type { EvidenceLine, LinkData } from '../types/analysis';
import { isSourceLink } from '../utils/source-links';

// Helpers for the report evidence of TrustSources and AiCitation: short text
// excerpts and a plain description of which links count as sources.

const MAX_EXCERPT = 60;
const MAX_HOSTS = 5;

/** Collapses whitespace and cuts text to ~60 characters with "…". */
export function excerpt(text: string, max = MAX_EXCERPT): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd().replace(/[.,:;]$/, '')}…`;
}

/**
 * The part of `text` around the first match of any pattern, ~60 characters,
 * with "…" where it was cut. Null when nothing matches.
 */
export function matchExcerpt(text: string, patterns: RegExp[], max = MAX_EXCERPT): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  for (const pattern of patterns) {
    const match = pattern.exec(clean);
    if (!match) continue;
    if (clean.length <= max) return clean;
    const start = Math.max(0, match.index - Math.floor((max - match[0].length) / 2));
    let end = Math.min(clean.length, start + max);
    let from = Math.max(0, end - max);
    // Cut at word boundaries, never inside the match itself.
    if (from > 0) {
      const space = clean.indexOf(' ', from);
      if (space !== -1 && space < match.index) from = space + 1;
    }
    if (end < clean.length) {
      const space = clean.lastIndexOf(' ', end);
      if (space > match.index + match[0].length) end = space;
    }
    let cut = clean.slice(from, end).trim();
    if (from > 0) cut = `…${cut}`;
    if (end < clean.length) cut = `${cut.replace(/[.,:;]$/, '')}…`;
    return cut;
  }
  return null;
}

export function hostOf(href: string): string {
  try {
    return new URL(href).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return href;
  }
}

/** Distinct host names of the links, at most five, "…" when there are more. */
export function hostList(links: LinkData[]): string {
  const hosts = [...new Set(links.map((l) => hostOf(l.href)))];
  const shown = hosts.slice(0, MAX_HOSTS).join(', ');
  return hosts.length > MAX_HOSTS ? `${shown} …` : shown;
}

/**
 * Why external links on the page don't count as sources. Two groups:
 * social networks / share buttons (by host), and links in the site chrome
 * (header, navigation, footer) or without visible text.
 */
export function excludedLinkEvidence(links: LinkData[]): EvidenceLine[] {
  const notSources = links.filter((l) => l.isExternal && !isSourceLink(l));
  // Same link as if it sat in the content with text: if it still doesn't
  // count, its host is a social network, share widget or tracker.
  const isSocial = (l: LinkData) => !isSourceLink({ ...l, isNavigational: false, text: l.text || 'x' });
  const social = notSources.filter(isSocial);
  const chrome = notSources.filter((l) => !isSocial(l));
  const lines: EvidenceLine[] = [];
  if (social.length > 0) {
    lines.push({ key: 'ev_sources_excluded_social', params: { count: social.length, hosts: hostList(social) } });
  }
  if (chrome.length > 0) {
    lines.push({ key: 'ev_sources_excluded_chrome', params: { count: chrome.length, hosts: hostList(chrome) } });
  }
  return lines;
}
