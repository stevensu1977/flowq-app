# FlowQ

<div align="center">

<img src="src-tauri/icons/icon.png" width="128" height="128" alt="FlowQ">

### Your local AI workspace, in flow.

*专注。本地。心流。*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/tauri-2.x-24c8d8.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)

[English](README.md) | [中文](README.zh.md)

</div>

---

## 为什么选择 FlowQ？

不再在多个网页间切换。不再被打断思路。不再丢失上下文。

FlowQ 将 AI 带到你的桌面——**本地运行**，**数据私密**，**即时响应**。

一个窗口。一个工作区。一种心流。

---

## 功能特性

### 核心能力

| 功能 | 描述 |
|------|------|
| **Chat & Agent 双模式** | 直接对话或带工具执行，一键切换 |
| **多模态输入** | 文本 + 图片一起发送 |
| **多提供商** | Anthropic API · AWS Bedrock · OpenAI（即将支持） |
| **MCP 服务器** | 通过 Model Context Protocol 扩展能力 |
| **技能系统** | 斜杠命令快速执行工作流（`/commit`、`/review`） |
| **记忆系统** | 每个工作区的持久化上下文 |

### 数据源 & 集成

| 类别 | 支持项 |
|------|--------|
| **本地笔记应用** | Obsidian · Craft · Logseq · Bear（100% 私密） |
| **云端集成** | Notion · GitHub · Google Drive · Slack · Linear |
| **本地文件夹** | 直接访问工作区文件 |

### 隐私优先

- 所有数据本地存储（SQLite + JSONL）
- API 密钥存储在系统钥匙串中
- 无遥测，无云同步
- 支持离线使用（配合本地模型）

---

## 截图预览

<div align="center">

### 工作区选择
<img src="screenshots/workspace.png" width="600" alt="工作区选择">

*选择一个工作区以启用记忆和文件操作*

### Chat & Agent 模式
<img src="screenshots/chat_agent.png" width="800" alt="Chat 和 Agent 模式">

*通过滑动开关无缝切换 Chat 和 Agent 模式*

### 设置界面

<table>
<tr>
<td align="center"><img src="screenshots/settings-ai.png" width="280" alt="AI 设置"><br><em>AI 提供商</em></td>
<td align="center"><img src="screenshots/settings-mcp.png" width="280" alt="MCP 设置"><br><em>MCP 服务器</em></td>
<td align="center"><img src="screenshots/settings-skills.png" width="280" alt="技能设置"><br><em>技能管理</em></td>
</tr>
</table>

</div>

---

## 快速开始

```bash
# 克隆
git clone https://github.com/stevensu1977/flowq-app.git
cd flowq-app

# 安装依赖（必须使用 pnpm）
pnpm install

# 运行开发环境
pnpm tauri:dev

# 构建生产版本
pnpm tauri:build
```

### 环境要求

- Node.js 18+
- pnpm 8+
- Rust 1.70+
- [Tauri 环境依赖](https://tauri.app/v1/guides/getting-started/prerequisites)

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     FlowQ 桌面应用                            │
├─────────────────────────────────────────────────────────────┤
│  前端 (React 19 + TypeScript + Vite)                        │
│  ├── Chat Window      - 消息渲染、Markdown 支持              │
│  ├── Sidebar          - 会话列表、筛选、导航                  │
│  ├── Settings Panel   - 侧滑配置面板                         │
│  └── Components       - MCP、Skills、集成管理器              │
├─────────────────────────────────────────────────────────────┤
│  后端 (Rust + Tauri 2.x)                                    │
│  ├── SQLite           - 会话 & 消息持久化                    │
│  ├── Claude SDK       - AI 模型通信                          │
│  └── Secure Storage   - API 密钥管理                         │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19 · TypeScript · Vite · Tailwind CSS |
| **后端** | Rust · Tauri 2.x · SQLite (rusqlite) |
| **AI** | Claude Agent SDK · Anthropic API · AWS Bedrock |
| **设计** | "水墨纸张" 主题 · Lora + Inter 字体 |

---

## 配置

### API 提供商

FlowQ 支持多种 AI 提供商：

**Anthropic API（官方）**
```
设置 > AI 提供商 > Anthropic API > 官方
```

**Anthropic API（自定义代理）**
```
设置 > AI 提供商 > Anthropic API > 自定义
输入代理的 Base URL
```

**AWS Bedrock**
```
设置 > AI 提供商 > AWS Bedrock
配置 Region、Access Key、Secret Key
```

### MCP 服务器

MCP 服务器配置存储在 `~/.claude.json`：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/folder"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"]
    }
  }
}
```

### 技能

自定义技能存储在 `~/.claude/skills/`。每个技能是一个包含提示模板的 Markdown 文件：

```markdown
# 我的自定义技能

提示模板，支持 {{变量}}
```

---

## 文档

| 文档 | 描述 |
|------|------|
| [ROADMAP.md](docs/ROADMAP.md) | 产品路线图和功能规划 |
| [INTEGRATION_PLAN.md](docs/INTEGRATION_PLAN.md) | 第三方集成架构设计 |
| [MEMORY_TODO.md](docs/MEMORY_TODO.md) | 记忆系统实现计划 |
| [UI-Enhanced.md](docs/UI-Enhanced.md) | UI/UX 增强规格说明 |

### 即将推出

- [ ] 全文搜索（跨会话）
- [ ] 会话导出（Markdown、JSON、PDF）
- [ ] Obsidian 库集成
- [ ] 快捷键支持（`Cmd+K` 命令面板）
- [ ] 本地模型支持（Ollama、LM Studio）

---

## 参与贡献

欢迎贡献！请阅读 [CLAUDE.md](CLAUDE.md) 了解项目编码规范。

```bash
# 开发
pnpm dev          # 仅前端
pnpm tauri:dev    # 完整 Tauri 应用

# 构建
pnpm build        # 仅前端
pnpm tauri:build  # 完整 Tauri 应用
```

---

## 许可证

MIT

---

<div align="center">

**FlowQ** — *Your local AI workspace, in flow.*

为重视专注和隐私的开发者打造 ❤️

</div>
