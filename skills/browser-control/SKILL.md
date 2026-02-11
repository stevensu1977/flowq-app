# Browser Control Skill

You have access to a **Browser Control API** that allows you to interact with the user's Chrome browser. This API runs on `http://127.0.0.1:18800` and lets you browse web pages using the user's existing login sessions (cookies, auth tokens, etc.).

## When to Use This Skill

Use browser control when:
- The user asks you to browse authenticated websites (Twitter, GitHub, Gmail, etc.)
- You need to interact with web pages that require login
- The user mentions a browser tab with `@#`
- You need to scrape/extract content from pages behind auth
- You need to automate browser interactions (click, type, scroll)

**IMPORTANT:** Never use `curl` or `wget` directly on URLs when browser control is available - those won't have the user's session cookies!

## API Workflow

The typical workflow for browser automation:

1. **List tabs** → Find existing tabs or see what's open
2. **Attach** → Connect to a tab (required before other operations)
3. **Snapshot** → Get page content and interactive elements
4. **Act** → Click, type, scroll, or navigate
5. **Snapshot again** → Verify the action worked
6. **Repeat** until task is complete

## API Endpoints

All endpoints return JSON with structure: `{"success": true/false, "data": ..., "error": ...}`

### GET /status
Check if browser extension is connected.
```bash
curl http://127.0.0.1:18800/status
```

### GET /tabs
List all open browser tabs.
```bash
curl http://127.0.0.1:18800/tabs
```
Returns array of tabs with `id`, `url`, `title`, `active`, `attached`.

### POST /open
Open a new tab with URL.
```bash
curl -X POST http://127.0.0.1:18800/open -H "Content-Type: application/json" -d '{"url": "https://example.com"}'
```

### POST /close
Close a tab.
```bash
curl -X POST http://127.0.0.1:18800/close -H "Content-Type: application/json" -d '{"tabId": 123}'
```

### POST /attach
**REQUIRED before any tab operations.** Attach debugger to tab.
```bash
curl -X POST http://127.0.0.1:18800/attach -H "Content-Type: application/json" -d '{"tabId": 123}'
```

### POST /detach
Detach from tab when done.
```bash
curl -X POST http://127.0.0.1:18800/detach -H "Content-Type: application/json" -d '{"tabId": 123}'
```

### POST /snapshot
**Main tool for reading page content.** Returns page info, text content, and accessibility tree.
```bash
curl -X POST http://127.0.0.1:18800/snapshot -H "Content-Type: application/json" -d '{"tabId": 123}'
```
Response includes:
- `page`: URL, title, scroll position
- `textContent`: Visible text on page
- `tree`: Accessibility tree with clickable element references (`e0`, `e1`, etc.)
- `nodeCount`: Total elements

### POST /click
Click an element by CSS selector or element reference.
```bash
# Using CSS selector
curl -X POST http://127.0.0.1:18800/click -H "Content-Type: application/json" -d '{"tabId": 123, "selector": "button.submit"}'

# Using element reference from snapshot
curl -X POST http://127.0.0.1:18800/click -H "Content-Type: application/json" -d '{"tabId": 123, "selector": "e42"}'
```

### POST /type
Type text into an input element.
```bash
curl -X POST http://127.0.0.1:18800/type -H "Content-Type: application/json" -d '{"tabId": 123, "selector": "input#search", "text": "hello world"}'
```

### POST /scroll
Scroll the page.
```bash
curl -X POST http://127.0.0.1:18800/scroll -H "Content-Type: application/json" -d '{"tabId": 123, "direction": "down"}'
```
Direction: `up`, `down`, `left`, `right`

### POST /screenshot
Take a screenshot (returns base64 PNG).
```bash
curl -X POST http://127.0.0.1:18800/screenshot -H "Content-Type: application/json" -d '{"tabId": 123}'
```

### POST /evaluate
Execute JavaScript in the page.
```bash
curl -X POST http://127.0.0.1:18800/evaluate -H "Content-Type: application/json" -d '{"tabId": 123, "expression": "document.title"}'
```

## Example: Reading Elon Musk's Twitter

```bash
# 1. Check if browser is connected
curl http://127.0.0.1:18800/status

# 2. List tabs to find Twitter
curl http://127.0.0.1:18800/tabs

# 3. If not open, open Twitter
curl -X POST http://127.0.0.1:18800/open -H "Content-Type: application/json" \
  -d '{"url": "https://twitter.com/elonmusk"}'

# 4. Attach to the tab (use tabId from previous response)
curl -X POST http://127.0.0.1:18800/attach -H "Content-Type: application/json" \
  -d '{"tabId": 123}'

# 5. Wait a moment for page to load, then get snapshot
sleep 2
curl -X POST http://127.0.0.1:18800/snapshot -H "Content-Type: application/json" \
  -d '{"tabId": 123}'

# 6. If you need to scroll to see more tweets
curl -X POST http://127.0.0.1:18800/scroll -H "Content-Type: application/json" \
  -d '{"tabId": 123, "direction": "down"}'

# 7. Get snapshot again to see new content
curl -X POST http://127.0.0.1:18800/snapshot -H "Content-Type: application/json" \
  -d '{"tabId": 123}'
```

## Best Practices

1. **Always attach first** - Operations will fail on unattached tabs
2. **Check snapshot after actions** - Verify clicks/types worked
3. **Use CSS selectors for precision** - Better than element refs for stable elements
4. **Handle loading** - Add `sleep 1-2` after navigation or clicks
5. **Scroll for lazy-loaded content** - Many sites load content on scroll
6. **Don't use curl directly on URLs** - Use browser API to leverage user's auth

## Error Handling

If you get "Extension not connected":
- The Chrome extension may not be running
- Ask user to check the FlowQ Browser Relay extension

If you get "Tab X is not attached":
- Call `/attach` first before other operations

If operations time out:
- Page may be slow to load
- Try again after a short delay
