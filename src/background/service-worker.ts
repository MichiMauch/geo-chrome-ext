const ALARM_PREFIX = 'geo_badge_clear_';

// Open the side panel on toolbar-icon click and tell it to (re-)analyze the
// active tab. We intentionally do NOT use setPanelBehavior({
// openPanelOnActionClick: true }) because that suppresses action.onClicked —
// and we need the click event so the user's gesture grants activeTab for the
// current tab. This is what lets the extension run without persistent
// host_permissions.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || tab.windowId === undefined) return;

  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: 'popup/popup.html',
        enabled: true,
      });
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (err) {
      console.warn('sidePanel.open failed, falling back to popup window:', err);
      chrome.windows.create({
        url: chrome.runtime.getURL('popup/popup.html'),
        type: 'popup',
        width: 460,
        height: 720,
      });
      return;
    }
  } else {
    // Browser without sidePanel API — open as standalone window
    chrome.windows.create({
      url: chrome.runtime.getURL('popup/popup.html'),
      type: 'popup',
      width: 460,
      height: 720,
    });
    return;
  }

  // The panel might still be loading on first open — DOMContentLoaded will
  // handle that path. For subsequent clicks (panel already open) the message
  // tells the panel to re-run the analysis for the just-activated tab.
  // The send happens on next tick so the panel has a moment to attach its
  // onMessage listener if it just opened.
  setTimeout(() => {
    chrome.runtime
      .sendMessage({ type: 'analyze-tab', tabId: tab.id })
      .catch(() => {
        // No receiver yet (panel still loading). The panel's own
        // DOMContentLoaded will start the analysis itself.
      });
  }, 150);
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
