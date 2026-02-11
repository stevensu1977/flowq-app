# FlowQ UI Enhancement Recommendations

> **Design Philosophy**: *"Zen Productivity"* — A refined, calm aesthetic that reduces cognitive load while maintaining powerful functionality. The interface should feel like a serene workspace that keeps you in flow.

---

## Executive Summary

FlowQ's current UI is functional but falls into common patterns that make it feel generic. This document proposes a distinctive visual identity that embodies the product's core promise: **"Stay focused. Stay local. Stay in flow."**

### Current State Assessment

| Aspect | Current | Issue |
|--------|---------|-------|
| Typography | System fonts / generic sans-serif | Lacks character and hierarchy |
| Color Palette | Standard gray/indigo/purple | Overused AI app aesthetic |
| Spacing | Uniform, predictable | No visual rhythm or breathing room |
| Motion | Minimal transitions | Missed opportunity for delight |
| Visual Identity | Generic SaaS look | Nothing memorable or distinctive |

---

## 1. Typography System

### Problem
The current UI uses generic system fonts that blend into every other productivity app.

### Recommendation: "Medium-Style Editorial" ✅ IMPLEMENTED

```css
/* Implemented Font Stack - Medium Style */
:root {
  /* Display: Serif for headers (like Medium) */
  --font-display: 'Lora', Georgia, serif;

  /* Body: Serif for content text (similar to Charter used by Medium) */
  --font-body: 'Lora', Georgia, serif;

  /* UI: Clean sans-serif for interface elements (similar to Sohne) */
  --font-ui: 'Inter', system-ui, sans-serif;

  /* Mono: For code, technical elements */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### Specific Changes

| Element | Current | Proposed |
|---------|---------|----------|
| App Title "FlowQ" | Sans-serif, regular | Lora, 700 weight, letter-spacing: -0.02em |
| Section Headers | Generic bold | Lora, 700 weight, -0.02em tracking |
| Chat Messages | System font | Lora (serif), 400 weight, 1.72 line-height |
| UI Elements | System font | Inter (sans-serif) for buttons, inputs |
| Code Blocks | Default mono | JetBrains Mono with ligatures enabled |
| Mode Labels (Agent/Chat) | Small caps style | Inter for UI consistency |

### Typography Scale
```css
--text-xs: 0.75rem;    /* 12px - Timestamps, meta */
--text-sm: 0.875rem;   /* 14px - Secondary text */
--text-base: 1rem;     /* 16px - Body text */
--text-lg: 1.125rem;   /* 18px - Emphasized body */
--text-xl: 1.25rem;    /* 20px - Section titles */
--text-2xl: 1.5rem;    /* 24px - Page titles */
--text-3xl: 2rem;      /* 32px - Hero elements */
```

---

## 2. Color System

### Problem
Current palette (gray + indigo/purple) is the default "AI app" aesthetic used by Claude.ai, ChatGPT, and countless others.

### Recommendation: "Ink & Paper" Theme

A sophisticated, calming palette inspired by quality stationery and Japanese minimalism.

```css
:root {
  /* Light Mode - "Morning Paper" */
  --surface-primary: #FEFDFB;      /* Warm off-white, like quality paper */
  --surface-secondary: #F7F5F2;    /* Subtle cream */
  --surface-elevated: #FFFFFF;     /* Pure white for cards */

  --ink-primary: #1A1918;          /* Rich black, not harsh */
  --ink-secondary: #5C5856;        /* Warm gray */
  --ink-tertiary: #9C9894;         /* Soft gray */

  --accent-primary: #2D5A4A;       /* Deep forest green - calm, focused */
  --accent-secondary: #D4A574;     /* Warm bronze - for highlights */
  --accent-danger: #A65D57;        /* Muted terracotta */
  --accent-success: #4A7C59;       /* Sage green */

  /* Semantic */
  --agent-mode: #2D5A4A;           /* Forest green for Agent */
  --chat-mode: #5B6B7C;            /* Slate blue for Chat */
  --memory-indicator: #8B7355;     /* Warm brown for Memory */
}

