# ChatClaw Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance ChatClaw sidebar with context awareness, better prompt management, floating action button, and extended protocol support.

**Architecture:** Chrome Extension (Manifest V3) using vanilla JS/HTML/CSS.
**Tech Stack:** JavaScript, HTML, CSS, Chrome Extension APIs.

---

### Task 1: Context Awareness (High Priority)
**Goal:** Allow users to easily attach current page context to their message.

**Files:**
- Modify: `sidebar.html` (Ensure "🔗" button exists and has correct ID)
- Modify: `sidebar.js` (Implement click handler for "🔗" button)

- [ ] **Step 1: Verify/Add "🔗" button in UI**
  - Check `sidebar.html` for button with `id="add-url-btn"`.
  - Ensure it's visible and styled correctly in `sidebar.css`.

- [ ] **Step 2: Implement `add-url-btn` click handler**
  - In `sidebar.js`, add event listener to `add-url-btn`.
  - Use `chrome.tabs.query` to get active tab title and URL.
  - Format the content: `Title: [Page Title] \nURL: [Page URL]\n\n---\n`.
  - Append to `userInput.value`.

- [ ] **Step 3: Test Context Attachment**
  - Open extension on a page.
  - Click the link button.
  - Verify input field contains formatted link and separator.

### Task 2: Highlight & Floating Button (High Priority)
**Goal:** Enable quick interaction via text selection and floating button.

**Files:**
- Create: `content-script.js` (To handle selection and floating button injection)
- Create: `content-style.css` (For floating button styling)
- Modify: `manifest.json` (Register content script and styles)
- Modify: `background.js` (Handle message from content script to open sidebar)
- Modify: `sidebar.js` (Handle incoming message with selected text)

- [ ] **Step 1: Create Content Script & Styles**
  - `content-script.js`: Listen for `mouseup` event.
  - If selection exists and length > 0, calculate position and show floating button.
  - `content-style.css`: Style for `.chatclaw-float-btn`.

- [ ] **Step 2: Register in Manifest**
  - Add `content_scripts` section to `manifest.json`.
  - Match `<all_urls>`.

- [ ] **Step 3: Implement Floating Button Logic**
  - On button click:
    - Send message to `background.js`: `{action: "open_sidebar", selection: text}`.
    - Remove floating button.

- [ ] **Step 4: Handle Background Message**
  - In `background.js`: Listen for `open_sidebar`.
  - Open side panel `chrome.sidePanel.open` (requires user interaction, which click provides).
  - Store selection in `chrome.storage.local` or pass via runtime message.

- [ ] **Step 5: Sidebar Text Injection**
  - In `sidebar.js`: Check for pending selection data on load or via `chrome.runtime.onMessage`.
  - If data exists, append to input: `Selected Context: \n[Selection]\n\n---\n`.

### Task 3: Optimize Prompt Management (Medium Priority)
**Goal:** Improve Prompts UI and add AI optimization.

**Files:**
- Modify: `sidebar.html` (Update Prompts Modal UI)
- Modify: `sidebar.css` (Match overall theme)
- Modify: `sidebar.js` (Add "Optimize" button logic)

- [ ] **Step 1: UI Overhaul**
  - Refactor `#prompts-modal` in `sidebar.html` to match main UI (colors, spacing).
  - Ensure list items are clearly readable and actionable.

- [ ] **Step 2: Implement "One-Click Optimize"**
  - Add "✨ Optimize" button next to prompt input in the modal.
  - On click, call current AI agent with system prompt: "Optimize this user prompt for better LLM performance: [content]".
  - Update input field with the optimized result.

### Task 4: OpenClaw Agent Support (Medium Priority)
**Goal:** Integrate with OpenClaw Agent protocol.

**Files:**
- Modify: `sidebar.js` (Add connection logic)

- [ ] **Step 1: Define OpenClaw Protocol**
  - Determine API endpoints/WebSocket format for OpenClaw.

- [ ] **Step 2: Add Connection Type**
  - In Settings, add option to select "OpenClaw Agent".
  - Implement handshake/auth logic specific to OpenClaw.

### Task 5: Extended Protocol Support (HTTP+SSE) (Low Priority)
**Goal:** Support standard HTTP+SSE for non-WebSocket agents.

**Files:**
- Modify: `sidebar.js` (Refactor network layer)

- [ ] **Step 1: Abstract Network Layer**
  - Create `NetworkClient` interface (supports `connect`, `send`, `onMessage`).
  - Implement `WebSocketClient` (existing logic).
  - Implement `SSEClient` (using `fetch` + `ReadableStream`).

- [ ] **Step 2: UI for Protocol Selection**
  - Add "Protocol" dropdown in Settings (WebSocket vs HTTP+SSE).
  - Switch client implementation based on selection.
