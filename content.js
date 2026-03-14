/**
 * OpenClaw Context Bridge — Content Script
 * Handles page context extraction.
 */

(() => {
  'use strict';

  // Prevent double injection
  if (window.__openclawContextBridge) return;
  window.__openclawContextBridge = true;

  // ─── Page Context ────────────────────────────────────────────────

  function getPageContext() {
    return {
      url: location.href,
      title: document.title,
      selection: window.getSelection()?.toString()?.trim() || '',
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || '',
        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
        ogDescription: document.querySelector('meta[property="og:description"]')?.content || ''
      }
    };
  }

  function getFullPageContext() {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const links = Array.from(document.querySelectorAll('a[href]'))
      .slice(0, 100)
      .map(anchor => ({
        text: (anchor.textContent || '').trim().slice(0, 140),
        href: anchor.href
      }));

    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .slice(0, 50)
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);

    const forms = Array.from(document.querySelectorAll('form'))
      .slice(0, 20)
      .map((form, index) => ({
        index,
        action: form.action || '',
        method: (form.method || 'get').toUpperCase(),
        fields: Array.from(form.querySelectorAll('input, textarea, select'))
          .slice(0, 50)
          .map(field => ({
            name: field.name || '',
            type: field.type || field.tagName.toLowerCase(),
            placeholder: field.placeholder || ''
          }))
      }));

    return {
      ...getPageContext(),
      fullText: text.slice(0, 40000),
      headings,
      links,
      forms
    };
  }

  // Listen for messages from the extension (sidebar/background)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'collect-full-context') {
      sendResponse({ context: getFullPageContext() });
    } else if (msg.type === 'collect-basic-context') {
      sendResponse({ context: getPageContext() });
    }
    // Return true to indicate async response (if needed in future)
    return false; 
  });

})();
