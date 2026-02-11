# FlowQ Browser Extension

The FlowQ Browser Extension enables AI-powered browser automation using your existing login sessions. Unlike traditional web scrapers, FlowQ can interact with authenticated pages (GitHub, Notion, Twitter, etc.) without requiring you to re-login.

## Features

- **Zero Re-authentication**: Uses your already logged-in browser sessions
- **Page Snapshots**: Extracts accessibility tree and text content for AI understanding
- **Browser Control**: Click, type, scroll, and navigate pages programmatically
- **Real-time Communication**: WebSocket connection with FlowQ desktop app

## Installation

### Step 1: Locate the Extension

The extension is located in the `flowq-extension` folder of this repository:

```
flowq-app/
└── flowq-extension/
    ├── manifest.json
    ├── background.js
    ├── popup.html
    ├── popup.js
    └── icons/
```

### Step 2: Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `flowq-extension` folder from this repository

### Step 3: Verify Installation

After loading, you should see:
- **FlowQ Browser Relay** in your extensions list
- The FlowQ icon in your browser toolbar (you may need to pin it)

### Step 4: Connect to FlowQ

1. Start the FlowQ desktop application
2. Click the FlowQ extension icon in Chrome
3. The status should show **Connected to FlowQ** (green dot)

If disconnected, ensure FlowQ is running and click **Reconnect**.

## Architecture

```
FlowQ Desktop App
      │
      │ WebSocket (ws://127.0.0.1:18799)
      │ HTTP API  (http://127.0.0.1:18800)
      ▼
┌─────────────────────────────────┐
│   FlowQ Browser Relay Extension │
│   ┌───────────────────────────┐ │
│   │    background.js          │ │
│   │    (Service Worker)       │ │
│   │                           │ │
│   │  • WebSocket client       │ │
│   │  • CDP command execution  │ │
│   │  • Tab management         │ │
│   └───────────────────────────┘ │
└─────────────────────────────────┘
      │
      │ Chrome Debugger API (CDP)
      ▼
┌─────────────────────────────────┐
│   Your Browser Tabs             │
│   (with existing login state)   │
└─────────────────────────────────┘
```

## Usage in FlowQ

### Mentioning Browser Tabs

In FlowQ, use the `@#` syntax to reference browser tabs:

```
@#123   # Reference tab by ID
@#      # Reference current active tab
```

When you mention a browser tab, FlowQ will:
1. Attach to the tab (shows Chrome debugger warning)
2. Extract page content and accessibility tree
3. Provide this context to the AI for interaction

### Example Interactions

**Read page content:**
```
@#123 What are the main topics discussed on this page?
```

**Navigate and extract:**
```
@#123 Click on the "Settings" link and tell me what options are available.
```

**Fill forms:**
```
@#123 Fill in the search box with "FlowQ" and press enter.
```

## Supported Commands

| Action | Description |
|--------|-------------|
| `ping` | Health check |
| `list_tabs` | Get all open tabs |
| `open` | Open a new tab |
| `close` | Close a tab |
| `attach` | Attach debugger to tab |
| `detach` | Detach from tab |
| `snapshot` | Get page accessibility tree + text content |
| `evaluate` | Execute JavaScript |
| `click` | Click element by selector |
| `type` | Type text into input |
| `scroll` | Scroll page (up/down/left/right) |
| `screenshot` | Capture page screenshot (base64 PNG) |

## HTTP API Reference

When FlowQ is running, the HTTP API is available at `http://127.0.0.1:18800`:

```bash
# Check status
curl http://127.0.0.1:18800/status

# List all tabs
curl http://127.0.0.1:18800/tabs

# Get page snapshot
curl "http://127.0.0.1:18800/snapshot?tabId=123"

# Click element
curl -X POST "http://127.0.0.1:18800/click?tabId=123&selector=button.submit"

# Type text
curl -X POST "http://127.0.0.1:18800/type?tabId=123&selector=input.search&text=hello"

# Scroll page
curl -X POST "http://127.0.0.1:18800/scroll?tabId=123&direction=down"
```

## Security

- **Localhost Only**: Extension only accepts connections from `127.0.0.1`
- **User Visibility**: Attached tabs are visible in the extension popup
- **Chrome Warning**: Chrome shows a debugger warning bar when attached
- **User Control**: Users can detach at any time via the extension popup

## Troubleshooting

### Extension shows "Disconnected"

1. Ensure FlowQ desktop app is running
2. Check that port `18799` is not blocked by firewall
3. Click **Reconnect** in the extension popup

### Debugger won't attach

1. Some Chrome internal pages (`chrome://`, `chrome-extension://`) cannot be debugged
2. Try refreshing the target page
3. Close and reopen the tab

### Page content not extracting

1. Ensure the page is fully loaded before taking a snapshot
2. Some pages with heavy JavaScript may need extra time
3. Try scrolling to load dynamic content first

### Commands not working

1. Check the service worker console: `chrome://extensions/` → FlowQ Browser Relay → "Inspect views: service worker"
2. Look for error messages in the console
3. Ensure the tab is attached before sending commands

## Development

### Testing Locally

1. Load the extension in Chrome (Developer mode)
2. Start FlowQ desktop app (`pnpm tauri:dev`)
3. Click extension popup to see connection status
4. Use `@#tabId` in FlowQ to test browser control

### Debugging

Open the service worker console:
1. Go to `chrome://extensions/`
2. Find FlowQ Browser Relay
3. Click "Inspect views: service worker"
4. Check console for logs and errors

## License

MIT - Part of FlowQ project
