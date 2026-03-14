# MicroClaw Context Bridge

**MicroClaw Context Bridge** is a Chrome extension that acts as a bridge between your browser and the [MicroClaw](https://github.com/microclaw/microclaw) AI Agent. It provides a modern sidebar interface for chatting with your local AI agent, sharing page context, and automating workflows.

## Features

- **Sidebar Interface**: A persistent side panel for seamless interaction with the agent.
- **HTTP SSE Support**: Real-time streaming responses from the MicroClaw Agent using Server-Sent Events.
- **Context Awareness**: One-click sharing of current page URL, title, and content.
- **File Attachments**: Upload text-based files (code, logs, documents) for the agent to analyze.
- **Prompt Library**: Save and manage frequently used prompts for quick access.
- **Configurable**: Custom HTTP endpoint and API token support.
- **Connection Status**: Real-time health check and status indicator.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked** and select the directory of this project.
5.  The MicroClaw icon should appear in your browser toolbar.

## Usage

1.  **Start MicroClaw Agent**: Ensure your MicroClaw Agent is running (default: `http://localhost:18789`).
2.  **Open Sidebar**: Click the extension icon in the Chrome toolbar to open the side panel.
3.  **Configure**: If your agent runs on a different port or requires a token, click the **Settings** (gear icon) to configure.
4.  **Chat**: Type your message and hit Enter.
    -   Use the **Page Context** button to include the current tab's info.
    -   Use the **Attach** button to send file contents.
    -   Use the **Prompts** button to access saved commands.

## Development

-   `manifest.json`: Extension configuration (Manifest V3).
-   `sidebar.html/js/css`: The main UI logic and styling.
-   `background.js`: Service worker handling extension lifecycle.

## License

MIT
