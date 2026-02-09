# FlowQ Roadmap

> Your local AI workspace, in flow.

This document outlines the development roadmap for FlowQ. Features are organized by milestone versions, with status indicators showing current progress.

**Legend:** ✅ Complete | 🚧 In Progress | 📋 Planned

---

## v0.1 — Foundation (Current)

The initial release establishes core functionality.

| Feature | Status | Description |
|---------|--------|-------------|
| Chat Mode | ✅ | Direct conversation with AI models |
| Agent Mode | ✅ | Tool-powered execution with Claude Agent SDK |
| Session Management | ✅ | Create, rename, delete, persist sessions |
| Multi-Provider | ✅ | Anthropic, AWS Bedrock, OpenAI support |
| Workspace Selection | ✅ | Folder-scoped sessions |
| MCP Configuration | ✅ | UI for managing MCP servers |
| Skills Configuration | ✅ | Custom slash commands setup |
| Theme Support | ✅ | Light / Dark / System themes |
| Multimodal Input | ✅ | Text + image messages |
| Markdown Rendering | ✅ | Code highlighting, Mermaid, KaTeX |

---

## v0.2 — Core Completion

Polish existing features and complete partial implementations.

| Feature | Status | Description |
|---------|--------|-------------|
| Slash Commands | 🚧 | Execute `/settings`, `/history`, `/clear` |
| Custom Skills Execution | 📋 | Run user-defined skill prompts |
| Permission Backend | 📋 | Approve/deny tool execution requests |
| Model Mentions | 📋 | Route messages via `@claude`, `@gpt` syntax |

> **Note:** MCP servers are managed by Claude Code CLI in Agent mode. FlowQ provides configuration UI (`~/.claude.json`), while the CLI handles server lifecycle and tool discovery.

---

## v0.3 — Flow Enhancement

Reduce friction and improve daily workflow.

| Feature | Status | Description |
|---------|--------|-------------|
| Keyboard Shortcuts | 📋 | `Cmd+N`, `Cmd+K`, `Cmd+/`, `Cmd+Enter` |
| Session Search | 📋 | Full-text search across all sessions |
| Quick Switcher | 📋 | `Cmd+P` to jump between sessions |
| Context Indicators | 📋 | Real-time token usage display |
| Session Pinning | 📋 | Pin important sessions to top |

---

## v1.0 — Data Portability

Complete data ownership and portability features.

| Feature | Status | Description |
|---------|--------|-------------|
| Export to Markdown | 📋 | Download session as `.md` file |
| Export to JSON | 📋 | Full session data export |
| Import Sessions | 📋 | Import from ChatGPT, Claude.ai exports |
| Local Backup | 📋 | Scheduled workspace backups |

---

## Future Considerations

These features are under consideration for post-1.0 releases:

- **Multi-Agent Workflows** — Chain agents for complex tasks
- **Local Model Support** — Ollama, LM Studio integration
- **Plugin System** — User-installable skill extensions
- **Voice Input** — Speech-to-text for hands-free operation

---

## Architecture

FlowQ offers two distinct modes:

| Mode | Backend | Tools | MCP | Use Case |
|------|---------|-------|-----|----------|
| **Chat** | Direct API (Anthropic/Bedrock/OpenAI) | ❌ | ❌ | Fast, lightweight conversations |
| **Agent** | Claude Agent SDK → Claude Code CLI | ✅ | ✅ | Tool execution, file operations |

MCP servers configured in FlowQ are stored in `~/.claude.json` and automatically loaded by Claude Code CLI when using Agent mode.

---

## Design Principles

FlowQ development follows these principles:

1. **Local First** — Your data stays on your machine
2. **Privacy by Design** — No telemetry, no cloud sync
3. **Minimal Friction** — Every interaction should feel instant
4. **Focused Experience** — One window, one flow

---

## Contributing

We welcome contributions! Here's how to help:

- **Bug Reports** — Open an issue with reproduction steps
- **Feature Requests** — Discuss in GitHub Discussions first
- **Pull Requests** — Fork, branch, and submit PRs against `main`

See the [README](../README.md) for development setup instructions.

---

*Last updated: February 2025*
