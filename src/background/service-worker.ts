const ALARM_PREFIX = 'geo_badge_clear_';

// v2.x set chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).
// That setting persists across updates and suppresses chrome.action.onClicked,
// so the new onClicked-based flow would never run for upgraded users. Force
// it off on install/update/startup so onClicked fires reliably.
function disableAutoOpenBehavior() {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: false })
      .catch((err) => console.warn('setPanelBehavior reset failed:', err));
  }
}

chrome.runtime.onInstalled.addListener(disableAutoOpenBehavior);
chrome.runtime.onStartup.addListener(disableAutoOpenBehavior);

// Open the side panel on toolbar-icon click and tell it to (re-)analyze the
// active tab. We intentionally do NOT use setPanelBehavior({
// openPanelOnActionClick: true }) because that suppresses action.onClicked —
// and we need the click event so the user's gesture grants activeTab for the
// current tab. This is what lets the extension run without persistent
// host_permissions.
//
// CRITICAL: chrome.sidePanel.open() must be called synchronously in the
// user-gesture handler. Any `await` before it consumes the gesture and the
// call throws with "may only be called in response to a user gesture". So we
// keep the listener non-async and do setOptions/messaging in .then() chains.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || tab.windowId === undefined) return;
  const tabId = tab.id;
  const windowId = tab.windowId;

  if (!chrome.sidePanel?.open) {
    // Browser without sidePanel API — open as standalone window, passing the
    // user's tab id so the popup can analyze the right page.
    chrome.windows.create({
      url: chrome.runtime.getURL(`popup/popup.html?tabId=${tabId}`),
      type: 'popup',
      width: 460,
      height: 720,
    });
    return;
  }

  // Synchronous call — preserves the user gesture for sidePanel.open().
  chrome.sidePanel
    .open({ tabId })
    .then(() => {
      // setOptions does NOT need a user gesture; safe to await here.
      return chrome.sidePanel.setOptions({
        tabId,
        path: 'popup/popup.html',
        enabled: true,
      });
    })
    .then(() => {
      // The panel might still be loading on first open — DOMContentLoaded
      // will handle that path. For subsequent clicks (panel already open)
      // the message tells the panel to re-run the analysis for the
      // just-activated tab. Small delay so a freshly-opening panel can
      // attach its onMessage listener.
      setTimeout(() => {
        chrome.runtime
          .sendMessage({ type: 'analyze-tab', tabId })
          .catch(() => {
            // No receiver yet (panel still loading). The panel's own
            // DOMContentLoaded will start the analysis itself.
          });
      }, 150);
    })
    .catch((err) => {
      console.warn('sidePanel.open failed, falling back to popup window:', err);
      chrome.windows.create({
        url: chrome.runtime.getURL(`popup/popup.html?tabId=${tabId}&windowId=${windowId}`),
        type: 'popup',
        width: 460,
        height: 720,
      });
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
