# FlowQ

<div align="center">

![FlowQ](src-tauri/icons/icon.png)

### Your local AI workspace, in flow.

*专注。本地。心流。*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/tauri-2.x-24c8d8.svg)](https://tauri.app/)

[English](README.md) | [中文](README.zh.md)

</div>

---

## 为什么选择 FlowQ？

不再在多个网页间切换。不再被打断思路。不再丢失上下文。

FlowQ 将 AI 带到你的桌面——**本地运行**，**数据私密**，**即时响应**。

一个窗口。一个工作区。一种心流。

---

## 功能特性

| | |
|---|---|
| **Chat & Agent 双模式** | 直接对话或带工具执行 |
| **多模态** | 文本 + 图片一起发送 |
| **多提供商** | Anthropic · AWS Bedrock · OpenAI |
| **MCP 服务器** | 通过 Model Context Protocol 扩展能力 |
| **技能系统** | 斜杠命令快速执行工作流 |
| **本地优先** | 数据留在你的设备上 |

---

## 快速开始

```bash
# 克隆
git clone https://github.com/stevensu1977/flowq-app.git
cd flowq-app

# 安装依赖（必须使用 pnpm）
pnpm install

# 运行
pnpm tauri:dev
```

---

## 技术栈

```
前端    React 19 · TypeScript · Vite · Tailwind
后端    Rust · Tauri 2.x · SQLite
AI      Claude Agent SDK · Bedrock · Anthropic API
```

---

## 许可证

MIT
