/**
 * ChatClaw - Background Worker
 * Handles extension lifecycle and side panel opening.
 */

// Open side panel on action click
chrome.action.onClicked.addListener((tab) => {
  // Check if sidePanel API is available (Chrome 114+)
  if (chrome.sidePanel && chrome.sidePanel.open) {
    chrome.sidePanel.open({ windowId: tab.windowId })
      .catch((error) => console.error('Failed to open side panel:', error));
  } else {
    // Fallback or older browser handling if needed
    console.warn('Side Panel API not supported');
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open_sidebar') {
    // Open side panel
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId })
        .catch((error) => console.error('Failed to open side panel from content script:', error));
    }

    // Store selection for sidebar to pick up
    // We use storage because sidebar might not be open yet
    chrome.storage.local.set({ 'pendingSelection': request.selection });
    
    // Also try sending directly if sidebar is listening
    chrome.runtime.sendMessage({ action: 'sidebar_selection', selection: request.selection })
      .catch(() => {}); // Ignore error if no listener
  }
});

// Set panel behavior
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error(error));
  }
});
