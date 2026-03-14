<div align="center">
  <img src="icons/chatclaw-icon.png" alt="ChatClaw Logo" width="128" />
</div>

# ChatClaw Sidebar

**ChatClaw Sidebar** is a modern Chrome extension that acts as a bridge between your browser and your local AI Agent. It provides a persistent, seamless side panel interface for real-time chatting, context sharing, and intelligent workflow automation.

> [!NOTE]
> This extension is designed to connect to a local WebSocket-based AI agent, such as MicroClaw. Ensure your local agent is running to fully utilize the sidebar's capabilities.

## ✨ Features

- **Seamless Sidebar Interface**: A persistent side panel providing uninterrupted access to your AI agent while you browse.
- **Real-time WebSocket Communication**: Low-latency, bidirectional streaming responses using the WebSocket protocol (default: `ws://127.0.0.1:10961/ws`).
- **Multi-Agent Support**: Configure and seamlessly switch between multiple AI agents or models directly from the UI.
- **Context Awareness**: One-click sharing of the current page's URL, title, and selected content to ground your agent's responses.
- **File Analysis**: Attach text-based files (code, logs, documents) directly in the chat for the agent to analyze.
- **Prompt Management**: Save, manage, and quickly reuse frequently used prompts.
- **Real-time Connection Status**: Visual indicators to monitor the health and connectivity of your agent.

## 🚀 Getting Started

### Prerequisites

You need a compatible local AI agent running on your machine. By default, ChatClaw connects to `ws://127.0.0.1:10961/ws`.

### Installation

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the directory containing the extension files.
5. The ChatClaw icon will appear in your browser toolbar. Pin it for easy access.

## 💡 Usage

1. **Launch the Sidebar**: Click the ChatClaw extension icon in your Chrome toolbar to open the side panel.
2. **Configure Connection**: Click the gear icon to open settings. Update the Gateway URL and API Token if your agent requires a custom configuration.
3. **Manage Agents**: Add multiple agents in the settings and use the model selector in the chat header to switch contexts.
4. **Interact**: 
   - Type your message and press `Enter`.
   - Use the **Page Context** button to inject your current tab's context.
   - Use the **Attach** button to upload local files.
   - Access the **Prompts** library for quick commands.

## 🛠️ Architecture

The extension is built using standard web technologies and Chrome Manifest V3:

- `manifest.json`: Defines permissions (`sidePanel`, `activeTab`, `storage`) and extension configuration.
- `background.js`: Service worker handling the extension lifecycle and side panel activation.
- `sidebar.html` / `sidebar.js` / `sidebar.css`: The core application logic, UI, and state management for WebSocket connections and chat history.
- `get-microclaw-token.js`: Helper script for authentication flows.