:root.dark {
  /* Dark Mode - "Midnight Study" */
  --surface-primary: #141312;      /* Deep charcoal */
  --surface-secondary: #1C1B19;    /* Slightly lighter */
  --surface-elevated: #252321;     /* Card surfaces */

  --ink-primary: #E8E6E3;          /* Warm white */
  --ink-secondary: #A8A5A0;        /* Muted */
  --ink-tertiary: #6B6863;         /* Subtle */

  --accent-primary: #5BA67D;       /* Softer green */
  --accent-secondary: #D4A574;     /* Bronze stays warm */
}
```

### Color Application Guidelines

| Element | Current | Proposed |
|---------|---------|----------|
| Sidebar Background | Gray-100 / Gray-800 | `--surface-secondary` with subtle grain texture |
| Active Item | Indigo highlight | `--accent-primary` with 10% opacity background |
| Primary Buttons | Indigo/Purple gradient | Solid `--accent-primary` with subtle hover lift |
| Mode Selector | Green/Gray pills | `--agent-mode` / `--chat-mode` with soft shadows |
| Memory Badge | Purple/Indigo | `--memory-indicator` with subtle pulse animation |

---

## 3. Spatial Composition & Layout

### Problem
Current layout is predictable with uniform spacing. No visual hierarchy or breathing room.

### Recommendation: "Asymmetric Harmony"

#### Sidebar Redesign
```
Current:           Proposed:
┌─────────────┐    ┌───────────────┐
│ New Chat    │    │               │
├─────────────┤    │   F L O W Q   │  ← Centered logo with breathing room
│ All Chats   │    │               │
│ Flagged     │    ├───────────────┤
│ Status  ▼   │    │ + New Session │  ← Larger tap target, centered
│ Labels  ▼   │    │               │
├─────────────┤    │ CONVERSATIONS │  ← Section label, uppercase, small
│ APIs        │    │  All Chats    │
│ MCPs        │    │  Flagged      │
│ Local...    │    │  Status ▼     │
├─────────────┤    │  Labels ▼     │
│ Skills      │    │               │
│ Settings    │    │ SOURCES       │  ← Data integrations
│ Dark Mode   │    │  Integrations │  ← REST APIs (Jina, Google, etc.)
└─────────────┘    │  Local Folders│
                   │               │
                   │ TOOLS         │  ← AI capabilities
                   │  MCP Servers  │
                   │  Skills       │
                   │               │
                   ├───────────────┤
                   │ ⚙ Settings    │  ← Bottom-pinned, minimal
                   └───────────────┘
```

#### Chat Window Layout
```css
/* Generous spacing for readability */
.chat-container {
  max-width: 720px;          /* Optimal reading width */
  margin: 0 auto;
  padding: 3rem 2rem;        /* More breathing room */
}

.message {
  margin-bottom: 2.5rem;     /* Clear separation between turns */
}

.message-content {
  line-height: 1.75;         /* Comfortable reading */
  letter-spacing: 0.01em;
}
```

#### Grid Breaking Elements

Add visual interest with occasional asymmetry:

```
┌────────────────────────────────────────────┐
│                                            │
│     ┌────────────────────────────┐         │
│     │  User Message              │         │  ← Right-aligned user messages
│     └────────────────────────────┘         │
│                                            │
│  ┌─────────────────────────────────────┐   │
│  │  AI Response                        │   │  ← Full-width AI responses
│  │                                     │   │
│  │  • Bullet point                     │   │
│  │  • Another point                    │   │
│  │                                     │   │
│  │  ┌─────────────────────────────┐    │   │
│  │  │  Code Block                 │    │   │  ← Indented code blocks
│  │  │  with slight left margin    │    │   │
│  │  └─────────────────────────────┘    │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                            │
└────────────────────────────────────────────┘
```

---

## 4. Visual Textures & Backgrounds

### Problem
Flat, solid colors feel sterile and cold.

### Recommendation: Add Subtle Atmosphere

#### Paper Grain Texture
```css
.sidebar,
.surface-secondary {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-blend-mode: soft-light;
  background-size: 200px;
}

/* Light mode: very subtle */
.light .sidebar { opacity: 0.03; }

