/**
 * ChatClaw - Background Worker
 * Handles extension lifecycle and side panel opening.
 */

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
    // Open side panel
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId })
        .then(() => console.log('[Background] Side panel opened successfully from content script.'))
        .catch((error) => console.error('[Background] Failed to open side panel from content script:', error));
    }

    // Store selection for sidebar to pick up
    // We use storage because sidebar might not be open yet
    chrome.storage.local.set({ 'pendingSelection': request.selection }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Background] Failed to store pendingSelection:', chrome.runtime.lastError);
      } else {
        console.log('[Background] Stored pendingSelection:', request.selection.substring(0, 50) + '...');
      }
    });
    
    // Also try sending directly if sidebar is listening
    chrome.runtime.sendMessage({ action: 'sidebar_selection', selection: request.selection })
      .then(() => console.log('[Background] Sent sidebar_selection message directly to sidebar.'))
      .catch((err) => {
        // Expected if sidebar is not open yet
        console.log('[Background] Direct message to sidebar failed (likely closed):', err.message);
      }); // Ignore error if no listener
  }
});

// Set panel behavior
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed/updated. Reason:', details.reason);
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .then(() => console.log('[Background] Panel behavior set: openPanelOnActionClick=true'))
      .catch((error) => console.error('[Background] Failed to set panel behavior:', error));
  }
});
