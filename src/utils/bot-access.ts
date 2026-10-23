// Firewall / CDN check: does the server answer an AI crawler the way it
// answers a browser?
//
// robots.txt can allow every bot while a CDN rule ("Block AI bots" on
// Cloudflare, a WAF rule on the User-Agent) answers them with 403. fetch()
// cannot set User-Agent itself, so the service worker adds a short-lived
// declarativeNetRequest session rule for this tab and URL that swaps the
// header — and stamps a marker on the response, so we know the swap really
// happened (no activeTab grant, no rule, no finding).
//
// A request with a bot's User-Agent from a normal IP address is not the real
// bot: CDNs that verify bots by IP can block the imitation and still let the
// real crawler in. The report says so, and the score counts such a block
// only half (see MachineReadabilityAnalyzer).

import type { BotAccessData } from '../types/analysis';

export const PROBE_MARKER_HEADER = 'x-geo-bot-probe';

// Crawlers most often singled out by CDN bot rules; one search and one
// training crawler of OpenAI, plus Anthropic and Perplexity.
export const PROBE_BOTS: Record<string, string> = {
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
};

const BLOCK_STATUSES = new Set([401, 403, 406, 429, 451, 503]);

/** Whether a response to a bot request is a block rather than the page. */
export function isBlockedResponse(status: number, headers: Headers): boolean {
  if (BLOCK_STATUSES.has(status)) return true;
  // Cloudflare challenge pages can come with 200 in some setups
  return /challenge|block/i.test(headers.get('cf-mitigated') ?? '');
}

/**
 * Fetches the page once per probe bot. Only called after a normal fetch of
 * the page succeeded, so a block here is specific to the bot.
 */
export async function probeBotAccess(pageUrl: string = window.location.href): Promise<BotAccessData | undefined> {
  const checked: string[] = [];
  const blocked: BotAccessData['blocked'] = [];
  try {
    for (const [bot, userAgent] of Object.entries(PROBE_BOTS)) {
      const armed = await chrome.runtime
        .sendMessage({ action: 'bot-probe-rule', url: pageUrl, userAgent, bot })
        .catch(() => null);
      if (!armed?.ok) return undefined;
      let response: Response;
      try {
        response = await fetch(pageUrl, { credentials: 'omit', cache: 'no-store', redirect: 'follow' });
      } catch {
        continue; // network error: says nothing about a block
      }
      // Body not needed; free the connection
      response.body?.cancel().catch(() => {});
      if (response.headers.get(PROBE_MARKER_HEADER) !== bot) continue; // rule did not apply
      checked.push(bot);
      if (isBlockedResponse(response.status, response.headers)) blocked.push({ bot, status: response.status });
    }
  } finally {
    await chrome.runtime.sendMessage({ action: 'bot-probe-clear' }).catch(() => {});
  }
  return checked.length > 0 ? { checked, blocked } : undefined;
}
