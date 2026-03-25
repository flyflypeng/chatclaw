<div align="center">
  <img src="public/icons/chatclaw-icon.png" alt="ChatClaw Logo" width="128" />
</div>

# ChatClaw Chrome Extension

**ChatClaw** is a modern Chrome extension that bridges your browser and AI Agents. It provides a persistent side panel so you can chat in real time, attach web context, and complete intelligent tasks without leaving the page.

> [!NOTE]
> This extension requires an Agent backend that supports WebSocket (such as [MicroClaw](https://github.com/microclaw/microclaw) and [OpenClaw](https://github.com/openclaw/openclaw)).
> If your Agent service runs on the same machine as your browser, you can use a `ws://` address (for example, `ws://127.0.0.1:18789`).
> If your Agent service runs on a different machine, use a TLS-secured `wss://` address (for example, `wss://127.0.0.1:18789`).

## ✨ Features

- **Seamless Side Panel**: A persistent panel that keeps AI assistance available while browsing.
- **Real-time WebSocket Communication**: Low-latency, bidirectional streaming responses.
- **Multi-Agent Support**: Configure multiple Agents and switch between them quickly.
- **Fast Context Capture**: One-click attachment of current page URL, title, and selected text.
- **File Analysis**: Upload text-based files (code, logs, docs) for Agent analysis.
- **Prompt Management**: Save, search, and reuse prompts with `/<prompt-name>` shortcuts.
- **Connection Status Indicator**: Instantly view connection health with status dots.

## 🛣️ Roadmap

ChatClaw is evolving rapidly. Here's what's coming next:

- [x] **Smart Context Awareness**: Attach current page title and URL instantly for grounded responses.
- [x] **Floating Action Button**: Trigger Ask ChatClaw from selected text on any webpage.
- [x] **Markdown Rendering**: Better readability for structured responses.
- [x] **OpenClaw Integration**: Native support for the OpenClaw protocol.
- [x] **One-click Response Copy**: Copy Agent outputs as Markdown.
- [ ] **MicroClaw High-Risk Tool Execution Confirmation**: Prompt for confirmation before executing high-risk tools.
- [ ] **AI-Powered Prompt Optimization**: Built-in prompt refinement tools.
- [ ] **One-click File Upload for Analysis**: Faster attachment and analysis workflows.
- [ ] **Frontend Observability for Tool Calls/Skill Activation**: Visualize Agent execution progress.

## 🚀 Getting Started

### Prerequisites

> [!IMPORTANT]
> This extension supports OpenClaw Agent and MicroClaw Agent services. Before starting, ensure your WS/WSS endpoint is reachable.

### Installation

#### Install from Chrome Web Store

1. Visit [ChatClaw Chrome Web Store page](https://chrome.google.com/webstore/detail/chatclaw/...).
2. Click **Add to Chrome** and confirm the installation.

#### Developer Mode

1. Clone or download this repository to your local machine.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select this project folder.
5. The ChatClaw icon appears in your toolbar. Pin it for quick access.

## 💡 Usage

> [!TIP]
> For first-time setup, follow this order: `Open sidebar → Configure Agent → Test connection → Send your first message`.

### 1) Open the Sidebar

- Click the **ChatClaw icon** in the Chrome toolbar to open the side panel.
- When you see the status dot and **Session History** button at the top, you're in the main UI.

Screenshot (Header):

![Header](resources/siderbar-header.png)

### 2) Configure Agent (Settings icon)

Click **Settings (slider-style icon)** in the toolbar to open Agent settings. Each Agent card supports:

- **Agent Name**: Label shown in the model selector (for example, `OpenClaw-Prod`, `MicroClaw-Local`).
- **Agent Gateway URL**: Use `ws://` or `wss://`.
- **Auth Token**: Fill if your service requires authentication.
- **Protocol**: `Auto-detect` / `OpenClaw` / `MicroClaw`.
- **Show model thought (`thought`)**: Toggle when needed.
- **Save**: Save current Agent card configuration.
- **Test Connection**: Validate connectivity immediately.

Screenshot (Agent card):

![Agent card](resources/agent-card.png)

> [!IMPORTANT]
> If your Agent service is not on the same machine as your browser, use `wss://` for secure transport.

### 3) Manage Multiple Agents (Model Switch)

- Click **`+`** at the bottom of settings to add a new Agent.
- Click the **model pill button (`⚡ Name`)** in the composer toolbar to switch current Agent.
- After switching, ChatClaw reconnects with that Agent's config and loads the corresponding context.

Screenshot (Footer toolbar):

![Footer toolbar](resources/sidebar-footer.png)

### 4) Send Messages

- Type your message and press **Enter** to send.
- Use **Shift + Enter** for a new line.
- You can also click the send button (paper plane icon).

Example:

![Send message](resources/send-message.png)

### 5) Add Page Context (`🔗`)

Click **`🔗 Add current page info`** to auto-insert current page title and URL into the input box.

Inserted example:

```text
Page Title: Chrome Extensions - sidePanel
URL: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
---
Summarize this page in 5 sentences.
```

Click `🔗` again to deactivate page-context mode.

### 6) Attach Local Files (`📎`)

- Click **`📎 Attach`** and select a local text file (code, logs, or docs).
- The file content is included as context in the current prompt.

Example prompt:

```text
This is my error log. Please identify the root cause and provide a fix plan.
```

### 7) Use Prompt Library (`📝` + `/` shortcut)

- Click **`📝 Prompt Management`** to create, search, and edit saved prompts.
- Type `/` in the input box to quickly search and insert saved prompts.

Example:

![Prompt example](resources/prompt-example.png)

### 8) Ask from Selected Text (Ask ChatClaw)

- Select text on any webpage and the **Ask ChatClaw** floating button appears.
- Click it to open the sidebar automatically and insert selected text into input.
- If needed, disable this behavior in settings: **Enable text-selection popup (Ask ChatClaw)**.

Inserted example:

![Selection capture](resources/capture-feature.png)

### 9) Session Management (History / New)

- **Session History (`≡`)** at top-right: browse and switch previous sessions.
- **New Session (`➕`)** at bottom-right: start a clean conversation quickly.

### 10) How to Read Connection Status

- Status dot meanings:
  - Gray: disconnected or unavailable
  - Green: connected
- If no response after sending, check in order:
  1. Is your Agent service running?
  2. Is the gateway reachable (`ws://` / `wss://`)?
  3. Is your token correct?
  4. Does **Test Connection** pass in settings?

## 🛠️ Architecture

The extension is built using standard web technologies and Chrome Manifest V3:

- `manifest.json`: Defines permissions (`sidePanel`, `activeTab`, `storage`) and extension configuration.
- `background.js`: Service worker handling the extension lifecycle and side panel activation.
- `sidebar.html` / `sidebar.js` / `sidebar.css`: Core UI, WebSocket communication, and session state management.
