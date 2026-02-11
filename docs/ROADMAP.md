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

### Slash Commands (`/`) — Implementation Suggestions

**Built-in Commands:**

| Command | Action | Notes |
|---------|--------|-------|
| `/settings` | Open settings panel | Optional: `/settings providers` to open specific tab |
| `/clear` | Clear current session messages | Keep session metadata, only clear chat history |
| `/history` | Show session history panel | Jump to ChatList or open search |
| `/new` | Create new session | Same as Cmd+N |
| `/help` | Show available commands | Display command palette with descriptions |
| `/model <name>` | Switch model | e.g., `/model claude-3-opus` |
| `/mode <chat\|agent>` | Switch between Chat/Agent mode | Quick mode toggle |
| `/export` | Export current session | Trigger export dialog |

**Custom Skills Execution:**

Skills from `~/.claude/skills/` should be invokable as `/skill-name`. For example:
- `/commit` → Load `~/.claude/skills/commit/SKILL.md` and execute
- `/review-pr` → Load `~/.claude/skills/review-pr/SKILL.md` and execute

**Implementation Approach:**

1. **Command Registry** — Central registry mapping command names to handlers
2. **Autocomplete** — Show matching commands as user types `/`
3. **Parameter Parsing** — Support commands with arguments: `/model claude-3-opus`
4. **Skill Loading** — When command matches a skill name, inject SKILL.md into system prompt and send the user's message

### Mentions (`@`) — Implementation Suggestions

**Built-in Mention Types:**

| Mention | Description | Example |
|---------|-------------|---------|
| `@claude` | Use Anthropic Claude | Route to configured Anthropic API |
| `@bedrock` | Use AWS Bedrock Claude | Route to configured Bedrock endpoint |
| `@gpt` | Use OpenAI GPT | Route to configured OpenAI API |
| `@file:path` | Include file content | `@file:src/main.rs` injects file |
| `@folder:path` | Include folder structure | `@folder:src/` lists directory tree |
| `@url:link` | Fetch and include URL content | `@url:https://...` fetches page |
| `@skill:name` | Invoke skill context | `@skill:commit` loads skill prompt |

**Model Routing Architecture:**

```
User Input: "@claude Explain this code @file:main.rs"
                ↓
         Parse Mentions
                ↓
    ┌───────────────────────┐
    │ Model: claude         │
    │ Files: [main.rs]      │
    │ Message: "Explain..." │
    └───────────────────────┘
                ↓
      Route to Anthropic API
```

**Multi-Model Scenarios:**

1. **Single mention** — Route entire message to that model
2. **No mention** — Use session's default model
3. **Mixed mentions** — Primary model processes, others as context
4. **Comparison mode** — `@claude vs @gpt: Which approach is better?` → Send to both, show side-by-side

**Implementation Approach:**

1. **Mention Parser** — Regex-based extraction: `@(\w+)(?::([^\s]+))?`
2. **Type Detection** — Determine if mention is model, file, or skill
3. **Context Injection** — Files/skills become part of message context
4. **Router** — Based on detected model, select API endpoint
5. **Fallback** — If mentioned model not configured, show warning

**UI/UX Considerations:**

- **Autocomplete popup** — Show suggestions after `@` keystroke
- **Syntax highlighting** — Color mentions differently in input
- **Preview badges** — Show resolved mentions as chips/badges
- **File picker** — `@file:` triggers file browser
- **Validation** — Check file exists, model configured before send

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
