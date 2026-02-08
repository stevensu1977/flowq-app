# FlowQ - AI Agent Cowork Studio

<div align="center">

![FlowQ Logo](src-tauri/icons/icon.png)

A powerful desktop application for AI agent collaboration, built with Tauri 2.x.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.77+-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/tauri-2.x-24c8d8.svg)](https://tauri.app/)

[English](README.md) | [中文](README.zh.md)

</div>

## Features

- **Dual Mode Chat**: Switch between Chat mode (direct LLM conversation) and Agent mode (with tool execution)
- **Multimodal Support**: Send images along with text messages for vision-capable models
- **Multiple AI Providers**: Support for Anthropic API, AWS Bedrock, and OpenAI-compatible APIs
- **MCP Server Integration**: Manage and connect to Model Context Protocol servers
- **Skills System**: Extensible slash commands for enhanced productivity
- **Session Management**: SQLite-based persistent storage with workspace organization
- **Native Desktop App**: Cross-platform support for macOS, Windows, and Linux

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FlowQ Desktop App                        │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + TypeScript + Vite)                   │
│  ├── Chat Interface with Markdown rendering                │
│  ├── Settings Management (API, MCP, Skills)                │
│  └── Theme Support (Light/Dark/System)                     │
├─────────────────────────────────────────────────────────────┤
│  Backend (Rust + Tauri 2.x)                                │
│  ├── Claude Agent SDK Integration                          │
│  ├── Multi-provider Chat API (Anthropic/Bedrock/OpenAI)   │
│  ├── SQLite Database Layer                                 │
│  └── MCP Server Management                                 │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 18+
- **pnpm** (required, do not use npm)
- **Rust** 1.77+
- **Tauri CLI** 2.x

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/stevensu1977/flowq-app.git
   cd flowq-app
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run in development mode:
   ```bash
   pnpm tauri:dev
   ```

4. Build for production:
   ```bash
   pnpm tauri:build
   ```

## Configuration

### API Providers

FlowQ supports multiple AI providers:

| Provider | Authentication | Models |
|----------|---------------|--------|
| Anthropic | API Key | Claude 4, Claude 3.5, Claude 3 |
| AWS Bedrock | AWS Profile / Access Key | Claude models via Bedrock |
| OpenAI Compatible | API Key | GPT-4, GPT-3.5, custom models |

Configure providers in **Settings > API**.

### MCP Servers

Add MCP servers to extend Claude's capabilities:

1. Go to **Settings > MCP**
2. Click **Add Server**
3. Configure transport (stdio/http) and connection details

### Skills

Skills are slash commands that provide specialized functionality:

- `/commit` - Create well-formatted git commits
- `/review` - Code review assistance
- Custom skills can be added in **Settings > Skills**

## Development

### Commands

```bash
# Frontend only (Vite dev server)
pnpm dev

# Full Tauri development
pnpm tauri:dev

# Build frontend
pnpm build

# Build Tauri app
pnpm tauri:build

# Type check
pnpm exec tsc --noEmit
```

### Project Structure

```
flowq-app/
├── App.tsx                 # Main React component
├── components/             # React components
│   ├── ChatWindow.tsx      # Chat interface
│   ├── SettingsPage.tsx    # Settings modal
│   └── ...
├── lib/
│   ├── tauri-api.ts        # Tauri command wrappers
│   └── session-storage.ts  # Session file storage
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Tauri commands
│   │   ├── chat.rs         # Chat API client
│   │   ├── db.rs           # SQLite layer
│   │   └── ...
│   └── Cargo.toml
└── package.json
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - Desktop app framework
- [Claude Agent SDK](https://github.com/anthropics/claude-code) - AI agent integration
- [React](https://react.dev/) - UI framework
