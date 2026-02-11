# FlowQ Browser Relay Extension

Chrome extension that enables FlowQ AI to control your browser using your existing login sessions.

## Features

- **Zero Re-authentication**: Uses your already logged-in browser sessions
- **Page Snapshots**: Extracts accessibility tree for AI understanding
- **Browser Control**: Click, type, scroll, and navigate pages
- **WebSocket Communication**: Real-time connection with FlowQ desktop app

## Installation (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this `flowq-extension` folder

## Architecture

```
FlowQ Desktop App
      │
      │ WebSocket (ws://127.0.0.1:18799)
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

## Supported Commands

| Action | Description |
|--------|-------------|
| `ping` | Health check |
| `list_tabs` | Get all open tabs |
| `open` | Open a new tab |
| `close` | Close a tab |
| `attach` | Attach debugger to tab |
| `detach` | Detach from tab |
| `snapshot` | Get page accessibility tree |
| `evaluate` | Execute JavaScript |
| `click` | Click element by selector |
| `type` | Type text into input |
| `scroll` | Scroll page |
| `screenshot` | Capture page screenshot |

## Message Format

**Request from FlowQ:**
```json
{
  "requestId": "uuid",
  "action": "snapshot",
  "tabId": 123
}
```

**Response to FlowQ:**
```json
{
  "type": "response",
  "requestId": "uuid",
  "result": { ... }
}
```

## Security

- Only accepts connections from `ws://127.0.0.1:18799` (localhost)
- User can see attached tabs in popup
- Debugger warning shown in Chrome when attached
- User can detach at any time

## Icon Generation

To generate PNG icons from the SVG:

```bash
# Using ImageMagick
for size in 16 32 48 128; do
  convert icons/icon.svg -resize ${size}x${size} icons/icon${size}.png
done

# Or using rsvg-convert (librsvg)
for size in 16 32 48 128; do
  rsvg-convert -w $size -h $size icons/icon.svg > icons/icon${size}.png
done
```

## Development

### Testing locally

1. Load extension in Chrome (Developer mode)
2. Start FlowQ desktop app (which listens on port 18799)
3. Click extension popup to see connection status
4. Extension will auto-reconnect when FlowQ starts

### Debugging

- Open `chrome://extensions/`
- Click "Inspect views: service worker" under FlowQ Browser Relay
- Check console for connection logs

## License

MIT - Part of FlowQ project
