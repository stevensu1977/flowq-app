# FlowQ

<div align="center">

<img src="src-tauri/icons/icon.png" width="128" height="128" alt="FlowQ">

### Your local AI workspace, in flow.

*Stay focused. Stay local. Stay in flow.*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/tauri-2.x-24c8d8.svg)](https://tauri.app/)

[English](README.md) | [中文](README.zh.md)

</div>

---

## Why FlowQ?

Stop context-switching. Stop juggling browser tabs. Stop losing your train of thought.

FlowQ brings AI to your desktop—**locally**, **privately**, **instantly**.

One window. One workspace. One flow.

---

## Features

| | |
|---|---|
| **Chat & Agent Modes** | Direct conversation or tool-powered execution |
| **Multimodal** | Text + images in one message |
| **Multi-Provider** | Anthropic · AWS Bedrock · OpenAI |
| **MCP Servers** | Extend with Model Context Protocol |
| **Skills** | Slash commands for common workflows |
| **Local First** | Your data stays on your machine |

---

## Screenshots

<div align="center">

### Workspace Selection
<img src="screenshots/workspace.png" width="600" alt="Workspace Selection">

*Select a workspace to enable Memory and file operations*

### Chat & Agent Modes
<img src="screenshots/chat_agent.png" width="800" alt="Chat and Agent Modes">

*Seamless switching between Chat and Agent modes*

### Settings

<table>
<tr>
<td align="center"><img src="screenshots/settings-ai.png" width="280" alt="AI Settings"><br><em>AI Providers</em></td>
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

# Run
pnpm tauri:dev
```

---

## Stack

```
Frontend    React 19 · TypeScript · Vite · Tailwind
Backend     Rust · Tauri 2.x · SQLite
AI          Claude Agent SDK · Bedrock · Anthropic API
```

---

## License

MIT
