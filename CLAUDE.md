# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Agent Cowork Studio - 基于 Tauri 2.x 的桌面应用，用于 AI 代理协作。前端使用 React，后端使用 Rust，通过 Claude Agent SDK 与 Claude 集成。

## 开发命令

**包管理器：必须使用 `pnpm`，禁止使用 `npm`**

```bash
# 前端开发（Vite，端口 5273）
pnpm dev

# 完整 Tauri 开发（前端 + Rust 后端）
pnpm tauri:dev

# 仅构建前端
pnpm build

# 构建完整 Tauri 应用
pnpm tauri:build
```

## 架构

### 前端 (React 19 + TypeScript)

```
/
├── App.tsx                 # 主应用组件，会话/工作区状态管理
├── index.tsx               # 入口文件
├── types.ts                # 共享类型定义（ChatSession, Message, API/MCP/Skill 类型）
├── components/             # React 组件
│   ├── ChatWindow.tsx      # 主聊天界面
│   ├── ChatList.tsx        # 虚拟化会话列表（@tanstack/react-virtual）
│   ├── SettingsPage.tsx    # 设置弹窗（APIs, MCP, Skills 等标签页）
│   ├── ApiManager.tsx      # API 提供商配置
│   ├── McpManager.tsx      # MCP 服务器配置
│   ├── SkillsManager.tsx   # Skills/斜杠命令配置
│   ├── MarkdownContent.tsx # Markdown 渲染（支持 Mermaid、KaTeX、代码高亮）
│   └── overlay/            # 模态覆盖层（JSON、代码、终端预览）
├── lib/
│   ├── tauri-api.ts        # Tauri invoke 封装，调用 Rust 命令
│   └── session-storage.ts  # 基于 JSONL 的会话文件存储
└── context/
    └── ThemeContext.tsx    # 主题（亮色/暗色/系统）上下文
```

### 后端 (Rust + Tauri 2.x)

```
src-tauri/
├── src/
│   ├── main.rs             # 入口（调用 lib::run()）
│   ├── lib.rs              # Tauri 命令和应用设置
│   └── db.rs               # SQLite 数据库层（rusqlite）
├── Cargo.toml              # Rust 依赖
├── tauri.conf.json         # Tauri 配置
└── patches/
    └── claude-agent-sdk/   # 打补丁的 SDK（扩展超时时间）
```

### 数据存储

三层存储系统：

1. **SQLite 数据库** (`~/.../app-data/chat_history.db`)
   - sessions 和 messages 表
   - Rust 后端持久化存储
   - 未来支持 FTS5 全文搜索和 sqlite-vec 向量搜索

2. **JSONL 文件** (`{workspace}/.craft-agent/sessions/{id}/session.jsonl`)
   - 每个工作区独立的会话存储
   - 第 1 行：SessionHeader（元数据）
   - 第 2+ 行：StoredMessage 条目

3. **localStorage**（浏览器）
   - UI 设置（主题、权限模式、默认模型）
   - API 提供商、MCP 服务器、Skills 配置

### 前后端通信

通过 `@tauri-apps/api/core` 调用 Tauri 命令：

```typescript
import { invoke } from '@tauri-apps/api/core';
const content = await invoke<string>('read_file', { path: '/some/path' });
```

主要 Tauri 命令（定义在 `lib.rs`）：
- 文件操作：`read_file`, `save_file`, `list_dir`, `create_dir`
- 会话管理：`db_create_session`, `db_get_sessions`, `db_update_session`
- Claude 集成：`send_message`（通过 `session-event` 事件流式传输）
- 工作区：`set_workspace`, `get_workspace`

### 流式事件

Claude 响应通过 Tauri 事件流式传输：

```typescript
import { listen } from '@tauri-apps/api/event';

listen<SessionEvent>('session-event', (e) => {
  // e.payload.event_type: 'text_delta' | 'tool_use' | 'complete' | 'error'
});
```

## 关键模式

### 组件状态管理
- 应用级状态在 `App.tsx`（会话、工作区、过滤器）
- 设置状态在 `SettingsPage.tsx`，通过 localStorage 持久化
- 主题通过 React Context（`ThemeContext`）管理

### 样式
- Tailwind CSS，支持暗色模式（`dark:` 前缀）
- 组件使用 `className` 条件样式

### 类型定义
所有共享类型在 `types.ts`：
- `ChatSession`, `ChatMessage`, `TokenUsage`
- `ApiProvider`, `McpServer`, `Skill`
- `SessionStatus`, `SessionLabel`

## 环境变量

- Claude SDK 使用 Bedrock：`CLAUDE_CODE_USE_BEDROCK=true`（在 lib.rs 中设置）
- Gemini API 密钥：`GEMINI_API_KEY`（在 vite.config.ts 中使用）

## 待完成功能

- 斜杠命令实现（`/settings`, `/history`）
- 权限审批后端集成
- 会话分享/下载/导出
- 本地文件夹导航
- MCP 服务器实际连接逻辑
- API 密钥验证功能
