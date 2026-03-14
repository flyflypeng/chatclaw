# MicroClaw Context Bridge (中文文档)

**MicroClaw Context Bridge** 是一个 Chrome 浏览器扩展，作为浏览器与 [MicroClaw](https://github.com/microclaw/microclaw) AI Agent 之间的桥梁。它提供了一个现代化的侧边栏界面，让你可以与本地 AI Agent 实时对话、分享网页上下文并自动化工作流。

## 功能特性

- **侧边栏界面**: 持久化的侧边栏面板，提供无缝的交互体验。
- **HTTP SSE 支持**: 通过 Server-Sent Events 支持 MicroClaw Agent 的实时流式响应。
- **上下文感知**: 一键发送当前网页的 URL、标题和正文内容给 Agent。
- **文件附件**: 支持上传文本类文件（代码、日志、文档）供 Agent 分析。
- **提示词库**: 保存和管理常用提示词，支持快速调用。
- **灵活配置**: 支持自定义 HTTP 服务地址和 API Token。
- **连接状态**: 实时健康检查与状态指示灯。

## 安装步骤

1.  克隆或下载本项目代码。
2.  打开 Chrome 浏览器，访问 `chrome://extensions/`。
3.  在右上角开启 **开发者模式 (Developer mode)**。
4.  点击 **加载已解压的扩展程序 (Load unpacked)**，选择本项目所在的文件夹。
5.  MicroClaw 图标将出现在浏览器工具栏中。

## 使用指南

1.  **启动 MicroClaw Agent**: 确保你的本地 Agent 服务已启动（默认地址: `http://localhost:18789`）。
2.  **打开侧边栏**: 点击 Chrome 工具栏上的扩展图标即可打开侧边栏。
3.  **配置连接**: 如果 Agent 运行在不同端口或需要 Token，点击右上角的 **设置 (Settings)** 图标进行配置。
4.  **开始对话**: 输入消息并回车。
    -   点击 **Page Context** 按钮附带当前网页信息。
    -   点击 **Attach** 按钮上传文件内容。
    -   点击 **Prompts** 按钮使用预存指令。

## 开发说明

-   `manifest.json`: 扩展配置文件 (Manifest V3)。
-   `sidebar.html/js/css`: 主要的 UI 逻辑与样式。
-   `background.js`: Service worker，处理扩展生命周期。

## 许可证

MIT
