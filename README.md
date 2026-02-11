# FlowQ

<div align="center">

<img src="src-tauri/icons/icon.png" width="128" height="128" alt="FlowQ">

### Your local AI workspace, in flow.

*Stay focused. Stay local. Stay in flow.*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/tauri-2.x-24c8d8.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)

[English](README.md) | [中文](README.zh.md)

</div>

---

## Why FlowQ?

Stop context-switching. Stop juggling browser tabs. Stop losing your train of thought.

FlowQ brings AI to your desktop—**locally**, **privately**, **instantly**.

One window. One workspace. One flow.

---

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Chat & Agent Modes** | Toggle between direct conversation and tool-powered execution |
| **Multimodal Input** | Text + images in one message |
| **Multi-Provider** | Anthropic API · AWS Bedrock · OpenAI (coming soon) |
| **MCP Servers** | Extend with Model Context Protocol tools |
| **Skills** | Slash commands for common workflows (`/commit`, `/review`) |
| **Memory** | Persistent context across sessions per workspace |

### Data Sources & Integrations

| Category | Items |
|----------|-------|
| **Local Note Apps** | Obsidian · Craft · Logseq · Bear (100% private) |
| **Cloud Integrations** | Notion · GitHub · Google Drive · Slack · Linear |
| **Local Folders** | Direct workspace file access |

### Privacy First

- All data stored locally (SQLite + JSONL)
- API keys secured in system keychain
- No telemetry, no cloud sync
- Works offline (with local models)

---

## Browser Extension

FlowQ includes a Chrome extension for AI-powered browser automation using your existing login sessions.

<div align="center">
<table>
<tr>
<td align="center"><img src="screenshots/chrome-extension.png" width="300" alt="Chrome Extension"><br><em>Extension Popup</em></td>
<td align="center"><img src="screenshots/chrome-extension-wxreader-01.png" width="400" alt="Browser Control Demo"><br><em>AI Browser Control</em></td>
</tr>
</table>
</div>

### Key Benefits

| Feature | Description |
|---------|-------------|
| **Zero Re-auth** | Use already logged-in sessions (GitHub, Notion, Twitter, etc.) |
| **Page Understanding** | AI reads page content via accessibility tree |
| **Browser Control** | Click, type, scroll, navigate programmatically |
| **Real-time Sync** | WebSocket connection with FlowQ desktop |

### Quick Setup

1. Open `chrome://extensions/` and enable **Developer mode**
2. Click **Load unpacked** and select the `flowq-extension` folder
3. Start FlowQ desktop app
4. Click the FlowQ extension icon to verify connection

### Usage

Mention browser tabs in FlowQ using `@#` syntax:

```
@#123   What's on this page?
@#      Click the "Sign In" button
```

For detailed instructions, see [Browser Extension Guide](docs/BROWSER_EXTENSION.md).

---

## Screenshots

<div align="center">

### Workspace Selection
<img src="screenshots/workspace.png" width="600" alt="Workspace Selection">

*Select a workspace to enable Memory and file operations*

### Chat & Agent Modes
<img src="screenshots/chat_agent.png" width="800" alt="Chat and Agent Modes">

*Seamless switching between Chat and Agent modes with sliding toggle*

### Settings

<table>
<tr>
<td align="center"><img src="screenshots/settings-ai.png" width="280" alt="AI Settings"><br><em>AI Provider</em></td>
<td align="center"><img src="screenshots/settings-mcp.png" width="280" alt="MCP Settings"><br><em>MCP Servers</em></td>
<td align="center"><img src="screenshots/settings-skills.png" width="280" alt="Skills Settings"><br><em>Skills</em></td>
</tr>
</table>

</div>

---

## Quick Start

```bash
# Clone
git clone https://github.com/stevensu1977/flowq-app.git
cd flowq-app

# Install (pnpm required)
pnpm install

# Run development
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

### Requirements

- Node.js 18+
- pnpm 8+
- Rust 1.70+
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FlowQ Desktop App                        │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + TypeScript + Vite)                    │
│  ├── Chat Window      - Message rendering, markdown         │
│  ├── Sidebar          - Sessions, filters, navigation       │
│  ├── Settings Panel   - Slide-over configuration            │
│  └── Components       - MCP, Skills, Integrations managers  │
├─────────────────────────────────────────────────────────────┤
│  Backend (Rust + Tauri 2.x)                                 │
│  ├── SQLite           - Session & message persistence       │
│  ├── Claude SDK       - AI model communication              │
│  └── Secure Storage   - API key management                  │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS |
| **Backend** | Rust · Tauri 2.x · SQLite (rusqlite) |
| **AI** | Claude Agent SDK · Anthropic API · AWS Bedrock |
| **Design** | "Ink & Paper" theme · Lora + Inter fonts |

---

## Configuration

### API Providers

FlowQ supports multiple AI providers:

**Anthropic API (Official)**
```
Settings > AI Provider > Anthropic API > Official
```

**Anthropic API (Custom Proxy)**
```
Settings > AI Provider > Anthropic API > Custom
Enter your proxy Base URL
```

**AWS Bedrock**
```
Settings > AI Provider > AWS Bedrock
Configure Region, Access Key, Secret Key
```

### MCP Servers

MCP server configurations are stored in `~/.claude.json`:

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

### Skills

Custom skills are stored in `~/.claude/skills/`. Each skill is a markdown file with a prompt template:

```markdown
# My Custom Skill

Prompt template here with {{variables}}
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [BROWSER_EXTENSION.md](docs/BROWSER_EXTENSION.md) | Browser extension installation and usage guide |
| [ROADMAP.md](docs/ROADMAP.md) | Product roadmap and feature planning |
| [INTEGRATION_PLAN.md](docs/INTEGRATION_PLAN.md) | Third-party integrations architecture |
| [MEMORY_TODO.md](docs/MEMORY_TODO.md) | Memory system implementation plan |
| [UI-Enhanced.md](docs/UI-Enhanced.md) | UI/UX enhancement specifications |

### Coming Soon

- [ ] Full-text search across sessions
- [ ] Session export (Markdown, JSON, PDF)
- [ ] Obsidian vault integration
- [ ] Keyboard shortcuts (`Cmd+K` command palette)
- [ ] Local model support (Ollama, LM Studio)

---

## Contributing

Contributions are welcome! Please read the project's coding standards in [CLAUDE.md](CLAUDE.md).

```bash
# Development
pnpm dev          # Frontend only
pnpm tauri:dev    # Full Tauri app

# Build
pnpm build        # Frontend only
pnpm tauri:build  # Full Tauri app
```

---

## License

MIT

---

<div align="center">

**FlowQ** — *Your local AI workspace, in flow.*

Made with ❤️ for developers who value focus and privacy.

</div>
