/**
 * MicroClaw - Background Worker
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

// Set panel behavior
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error(error));
  }
});
