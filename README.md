<div align="center">
  <img src="icons/chatclaw-icon.png" alt="ChatClaw Logo" width="128" />
</div>

# ChatClaw Sidebar

**ChatClaw Sidebar** 是一款现代化的 Chrome 浏览器扩展，作为浏览器与本地 AI Agent 之间的桥梁。它提供了一个持久化的侧边栏界面，让你可以进行实时对话、分享网页上下文并实现智能化的工作流自动化。

> [!NOTE]
> 此扩展专为连接本地基于 WebSocket 的 AI Agent（如 MicroClaw）而设计。请确保您的本地 Agent 服务已启动，以充分利用侧边栏的功能。

## ✨ 功能特性

- **无缝侧边栏界面**: 持久化的侧边栏面板，在浏览网页时提供不间断的 AI 辅助。
- **实时 WebSocket 通信**: 采用 WebSocket 协议（默认 `ws://127.0.0.1:10961/ws`），实现低延迟、双向的流式响应。
- **多 Agent 支持**: 在设置中配置多个 AI Agent 或模型，并在界面中无缝切换。
- **上下文感知**: 一键将当前网页的 URL、标题和选中的内容发送给 Agent，提供精准的上下文。
- **文件分析**: 支持在对话中直接附加文本类文件（如代码、日志、文档）供 Agent 分析。
- **提示词管理**: 保存、管理并快速重用常用的提示词（Prompts）。
- **实时连接状态**: 可视化的状态指示灯，实时监控与 Agent 的连接健康度。

## 🛣️ 路线图

ChatClaw 正在快速演进中。以下是接下来的开发计划：

- [x] **智能上下文感知**: 即时将当前网页的标题和 URL 附加到聊天中，提供上下文感知的辅助。
- [x] **悬浮操作按钮**: 在任意网页上选中特定文本即可触发悬浮按钮，快速打开 ChatClaw 并针对选中内容进行讨论。
- [x] **Markdown 渲染**: 支持在聊天中渲染 Markdown 格式的文本，提供更友好的阅读体验。
- [ ] **AI 驱动的提示词优化**: 内置 AI 优化功能，一键润色您的提示词以获得更好的结果。
- [ ] **OpenClaw Agent 集成**: 原生支持 OpenClaw Agent 协议，解锁更高级的 Agent 能力。
- [ ] **扩展协议支持**: 提供更广泛的兼容性，支持 HTTP+SSE 及其他通信协议。

## 🚀 快速开始

### 前置要求

您需要在本地运行一个兼容的 AI Agent。ChatClaw 默认连接到 `ws://127.0.0.1:10961/ws`。

### 安装步骤

1. 克隆或下载本项目代码到本地机器。
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
3. 在页面右上角开启 **开发者模式 (Developer mode)**。
4. 点击 **加载已解压的扩展程序 (Load unpacked)**，选择本项目所在的文件夹。
5. ChatClaw 图标将出现在浏览器工具栏中。建议将其固定以便快速访问。

## 💡 使用指南

1. **打开侧边栏**: 点击 Chrome 工具栏上的 ChatClaw 扩展图标即可打开侧边栏面板。
2. **配置连接**: 点击齿轮图标打开设置。如果您的 Agent 需要自定义配置，请更新网关 URL 和 API Token。
3. **管理 Agent**: 在设置中添加多个 Agent，并通过聊天界面顶部的模型选择器切换上下文。
4. **开始交互**:
   - 输入消息并按 `Enter` 键发送。
   - 使用 **Page Context** 按钮附带当前标签页的上下文。
   - 使用 **Attach** 按钮上传本地文件。
   - 访问 **Prompts** 库以快速调用预设指令。

## 🛠️ 架构说明

该扩展基于标准 Web 技术和 Chrome Manifest V3 构建：

- `manifest.json`: 定义权限（`sidePanel`, `activeTab`, `storage`）和扩展配置。
- `background.js`: Service Worker，负责处理扩展的生命周期和侧边栏的激活。
- `sidebar.html` / `sidebar.js` / `sidebar.css`: 核心应用逻辑、用户界面以及 WebSocket 连接和聊天记录的状态管理。
- `get-microclaw-token.js`: 用于处理身份验证流程的辅助脚本。
