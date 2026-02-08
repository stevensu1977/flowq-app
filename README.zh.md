# FlowQ - AI 智能体协作工作室

<div align="center">

![FlowQ Logo](src-tauri/icons/icon.png)

基于 Tauri 2.x 构建的强大 AI 智能体协作桌面应用。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.77+-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/tauri-2.x-24c8d8.svg)](https://tauri.app/)

[English](README.md) | [中文](README.zh.md)

</div>

## 功能特性

- **双模式对话**: 在 Chat 模式（直接 LLM 对话）和 Agent 模式（带工具执行）之间切换
- **多模态支持**: 支持发送图片和文本消息，适用于视觉模型
- **多 AI 提供商**: 支持 Anthropic API、AWS Bedrock 和 OpenAI 兼容 API
- **MCP 服务器集成**: 管理和连接 Model Context Protocol 服务器
- **技能系统**: 可扩展的斜杠命令，提升工作效率
- **会话管理**: 基于 SQLite 的持久化存储，支持工作区组织
- **原生桌面应用**: 跨平台支持 macOS、Windows 和 Linux

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    FlowQ 桌面应用                            │
├─────────────────────────────────────────────────────────────┤
│  前端 (React 19 + TypeScript + Vite)                       │
│  ├── 聊天界面 + Markdown 渲染                               │
│  ├── 设置管理 (API, MCP, Skills)                           │
│  └── 主题支持 (亮色/暗色/跟随系统)                          │
├─────────────────────────────────────────────────────────────┤
│  后端 (Rust + Tauri 2.x)                                   │
│  ├── Claude Agent SDK 集成                                 │
│  ├── 多提供商聊天 API (Anthropic/Bedrock/OpenAI)          │
│  ├── SQLite 数据库层                                       │
│  └── MCP 服务器管理                                        │
└─────────────────────────────────────────────────────────────┘
```

## 环境要求

- **Node.js** 18+
- **pnpm**（必须使用，禁止使用 npm）
- **Rust** 1.77+
- **Tauri CLI** 2.x

## 安装

1. 克隆仓库：
   ```bash
   git clone https://github.com/stevensu1977/flowq-app.git
   cd flowq-app
   ```

2. 安装依赖：
   ```bash
   pnpm install
   ```

3. 开发模式运行：
   ```bash
   pnpm tauri:dev
   ```

4. 生产环境构建：
   ```bash
   pnpm tauri:build
   ```

## 配置

### API 提供商

FlowQ 支持多种 AI 提供商：

| 提供商 | 认证方式 | 模型 |
|--------|---------|------|
| Anthropic | API Key | Claude 4, Claude 3.5, Claude 3 |
| AWS Bedrock | AWS Profile / Access Key | 通过 Bedrock 访问 Claude |
| OpenAI 兼容 | API Key | GPT-4, GPT-3.5, 自定义模型 |

在 **设置 > API** 中配置提供商。

### MCP 服务器

添加 MCP 服务器以扩展 Claude 的能力：

1. 进入 **设置 > MCP**
2. 点击 **添加服务器**
3. 配置传输方式（stdio/http）和连接详情

### 技能（Skills）

技能是提供专门功能的斜杠命令：

- `/commit` - 创建格式规范的 git 提交
- `/review` - 代码审查辅助
- 可在 **设置 > Skills** 中添加自定义技能

## 开发

### 命令

```bash
# 仅前端（Vite 开发服务器）
pnpm dev

# 完整 Tauri 开发
pnpm tauri:dev

# 构建前端
pnpm build

# 构建 Tauri 应用
pnpm tauri:build

# 类型检查
pnpm exec tsc --noEmit
```

### 项目结构

```
flowq-app/
├── App.tsx                 # 主 React 组件
├── components/             # React 组件
│   ├── ChatWindow.tsx      # 聊天界面
│   ├── SettingsPage.tsx    # 设置弹窗
│   └── ...
├── lib/
│   ├── tauri-api.ts        # Tauri 命令封装
│   └── session-storage.ts  # 会话文件存储
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Tauri 命令
│   │   ├── chat.rs         # 聊天 API 客户端
│   │   ├── db.rs           # SQLite 数据层
│   │   └── ...
│   └── Cargo.toml
└── package.json
```

## 许可证

MIT License - 详见 [LICENSE](LICENSE)。

## 致谢

- [Tauri](https://tauri.app/) - 桌面应用框架
- [Claude Agent SDK](https://github.com/anthropics/claude-code) - AI 智能体集成
- [React](https://react.dev/) - UI 框架