/* Dark mode: slightly more visible */
.dark .sidebar { opacity: 0.05; }
```

#### Subtle Gradient Overlays
```css
/* Add depth to the chat area */
.chat-window::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(
    180deg,
    var(--surface-primary) 0%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 1;
}
```

#### Decorative Elements

```css
/* Subtle top border accent on cards */
.card {
  border-top: 2px solid transparent;
  background-image: linear-gradient(
    var(--surface-elevated),
    var(--surface-elevated)
  ),
  linear-gradient(
    90deg,
    var(--accent-primary),
    var(--accent-secondary)
  );
  background-origin: border-box;
  background-clip: padding-box, border-box;
}
```

---

## 5. Motion & Micro-interactions

### Problem
Static UI lacks life and feedback.

### Recommendation: "Purposeful Motion"

#### Core Animation Principles
1. **Entrance**: Elements fade in with subtle upward drift (not slide)
2. **Feedback**: Buttons have soft press states, not harsh color changes
3. **Transitions**: Use ease-out curves for natural deceleration
4. **Duration**: Keep interactions under 200ms for snappiness

#### Key Animations

```css
/* Page load stagger */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sidebar-item {
  animation: fadeInUp 0.3s ease-out;
  animation-fill-mode: both;
}

.sidebar-item:nth-child(1) { animation-delay: 0.05s; }
.sidebar-item:nth-child(2) { animation-delay: 0.1s; }
.sidebar-item:nth-child(3) { animation-delay: 0.15s; }
/* ... staggered delays */
```

```css
/* Message appearance */
@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.message-new {
  animation: messageIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
```

```css
/* Button press effect */
.button {
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}

.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.button:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

```css
/* Memory indicator pulse */
@keyframes memoryPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.memory-badge {
  animation: memoryPulse 2s ease-in-out infinite;
}
```

#### Streaming Text Animation
```css
/* Typewriter cursor for streaming responses */
.streaming-cursor::after {
  content: '▋';
  animation: blink 0.8s step-end infinite;
  color: var(--accent-primary);
}

@keyframes blink {
  50% { opacity: 0; }
}
```

---

## 6. Component-Specific Recommendations

### 6.1 Workspace Selection Modal

**Current**: Generic card with folder icon
**Proposed**: Full-bleed hero moment

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                                                         │
│                    ┌─────────┐                          │
│                    │  ◉  ◉   │                          │
│                    │   ◡    │  ← Friendly illustration  │
│                    └─────────┘     instead of icon      │
│                                                         │
│              Welcome to FlowQ                           │
│                                                         │
│         Choose a workspace to begin your                │
│              focused work session                       │
│                                                         │
│         ┌─────────────────────────────┐                 │
│         │    📁  Select Directory      │                 │
│         └─────────────────────────────┘                 │
│                                                         │
│         ┌─────────────────────────────┐                 │
│         │    Recent: ~/projects/app    │  ← Quick       │
│         └─────────────────────────────┘    access       │
│                                                         │
│              Skip for now →                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Chat Mode Selector

**Current**: Dropdown with checkbox-style selection
**Proposed**: Elegant toggle with clear visual states

```
Current:                    Proposed:
┌──────────────────┐        ┌────────────────────────────┐
│ ▼ Agent Mode    │        │  Agent ●────────○ Chat     │
│   ✓ Agent       │        └────────────────────────────┘
│     Chat        │
└──────────────────┘        With smooth sliding indicator
                            and mode-specific color accent
```

### 6.3 Message Input Area

**Current**: Standard textarea with attachment button
**Proposed**: Refined composition area

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │  What would you like to work on?                  │  │  ← Placeholder
│  │                                                   │  │    as question
│  │                                                   │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  📎 Attach   │   @ Mention   │   / Command   │ ➤  │  │  ← Visible
│  └───────────────────────────────────────────────────┘  │    affordances
│                                                         │
│  Memory enabled • Agent mode • claude-sonnet-4          │  ← Context line
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 6.4 Settings Panel

**Current**: Modal with tab navigation
**Proposed**: Slide-over panel from right

```
                              ┌──────────────────────────┐
                              │         Settings         │
                              │                     ╳    │
                              ├──────────────────────────┤
                              │                          │
                              │  ┌────────────────────┐  │
                              │  │ General            │  │
                              │  ├────────────────────┤  │
                              │  │ API Keys        →  │  │
                              │  ├────────────────────┤  │
                              │  │ MCP Servers     →  │  │
                              │  ├────────────────────┤  │
                              │  │ Skills          →  │  │
                              │  └────────────────────┘  │
                              │                          │
                              │  ─────────────────────── │
                              │                          │
                              │  Theme                   │
                              │  ○ Light  ● Dark  ○ Auto │
                              │                          │
                              └──────────────────────────┘

Slides in from right with backdrop blur on main content
```

### 6.5 Session List Items

**Current**: Simple list with hover states
**Proposed**: Rich preview cards

```
┌────────────────────────────────────────┐
│                                        │
│  New Conversation                      │  ← Title
│  Empty conversation                    │  ← Preview text, truncated
│                                        │
│  ○ Active   •   2:09 PM   •   Agent    │  ← Status, time, mode badges
│                                        │
└────────────────────────────────────────┘

Hover state: subtle left border accent appears
```

---

## 7. Empty States & Onboarding

### Problem
Current empty state is minimal and doesn't guide users.

### Recommendation: Warm, Helpful Empty States

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                         ◡                               │
│                        (  )                             │  ← Friendly
│                        ─┴─                              │    illustration
│                                                         │
│                 Ready when you are                      │
│                                                         │
│         Start typing, or try one of these:             │
│                                                         │
│    ┌─────────────────┐  ┌─────────────────┐            │
│    │ "Help me write  │  │ "Review this    │            │
│    │  a function..." │  │  code..."       │            │
│    └─────────────────┘  └─────────────────┘            │
│                                                         │
│    ┌─────────────────┐  ┌─────────────────┐            │
│    │ "Explain how    │  │ "Debug this     │            │
│    │  this works..." │  │  error..."      │            │
│    └─────────────────┘  └─────────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Dark Mode Refinements

### Problem
Dark mode often feels like inverted light mode.

### Recommendation: Purpose-Built Dark Theme

```css
/* Dark mode should feel like a different experience */
.dark {
  /* Reduce contrast slightly for eye comfort */
  --ink-primary: #E0DED9;  /* Not pure white */

  /* Subtle color temperature shift - warmer */
  --surface-primary: #161514;

  /* Accent colors need adjustment for dark backgrounds */
  --accent-primary: #6BB891;  /* Brighter green */

  /* Shadows become glows in dark mode */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);

  /* Borders become more prominent */
  --border-subtle: rgba(255, 255, 255, 0.06);
}
```

---

## 9. Accessibility Considerations

All aesthetic changes must maintain accessibility:

| Requirement | Implementation |
|-------------|----------------|
| Color contrast | All text meets WCAG AA (4.5:1 minimum) |
| Focus states | Visible focus rings using accent color |
| Motion | Respect `prefers-reduced-motion` |
| Font sizes | Minimum 14px for body text |
| Touch targets | Minimum 44x44px for interactive elements |

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Sidebar Reorganization: Sources & Tools

### Conceptual Clarification

The sidebar should clearly separate **data sources** from **capabilities/tools**:

| Category | Purpose | Items |
|----------|---------|-------|
| **AI Providers** | Generate AI responses | Anthropic, OpenAI, Bedrock (Settings > APIs) |
| **Sources** | Provide data/context | Integrations (REST APIs), Local Folders |
| **Tools** | Extend AI capabilities | MCP Servers, Skills |

### Proposed Sidebar Structure

```
┌─────────────────────────────────────┐
│                                     │
│  SOURCES                            │  ← Data integration
│  ─────────────────────              │
│  🔗 Integrations                    │  ← REST APIs (Jina, Google, Slack)
│  📁 Local Folders                   │  ← Workspace files
│                                     │
│  TOOLS                              │  ← Capabilities
│  ─────────────────────              │
│  🔌 MCP Servers                     │  ← Model Context Protocol
│  ⚡ Skills                          │  ← Slash commands
│                                     │
└─────────────────────────────────────┘
```

### Why This Structure?

1. **Sources** = Where data comes FROM
   - **Integrations**: External APIs that provide data (search, email, docs)
   - **Local Folders**: Local filesystem for file context

2. **Tools** = What AI can DO
   - **MCP Servers**: Protocol-based tool servers (read/write files, execute commands)
   - **Skills**: Predefined command workflows (/commit, /review, /explain)

### Source Types

#### Integrations (`type: 'integration'`)
- REST APIs that provide data (search, retrieval, actions)
- Examples: Jina (web search), Google APIs (Gmail, Drive, Calendar), Slack, Linear
- Support OAuth, Bearer, API Key, Basic auth
- Auto-converted to MCP tools for AI consumption

#### Local Folders (`type: 'local'`)
- Workspace folder access for file context
- Watch for file changes (optional)
- Application integrations (future)

### Tool Types

#### MCP Servers (`type: 'mcp'`)
- Model Context Protocol servers providing tools
- Transport: HTTP/SSE (remote) or stdio (local subprocess)
- Direct tool integration

#### Skills
- Predefined slash command workflows
- User-configurable prompt templates
- Quick actions like /commit, /review, /explain

---

### Proposed: "Source Connections" Design

A card-based layout showing individual integrations with connection status.

```
┌───────────────────────────────────────┐
│                                       │
│  SOURCES                              │
│  ─────────────────────                │
│                                       │
│  INTEGRATIONS                         │
│  ┌─────────────────────────────────┐  │
│  │ 🔍 Jina Search          ◉ Ready │  │  ← Individual integration card
│  │   Web search & content retrieval│  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ 📧 Gmail               ⚠ Auth   │  │  ← Needs authentication
│  │   Email access & search         │  │
│  └─────────────────────────────────┘  │
│                                       │
│  LOCAL                                │
│  ┌─────────────────────────────────┐  │
│  │ 📁 Workspace           ◉ Active │  │
│  │   ~/projects/flowq-app          │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │       + Add Integration         │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ─────────────────────────────────────│
│                                       │
│  TOOLS                                │
│  ─────────────────────                │
│                                       │
│  MCP SERVERS                          │
│  ┌─────────────────────────────────┐  │
│  │ 🔌 Filesystem          ◉ Conn.  │  │
│  │   stdio://localhost             │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ 🌐 GitHub MCP          ○ Disc.  │  │
│  │   https://mcp.github.com        │  │
│  └─────────────────────────────────┘  │
│                                       │
│  SKILLS                               │
│  ┌─────────────────────────────────┐  │
│  │ ⚡ /commit             Built-in │  │
│  │   Create a git commit           │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ ⚡ /review              Custom  │  │
│  │   Code review workflow          │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │       + Add Tool                │  │
│  └─────────────────────────────────┘  │
│                                       │
└───────────────────────────────────────┘
```

### Card Specifications

#### Source/Tool Card Structure
```tsx
interface SourceCardProps {
  id: string;                           // Unique identifier
  name: string;                         // Display name (e.g., "Jina Search")
  category: 'source' | 'tool';          // Which section
  type: 'integration' | 'local' | 'mcp' | 'skill'; // Item type
  icon?: string;                        // Emoji or icon URL
  tagline: string;                      // Short description
  status: ConnectionStatus;
  url?: string;                         // Endpoint URL
  path?: string;                        // File path (for local)
  isBuiltin?: boolean;                  // For built-in skills
}

type ConnectionStatus =
  | 'connected'    // ◉ Ready/Connected - fully operational
  | 'needs_auth'   // ⚠ Auth Required - needs OAuth or API key
  | 'failed'       // ✕ Error - connection failed
  | 'disconnected' // ○ Disconnected - not connected
  | 'untested';    // ? Unknown - never tested
```

#### Visual Status Indicators

| Status | Icon | Color | Label |
|--------|------|-------|-------|
| `connected` | `◉` | `--success` (#4A7C59) | Ready / Connected |
| `needs_auth` | `⚠` | `--accent-secondary` (#D4A574) | Auth Required |
| `failed` | `✕` | `--danger` (#A65D57) | Error |
| `disconnected` | `○` | `--muted-foreground` | Disconnected |
| `untested` | `?` | `--muted-foreground` | Unknown |

#### Card CSS
```css
.source-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.source-card:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, var(--card));
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.source-card-icon {
  font-size: 20px;
  line-height: 1;
}

.source-card-content {
  flex: 1;
  min-width: 0;
}

.source-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.source-card-tagline {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-card-status {
  font-size: 11px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}
```

### Type Section Headers

```css
.source-type-header {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
  padding: 8px 0 4px 0;
  margin-top: 8px;
}

.source-type-header:first-child {
  margin-top: 0;
}
```

### Interaction States

#### Empty State (No sources of type)
```
┌─────────────────────────────────┐
│  API                            │
│  ┌─────────────────────────┐    │
│  │  No API sources yet      │    │
│  │  ┌───────────────────┐   │    │
│  │  │  + Add API Source │   │    │
│  │  └───────────────────┘   │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

#### Hover Actions (Revealed on hover)
```
┌─────────────────────────────────────┐
│ 🔍 Jina Search      [⟳] [⚙] [✕]  │  ← Refresh, Configure, Remove
│   Web search & retrieval    ◉ Ready│
└─────────────────────────────────────┘
```

#### Authentication Flow
When clicking a source with `needs_auth` status:
1. Show OAuth popup or API key input modal
2. On success: Update status to `connected`
3. On failure: Update status to `failed` with error message

### Pre-configured Templates

#### Add Integration Dialog
Popular integrations with one-click setup:

```
┌─────────────────────────────────────┐
│  + Add Integration                  │
│  ─────────────────────              │
│                                     │
│  Popular                            │
│  ┌─────────┐ ┌─────────┐ ┌────────┐│
│  │ 🔍 Jina │ │ 📧 Gmail │ │🗂 Slack││
│  └─────────┘ └─────────┘ └────────┘│
│  ┌─────────┐ ┌─────────┐ ┌────────┐│
│  │📄 Notion│ │📊 Linear│ │ 📁 Drive││
│  └─────────┘ └─────────┘ └────────┘│
│                                     │
│  Or                                 │
│  ┌─────────────────────────────┐   │
│  │  Custom REST API            │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### Add Tool Dialog
```
┌─────────────────────────────────────┐
│  + Add Tool                         │
│  ─────────────────────              │
│                                     │
│  MCP Server                         │
│  ┌─────────────────────────────┐   │
│  │  HTTP/SSE Server            │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  Local Subprocess (stdio)   │   │
│  └─────────────────────────────┘   │
│                                     │
│  Skill                              │
│  ┌─────────────────────────────┐   │
│  │  Create Custom Skill        │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

### Animation Details

#### Card Entrance (Staggered by type)
```css
@keyframes sourceCardIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.source-card {
  animation: sourceCardIn 0.3s ease-out backwards;
}

/* Stagger within each type section */
.source-type-section .source-card:nth-child(1) { animation-delay: 0.05s; }
.source-type-section .source-card:nth-child(2) { animation-delay: 0.1s; }
.source-type-section .source-card:nth-child(3) { animation-delay: 0.15s; }
```

#### Status Change Animation
```css
@keyframes statusChange {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.source-card-status.status-changed {
  animation: statusChange 0.3s ease-out;
}
```

### Dark Mode Adjustments
```css
.dark .source-card {
  background: var(--card);
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.dark .source-card:hover {
  border-color: var(--accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.02),
    0 4px 16px rgba(0, 0, 0, 0.3);
}
```

### Data Model

```typescript
// Source: Data integration (Integrations, Local Folders)
interface SourceConfig {
  id: string;                      // Unique identifier
  name: string;                    // Display name
  slug: string;                    // URL-safe identifier
  enabled: boolean;                // Active in current session
  type: 'integration' | 'local';   // Source type
  provider?: string;               // e.g., "jina", "google", "slack"
  icon?: string;                   // Emoji or URL
  tagline?: string;                // Short description

  // Type-specific config
  integration?: {
    baseUrl: string;
    authType: 'bearer' | 'header' | 'query' | 'basic' | 'oauth' | 'none';
    endpoints?: ApiEndpoint[];
  };
  local?: {
    path: string;
    watchChanges?: boolean;
  };

  // Connection state
  connectionStatus: ConnectionStatus;
  connectionError?: string;
  lastConnected?: number;
}

// Tool: AI capability (MCP Servers, Skills)
interface ToolConfig {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  type: 'mcp' | 'skill';
  icon?: string;
  tagline?: string;

  // Type-specific config
  mcp?: {
    transport: 'http' | 'sse' | 'stdio';
    url?: string;                  // For HTTP/SSE
    command?: string;              // For stdio
    args?: string[];
  };
  skill?: {
    prompt: string;                // Skill prompt template
    isBuiltin?: boolean;           // Built-in vs custom
  };

  // Connection state (for MCP)
  connectionStatus?: ConnectionStatus;
  connectionError?: string;
}
```

### Implementation Notes

1. **Workspace Scoping**: Sources and Tools are scoped per workspace
2. **Credential Management**: Use secure storage for API keys/tokens
3. **OAuth Flows**: Support Google, Slack, Microsoft OAuth providers
4. **Tool Conversion**: Integrations auto-converted to MCP tools for AI use

### Migration from Current UI

The current sidebar items should be remapped:

**Current → New Structure:**
```
SOURCES (old)              →    SOURCES (new)
├── APIs (AI providers)    →    Move to Settings > Model Providers
├── MCPs                   →    Move to TOOLS > MCP Servers
└── Local Folders          →    Keep as SOURCES > Local Folders

                           →    SOURCES (new)
                           →    ├── Integrations (NEW - REST APIs)
                           →    └── Local Folders

                           →    TOOLS (new)
                           →    ├── MCP Servers
                           →    └── Skills (moved from separate item)
```

---

## 11. Implementation Priority

### Phase 1: Quick Wins (Low Effort, High Impact) ✅ COMPLETED
1. ✅ Typography: Medium-style fonts (Lora + Inter + JetBrains Mono)
2. ✅ Color: Updated CSS variables to "Ink & Paper" palette
3. ✅ Spacing: Improved line-height (1.72 for content)
4. ✅ Buttons: Added hover lift effect with shadows

### Phase 2: Core Components ✅ COMPLETED
1. ✅ Redesign mode selector as toggle (sliding indicator, mode-specific colors)
2. ✅ Improve message input area (visible affordances: Attach, @Mention, /Command; context line)
3. ✅ Add message animations (messageIn animation, streaming cursor)
4. ✅ Refine empty states (friendly illustration, suggested prompts grid)

### Phase 3: Polish ✅ COMPLETED
1. ✅ Add paper grain texture (SVG noise texture on sidebar and surfaces)
2. ✅ Implement sidebar stagger animations (sidebarFadeIn with staggered delays)
3. ✅ Dark mode refinements (card glow, border refinements, input focus glow)
4. ✅ Settings panel slide-over (slide-in-right animation with backdrop blur)

### Phase 4: Delight
1. Custom illustrations for empty states
2. ✅ Streaming text cursor (implemented in Phase 2)
3. ✅ Memory pulse animation (implemented in Phase 2)
4. Seasonal theme variations (optional)

### Phase 5: Enhanced Components
1. Sidebar reorganization (see Section 10)
   - **SOURCES**: Integrations (REST APIs), Local Folders
   - **TOOLS**: MCP Servers, Skills
   - Move AI Providers to Settings > Model Providers
   - Individual cards with connection status
   - OAuth authentication flows for Integrations
2. Session list rich preview cards
3. Quick switcher (`Cmd+P`) with fuzzy search
4. Context indicators (token usage, context window)

---

## Visual Reference: Before & After

### Before (Current)
- Generic gray/white surfaces
- Standard indigo/purple accents
- System fonts
- Uniform spacing
- Static interactions

### After (Proposed)
- Warm paper-like surfaces with subtle texture
- Distinguished forest green + bronze accent system
- Editorial typography with character
- Rhythmic spacing with clear hierarchy
- Purposeful, delightful micro-interactions

---

## 12. Settings Tab Optimization: General vs Model Providers

### Current Problem Analysis

**General Tab** 当前包含：
1. **Default Model** - 从预定义的 DEFAULT_MODELS 列表选择
2. **Preferences** 开关：
   - Auto-save conversations
   - Show line numbers
   - Confirm before delete

**Model Providers Tab** 当前包含：
1. **Provider Selection** - Anthropic API 或 AWS Bedrock
2. **Provider-specific Settings**:
   - API Key / Access Key
   - Base URL / Region
   - **Model** (自定义输入)
3. Save API Settings 按钮

### 重叠问题

| 设置项 | General | Model Providers | 问题 |
|--------|---------|-----------------|------|
| **Model 选择** | ✅ 预定义列表 | ✅ 自定义输入 | **功能重叠，用户困惑** |
| Provider 配置 | ❌ | ✅ | 清晰 |
| 应用偏好 | ✅ | ❌ | 清晰 |

**核心问题**：
1. 用户不清楚两个 "Model" 设置的关系
2. 不清楚哪个设置优先级更高
3. General 的 "Default Model" 概念与 Provider 的 "Model" 混淆

### 优化方案

#### 方案 A：合并模型设置到 Model Providers ⭐ **推荐**

**原则**：所有模型相关配置集中在一处

```
Settings Tabs (Optimized):
├── General (改名为 "Preferences")
│   ├── Auto-save conversations
│   ├── Show line numbers
│   └── Confirm before delete
│
├── Model Providers (保持名称)
│   ├── Provider Selection
│   │   ├── Anthropic API
│   │   └── AWS Bedrock
│   ├── Provider Settings (API Key, Region, etc.)
│   └── Default Model ← 移入这里
│       ├── Preset Models (Quick Select)
│       │   ├── Claude Sonnet 4
│       │   ├── Claude Opus 4
│       │   └── Claude Haiku
│       └── Custom Model ID (Advanced)
│
└── ... (其他标签保持不变)
```

**UI 设计**：
```
┌─────────────────────────────────────────────────────┐
│ Model Providers                                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│ PROVIDER                                            │
│ ┌───────────────┐ ┌───────────────┐                │
│ │  Anthropic    │ │  AWS Bedrock  │                │
│ │  API          │ │               │                │
│ └───────────────┘ └───────────────┘                │
│                                                     │
│ ─────────────────────────────────────               │
│                                                     │
│ DEFAULT MODEL                          ← 新增区域   │
│                                                     │
│ Quick Select                                        │
│ ┌─────────────────────────────────────────────────┐│
│ │ ◉ Claude Sonnet 4                    Recommended││
│ │   Balanced speed and intelligence               ││
│ └─────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────┐│
│ │ ○ Claude Opus 4                                 ││
│ │   Most capable, best for complex tasks          ││
│ └─────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────┐│
│ │ ○ Claude Haiku                                  ││
│ │   Fast and efficient                            ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ Custom Model ID (optional)                          │
│ ┌─────────────────────────────────────────────────┐│
│ │ claude-sonnet-4-20250514                        ││
│ └─────────────────────────────────────────────────┘│
│ ⓘ Override the quick select with a specific model │
│                                                     │
│ ─────────────────────────────────────               │
│                                                     │
│ API SETTINGS                                        │
│ (existing API Key, Base URL fields...)              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**优点**：
- 模型设置集中，消除歧义
- 用户一眼明白 Provider 和 Model 的关系
- General 变成纯粹的应用偏好设置

**缺点**：
- Model Providers 页面变长

---

#### 方案 B：重命名并明确职责

保持分离，但通过命名消除歧义：

```
Settings Tabs:
├── Preferences (原 General)
│   └── 应用行为设置 (无模型相关)
│
├── AI Configuration (原 Model Providers)
│   ├── Provider & Credentials
│   └── Model Selection
│       ├── Quick Select
│       └── Custom Override
```

---

#### 方案 C：添加智能关联

保持当前结构，但添加视觉关联：

- General 的 Default Model 显示当前 Provider 名称
- Model Providers 的 Model 输入框显示 "Overrides General setting"
- 添加 "linked" 图标表示两者关系

**不推荐**：增加复杂度，不如直接合并

---

### 推荐实施：方案 A

#### 步骤 1：重命名 General → Preferences
```tsx
// TABS 配置修改
{ id: 'preferences', label: 'Preferences', icon: Settings }
```

#### 步骤 2：移除 General 中的 Default Model
```tsx
// 删除 DEFAULT_MODELS 选择器
// 只保留 Preferences 开关
```

#### 步骤 3：在 Model Providers 中添加模型选择区
```tsx
// 在 Provider Selection 和 API Settings 之间插入
<div className="space-y-4">
  <h3>Default Model</h3>
  {/* Quick Select 预设模型 */}
  {/* Custom Model ID 输入框 */}
</div>
```

#### 步骤 4：更新状态管理
```tsx
// localApiSettings 添加 defaultModel 字段
// 或创建独立的 modelSettings 状态
```

### 数据模型更新

```typescript
// 当前
interface SettingsState {
  permissionMode: PermissionMode;
  defaultModel: string;  // ← 移除
  autoSave: boolean;
  showLineNumbers: boolean;
  confirmDelete: boolean;
}

// 优化后
interface SettingsState {
  permissionMode: PermissionMode;
  // defaultModel 移到 ApiSettings
  autoSave: boolean;
  showLineNumbers: boolean;
  confirmDelete: boolean;
}

interface ApiSettings {
  provider: 'anthropic' | 'bedrock';
  defaultModel: string;        // ← 新增：预设选择
  customModelId?: string;      // ← 新增：自定义覆盖
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  // ... 其他字段
}
```

### 迁移考虑

- 如果用户已在 General 设置了 defaultModel，迁移到新结构
- localStorage 键名保持兼容或提供迁移逻辑

---

## Conclusion

These recommendations aim to transform FlowQ from a functional productivity tool into a **memorable experience** that users genuinely enjoy using. The "Ink & Paper" aesthetic creates a calm, focused environment that aligns perfectly with the product's promise of helping users stay in flow.

The key is **restraint with intention** — not adding visual complexity for its own sake, but making every design decision reinforce the core value proposition of focused, local, private productivity.

---

*Document created: February 2025*
*Design system version: 2.0 (proposed)*
