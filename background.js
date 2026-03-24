/**
 * ChatClaw - Background Worker
 * Handles extension lifecycle and side panel opening.
 */

const CONTENT_SCRIPT_FILES = ['content-script.js'];

const isInjectableTab = (tab) => {
  if (!tab || typeof tab.id !== 'number') return false;
  const url = String(tab.url || '');
  if (!url) return false;
  if (url.startsWith('chrome://')) return false;
  if (url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('devtools://')) return false;
  if (url.startsWith('about:')) return false;
  return true;
};

const injectContentScriptToTab = async (tab) => {
  if (!isInjectableTab(tab)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: CONTENT_SCRIPT_FILES
    });
    console.log('[Background] Injected content script into tab:', tab.id);
  } catch (error) {
    console.warn('[Background] Skipped content script injection for tab:', tab.id, error?.message || error);
  }
};

const injectContentScriptToExistingTabs = async () => {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(injectContentScriptToTab));
  } catch (error) {
    console.warn('[Background] Failed to inject content script into existing tabs:', error);
  }
};

// Open side panel on action click
chrome.action.onClicked.addListener((tab) => {
  console.log('[Background] Action clicked. Tab ID:', tab?.id, 'Window ID:', tab?.windowId);
  // Check if sidePanel API is available (Chrome 114+)
  if (chrome.sidePanel && chrome.sidePanel.open) {
    chrome.sidePanel.open({ windowId: tab.windowId })
      .then(() => console.log('[Background] Side panel opened successfully via action click.'))
      .catch((error) => console.error('[Background] Failed to open side panel:', error));
  } else {
    // Fallback or older browser handling if needed
    console.warn('[Background] Side Panel API not supported. Please update Chrome.');
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Received message:', request.action, 'from tab:', sender?.tab?.id);

  if (request.action === 'open_sidebar') {
    const senderWindowId = sender?.tab?.windowId;
    if (chrome.sidePanel && chrome.sidePanel.open && typeof senderWindowId === 'number') {
      chrome.sidePanel.open({ windowId: senderWindowId })
        .then(() => console.log('[Background] Side panel opened successfully from content script.'))
        .catch((error) => console.error('[Background] Failed to open side panel from content script:', error));
    } else {
      console.warn('[Background] Missing sender windowId, unable to open side panel from content script.');
    }

    chrome.storage.local.set({ pendingSelection: request.selection }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Background] Failed to store pendingSelection:', chrome.runtime.lastError);
      } else {
        console.log('[Background] Stored pendingSelection:', request.selection.substring(0, 50) + '...');
      }
    });

    chrome.runtime.sendMessage({ action: 'sidebar_selection', selection: request.selection })
      .then(() => console.log('[Background] Sent sidebar_selection message directly to sidebar.'))
      .catch((err) => {
        console.log('[Background] Direct message to sidebar failed (likely closed):', err.message);
      });
    sendResponse({ ok: true });
    return;
  }
  sendResponse({ ok: false });
});

// Set panel behavior
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed/updated. Reason:', details.reason);
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .then(() => console.log('[Background] Panel behavior set: openPanelOnActionClick=true'))
      .catch((error) => console.error('[Background] Failed to set panel behavior:', error));
  }
  injectContentScriptToExistingTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectContentScriptToExistingTabs();
});
