
(() => {
  let floatHost = null;
  let floatRoot = null;
  let floatBtn = null;
  let currentSelection = '';
  let isEnabled = true;

  const CSS = `
    .chatclaw-float-btn {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: #ffffff;
      color: #0b1020;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 999px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 600;
      animation: chatclaw-pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      white-space: nowrap;
    }

    .chatclaw-float-btn:hover {
      background: #f9fafb;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .chatclaw-float-btn img {
      display: block;
      border-radius: 4px;
      width: 16px;
      height: 16px;
    }

    @keyframes chatclaw-pop-in {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;

  // Initialize settings
  chrome.storage.local.get(['enableFloatBtn'], (result) => {
    isEnabled = result.enableFloatBtn !== false; // Default true
  });

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enableFloatBtn) {
      isEnabled = changes.enableFloatBtn.newValue;
      if (!isEnabled) hideButton();
    }
  });

  function createFloatButton() {
    if (floatHost) return;

    // Create host
    floatHost = document.createElement('div');
    floatHost.id = 'chatclaw-float-host';
    floatHost.style.all = 'initial'; // Reset styles
    floatHost.style.zIndex = '2147483647';
    floatHost.style.position = 'absolute';
    floatHost.style.top = '0';
    floatHost.style.left = '0';

    // Attach shadow
    floatRoot = floatHost.attachShadow({ mode: 'closed' });

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    floatRoot.appendChild(style);

    // Create button
    floatBtn = document.createElement('div'); // Use div to avoid default button styles
    floatBtn.className = 'chatclaw-float-btn';
    floatBtn.innerHTML = `
      <img src="${chrome.runtime.getURL('icons/chatclaw-icon.png')}" alt="ChatClaw" />
      <span>Ask ChatClaw</span>
    `;

    // Bind events
    floatBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleBtnClick();
    });

    floatRoot.appendChild(floatBtn);

    // Append host to documentElement to avoid body transform issues
    (document.documentElement || document.body).appendChild(floatHost);
  }

  function handleBtnClick() {
    if (!currentSelection) return;

    chrome.runtime.sendMessage({
      action: 'open_sidebar',
      selection: currentSelection
    });

    hideButton();
  }

  function showButton(x, y) {
    if (!isEnabled) return;
    if (!floatHost) createFloatButton();

    if (floatBtn) {
      floatBtn.style.display = 'flex';
      floatBtn.style.top = `${y}px`;
      floatBtn.style.left = `${x}px`;
    }
  }

  function hideButton() {
    if (floatBtn) {
      floatBtn.style.display = 'none';
    }
  }

  document.addEventListener('mouseup', (e) => {
    // Capture mouse coordinates immediately
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Delay slightly to ensure selection is final
    setTimeout(() => {
      const selection = window.getSelection();
      let text = selection.toString().trim();

      // Special handling for Textarea/Input
      // window.getSelection() often doesn't work for textarea content in some contexts
      // or returns the textarea element itself.
      const activeEl = document.activeElement;
      const isFormInput = activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT');

      if (isFormInput) {
        // Try to get text from the input element if window.selection is empty
        // Note: For security/privacy, some browsers limit access to selection in password fields, etc.
        if (!text && activeEl.value) {
          text = activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd).trim();
        }
      }

      if (text.length > 0) {
        currentSelection = text;

        let x, y;

        if (isFormInput) {
          // For inputs/textareas, range.getBoundingClientRect() is unreliable or refers to the box.
          // The most robust user-friendly position is near the mouse cursor (where they finished selecting).
          x = mouseX + 10;
          y = mouseY + 20;
        } else {
          // Standard DOM selection
          try {
            const range = selection.getRangeAt(0);
            const rects = range.getClientRects();
            let rect;

            if (rects.length > 0) {
              rect = rects[rects.length - 1];
            } else {
              rect = range.getBoundingClientRect();
            }

            // Validate rect
            if (rect.width === 0 && rect.height === 0) {
              // Fallback to mouse if rect is invalid
              x = mouseX + 10;
              y = mouseY + 20;
            } else {
              x = rect.right - 40;
              y = rect.bottom + 10;
            }
          } catch (err) {
            // Fallback on error
            x = mouseX + 10;
            y = mouseY + 20;
          }
        }

        // Viewport constraints (shared logic)
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Prevent overflow right
        if (x + 140 > viewportWidth) {
          x = viewportWidth - 150;
        }
        // Prevent overflow left
        if (x < 10) {
          x = 10;
        }

        // Prevent overflow bottom (flip to top)
        if (y + 50 > viewportHeight) {
          // If we used mouse coordinates, just shift up
          if (isFormInput || !y) {
            y = mouseY - 50;
          } else {
            // Try to use rect top if available, else mouse
            y = y - 60; // Approximate flip
          }
        }

        // Prevent overflow top
        if (y < 10) {
          y = 10;
        }

        showButton(x, y);
      } else {
        if (floatHost && floatHost.contains(e.target)) {
          return;
        }
        hideButton();
      }
    }, 10);
  });

  // Hide on scroll or resize
  window.addEventListener('scroll', hideButton, { passive: true, capture: true });
  window.addEventListener('resize', hideButton, { passive: true });

  // Listen for context request
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'collect-basic-context') {
      sendResponse({
        context: {
          title: document.title,
          url: window.location.href,
          selection: window.getSelection().toString()
        }
      });
    }
  });

})();
