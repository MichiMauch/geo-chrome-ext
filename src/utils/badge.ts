import type { GEOAnalysisResult } from '../types/analysis';

const BADGE_CLEAR_DELAY_MINUTES = 30;
const ALARM_PREFIX = 'geo_badge_clear_';

export async function setBadgeForTab(tabId: number, result: GEOAnalysisResult): Promise<void> {
  try {
    const text = String(Math.round(result.totalScore));
    await chrome.action.setBadgeText({ text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color: result.rating.color, tabId });

    // setBadgeTextColor requires Chrome 110+
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: '#ffffff', tabId });
    }
  } catch {
    // Tab may have been closed
  }

  // Schedule auto-clear via alarm — always attempt, even if badge calls above failed
  try {
    await chrome.alarms.create(`${ALARM_PREFIX}${tabId}`, {
      delayInMinutes: BADGE_CLEAR_DELAY_MINUTES,
    });
  } catch {
    // Alarm creation failed, badge will persist until tab close/navigation
  }
}

export function getAlarmPrefix(): string {
  return ALARM_PREFIX;
}
