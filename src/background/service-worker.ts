const ALARM_PREFIX = 'geo_badge_clear_';

// Open the side panel on toolbar-icon click (Chrome 114+).
// Without a default_popup, this is what makes the action button work.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.warn('sidePanel.setPanelBehavior failed:', err));
  }
});

// Fallback for browsers without sidePanel API: open popup.html in a window.
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open && tab.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (err) {
      console.warn('sidePanel.open failed, falling back to popup window:', err);
    }
  }
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/popup.html'),
    type: 'popup',
    width: 460,
    height: 720,
  });
});

// Auto-clear badge when alarm fires (30 min after analysis)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const tabId = parseInt(alarm.name.replace(ALARM_PREFIX, ''), 10);
  if (!isNaN(tabId)) {
    try {
      await chrome.action.setBadgeText({ text: '', tabId });
    } catch {
      // Tab may already be closed
    }
  }
});

// Clear badge when tab navigates to a new page
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    try {
      await chrome.action.setBadgeText({ text: '', tabId });
      await chrome.alarms.clear(`${ALARM_PREFIX}${tabId}`);
    } catch {
      // Ignore
    }
  }
});

// Clean up alarm when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await chrome.alarms.clear(`${ALARM_PREFIX}${tabId}`);
  } catch {
    // Ignore
  }
});
