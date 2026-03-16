(() => {
  let floatBtn = null;
  let currentSelection = '';

  function createFloatButton() {
    if (floatBtn) return;
    floatBtn = document.createElement('button');
    floatBtn.className = 'chatclaw-float-btn';
    floatBtn.innerHTML = `
      <img src="${chrome.runtime.getURL('icons/chatclaw-icon.png')}" alt="ChatClaw" width="20" height="20" />
      <span>Ask ChatClaw</span>
    `;
    floatBtn.style.display = 'none';
    document.body.appendChild(floatBtn);

    floatBtn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent losing selection
      e.stopPropagation();
      handleBtnClick();
    });
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
    if (!floatBtn) createFloatButton();
    floatBtn.style.display = 'flex';
    floatBtn.style.top = `${y + 10}px`;
    floatBtn.style.left = `${x}px`;
  }

  function hideButton() {
    if (floatBtn) {
      floatBtn.style.display = 'none';
    }
  }

  document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
      currentSelection = text;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Calculate position relative to viewport + scroll
      const x = rect.left + (rect.width / 2) + window.scrollX;
      const y = rect.bottom + window.scrollY;

      showButton(x, y);
    } else {
      // If clicking outside the button, hide it
      if (floatBtn && !floatBtn.contains(e.target)) {
        hideButton();
      }
    }
  });

  // Also hide on scroll or resize
  window.addEventListener('scroll', hideButton, { passive: true });
  window.addEventListener('resize', hideButton, { passive: true });

  // Listen for context request (for Task 1 compatibility)
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
