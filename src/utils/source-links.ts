import type { LinkData } from '../types/analysis';

// Hosts whose links are profiles, share buttons, messengers or trackers —
// never a source that backs a claim. Matched by hostname suffix, so
// "de.linkedin.com" and "m.facebook.com" are covered while a path that merely
// contains "facebook" is not.
const NON_SOURCE_HOSTS = [
  'facebook.com', 'fb.com', 'fb.me', 'messenger.com',
  'x.com', 'twitter.com', 't.co',
  'linkedin.com', 'lnkd.in',
  'instagram.com',
  'tiktok.com',
  'youtube.com', 'youtu.be',
  'threads.net', 'threads.com',
  'xing.com',
  'pinterest.com', 'pin.it',
  'whatsapp.com', 'wa.me',
  'telegram.org', 't.me', 'telegram.me',
  'mastodon.social', 'mastodon.online', 'bsky.app',
  'snapchat.com',
  'reddit.com',
  'addtoany.com', 'sharethis.com', 'addthis.com',
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
];

function hostOf(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isNonSourceHost(host: string): boolean {
  // Self-hosted Mastodon instances usually live on a "mastodon." subdomain
  if (host.startsWith('mastodon.')) return true;
  return NON_SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * A link that can count as a source for the page's claims: external, inside
 * the content (not header/nav/footer/share widgets), with visible anchor text,
 * and not pointing to a social network, messenger or tracker.
 */
export function isSourceLink(link: LinkData): boolean {
  if (!link.isExternal || link.isNavigational) return false;
  if (!link.text || link.text.trim().length === 0) return false;
  const host = hostOf(link.href);
  if (!host) return false;
  return !isNonSourceHost(host);
}

/**
 * Source links of a page, de-duplicated by URL (ignoring the fragment) — the
 * same source linked twice is still one source. Shared by TrustSources
 * ("External sources") and AiCitation ("Claims with sources") so both checks
 * always count the same links.
 */
export function getSourceLinks(links: LinkData[]): LinkData[] {
  const seen = new Set<string>();
  const result: LinkData[] = [];
  for (const link of links) {
    if (!isSourceLink(link)) continue;
    const key = link.href.split('#')[0].replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}
