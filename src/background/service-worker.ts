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

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  return /^(chrome|edge|brave|about|chrome-extension):/.test(url);
}

// Open the side panel on toolbar-icon click and tell it to (re-)analyze the
// active tab. We intentionally do NOT use setPanelBehavior({
// openPanelOnActionClick: true }) because that suppresses action.onClicked —
// and we need the click event so the user's gesture grants activeTab for the
// current tab. This is what lets the extension run without persistent
// host_permissions.
//
// CRITICAL: two synchronous calls must happen inside this user-gesture
// listener, with NO `await` between them:
//   1. chrome.sidePanel.open() — requires "in response to a user gesture"
//   2. chrome.scripting.executeScript() — relies on the activeTab grant
//      that the action click just produced. We inject from HERE (the
//      service-worker click handler) rather than from the side panel,
//      because the activeTab grant doesn't reliably propagate to API
//      calls made later from the side-panel context (observed: Chrome
//      returns "Extension manifest must request permission to access
//      this host" when executeScript is called from popup.ts even though
//      the click just happened).
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || tab.windowId === undefined) return;
  const tabId = tab.id;
  const windowId = tab.windowId;
  const tabUrl = tab.url;

  // 1. Inject content script — synchronous in user-gesture context.
  //    Restricted URLs (chrome://, etc.) are skipped; the side panel will
  //    show the "not supported" state for those.
  if (!isRestrictedUrl(tabUrl)) {
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: ['content/content-script.js'],
      })
      .catch((err) => {
        console.warn('Content script inject failed:', err);
      });
  }

  // 2. Open side panel — synchronous in user-gesture context.
  if (!chrome.sidePanel?.open) {
    chrome.windows.create({
      url: chrome.runtime.getURL(`popup/popup.html?tabId=${tabId}`),
      type: 'popup',
      width: 460,
      height: 720,
    });
    return;
  }

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
