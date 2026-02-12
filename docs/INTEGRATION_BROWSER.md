# Browser Integration Plan

FlowQ 浏览器集成方案设计 — 基于 Playwright + Chrome Extension Relay 模式

---

## 背景与需求

### 问题

需要让 AI Agent 能够操作需要登录的网站（如 x.com、medium.com、Notion、GitHub 等）：

- OAuth 登录无法自动化（验证码、2FA、反自动化检测）
- Playwright 每次启动默认是干净环境，没有登录态
- 用户不希望重复输入凭据或暴露密码给 AI

### 目标

实现类似 OpenClaw 的浏览器控制能力：

1. 利用用户已登录的 Chrome 浏览器
2. AI 可以打开页面、获取内容、执行操作
3. 保持登录态，无需重复认证

---

## 技术方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **User Data Dir** | 自动化长期任务 | 一次登录永久有效，支持 OAuth 回调 | 第一次需要手动登录 |
| **Chrome Extension Relay** | 利用已有浏览器 | 零登录成本，直接用你的浏览器 | 需要安装扩展，只能控制已打开的页面 |
| **Cookie 注入** | CI/CD、无头模式 | 全自动，适合脚本化 | Cookie 有效期有限，OAuth token 会过期 |

**推荐方案**：Chrome Extension Relay 模式 — 最适合 FlowQ 的桌面应用场景。

---

## Chrome Extension Relay 架构

### 工作原理

```
┌─────────────────────────────────────────────────────────────────────┐
│                      用户日常使用的 Chrome                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │  x.com      │  │  GitHub     │  │  Notion     │   (已登录)       │
│  │  (Elon's)   │  │  (你的repo) │  │  (你的文档) │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│         ↑                ↑                ↑                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│              ┌───────────┴───────────┐                              │
│              │   FlowQ Relay 扩展     │                              │
│              │   (background.js)     │                              │
│              │                       │                              │
│              │  chrome.debugger API  │                              │
│              └───────────┬───────────┘                              │
└──────────────────────────┼──────────────────────────────────────────┘
                           │ WebSocket / HTTP
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│                        FlowQ Desktop App                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Browser Control Module                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │ Tab Manager │  │ CDP Client  │  │ Playwright Session  │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↑                                       │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │                      AI Agent (Claude)                         │  │
│  │  • action="open" → 在 Chrome 中打开页面                        │  │
│  │  • action="snapshot" → 获取页面无障碍树快照                    │  │
│  │  • action="act" → 点击/输入/滚动等操作                         │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. Chrome Extension (FlowQ Browser Relay)

```javascript
// manifest.json (Manifest V3)
{
  "name": "FlowQ Browser Relay",
  "version": "1.0.0",
  "manifest_version": 3,
  "permissions": [
    "debugger",      // 核心：CDP 调试协议
    "tabs",          // 标签页管理
    "activeTab",     // 当前标签页
    "storage"        // 配置存储
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  }
}
```

```javascript
// background.js 核心功能
class BrowserRelay {
  constructor() {
    this.attachedTabs = new Map();  // tabId -> debugger session
    this.wsServer = null;           // WebSocket 连接到 FlowQ
  }

  // 附加到标签页
  async attachToTab(tabId) {
    await chrome.debugger.attach({ tabId }, '1.3');
    this.attachedTabs.set(tabId, { attached: true });
    return { success: true, tabId };
  }

  // 执行 CDP 命令
  async sendCommand(tabId, method, params) {
    return chrome.debugger.sendCommand({ tabId }, method, params);
  }

  // 获取页面快照（Accessibility Tree）
  async getSnapshot(tabId) {
    const result = await this.sendCommand(tabId, 'Accessibility.getFullAXTree');
    return result;
  }

  // 执行 JavaScript
  async evaluate(tabId, expression) {
    const result = await this.sendCommand(tabId, 'Runtime.evaluate', {
      expression,
      returnByValue: true
    });
    return result;
  }

  // 监听来自 FlowQ 的命令
  handleMessage(message) {
    switch (message.action) {
      case 'attach': return this.attachToTab(message.tabId);
      case 'open': return chrome.tabs.create({ url: message.url });
      case 'snapshot': return this.getSnapshot(message.tabId);
      case 'evaluate': return this.evaluate(message.tabId, message.expression);
      case 'click': return this.click(message.tabId, message.selector);
      // ...
    }
  }
}
```

#### 2. FlowQ Browser Control Module (Rust)

```rust
// src-tauri/src/browser.rs (概念代码)

use tokio::sync::mpsc;
use tokio_tungstenite::WebSocketStream;

pub struct BrowserController {
    ws_connection: Option<WebSocketStream>,
    attached_tabs: HashMap<u32, TabInfo>,
}

impl BrowserController {
    /// 连接到 Chrome 扩展
    pub async fn connect_to_extension(&mut self) -> Result<(), BrowserError> {
        // 扩展启动时会尝试连接到本地 WebSocket 服务器
        // FlowQ 在启动时监听 ws://127.0.0.1:18799
    }

    /// 在用户浏览器中打开页面
    pub async fn open_tab(&self, url: &str) -> Result<TabInfo, BrowserError> {
        self.send_command(json!({
            "action": "open",
            "url": url
        })).await
    }

    /// 获取页面快照（用于 AI 理解页面内容）
    pub async fn get_snapshot(&self, tab_id: u32) -> Result<PageSnapshot, BrowserError> {
        self.send_command(json!({
            "action": "snapshot",
            "tabId": tab_id,
            "format": "ai"  // 简化的无障碍树格式
        })).await
    }

    /// 执行页面操作
    pub async fn perform_action(&self, tab_id: u32, action: BrowserAction) -> Result<(), BrowserError> {
        match action {
            BrowserAction::Click { selector } => { /* ... */ },
            BrowserAction::Type { selector, text } => { /* ... */ },
            BrowserAction::Scroll { direction } => { /* ... */ },
        }
    }
}
```

#### 3. AI Agent Browser Tool

```typescript
// 前端 Tool 定义（供 Claude 调用）
const browserTool = {
  name: "browser",
  description: `
    Control the user's Chrome browser via the FlowQ Browser Relay extension.
    Use this to browse websites, extract content, and perform actions.

    Actions:
    - open: Open a URL in a new tab
    - snapshot: Get page content as accessibility tree (best for AI understanding)
    - click: Click an element by ref ID from snapshot
    - type: Type text into a form field
    - scroll: Scroll the page
    - close: Close a tab

    The extension uses the user's existing login sessions - no need to re-authenticate.
  `,
  input_schema: {
    type: "object",
    properties: {
      action: { enum: ["open", "snapshot", "click", "type", "scroll", "close"] },
      url: { type: "string", description: "URL to open (for action=open)" },
      tabId: { type: "number", description: "Tab ID to operate on" },
      selector: { type: "string", description: "Element selector or ref ID" },
      text: { type: "string", description: "Text to type (for action=type)" },
      direction: { enum: ["up", "down", "left", "right"], description: "Scroll direction" }
    }
  }
};
```

---

## 使用场景示例

### 场景 1: 获取 X.com 上 Elon Musk 的最新推文

```
用户: "帮我看看 Elon Musk 今天发了什么推"

AI Agent 执行链路:
1. browser.open("https://x.com/elonmusk")
   → 扩展在用户 Chrome 中打开页面（已登录，直接显示内容）

2. browser.snapshot(tabId)
   → 返回无障碍树快照:
   {
     "tree": [
       { "role": "heading", "name": "Elon Musk", "ref": "e1" },
       { "role": "article", "children": [
         { "role": "link", "name": "@elonmusk · 2h", "ref": "e2" },
         { "role": "text", "name": "Just launched another rocket...", "ref": "e3" }
       ]},
       { "role": "article", "children": [
         { "role": "link", "name": "@elonmusk · 5h", "ref": "e4" },
         { "role": "text", "name": "Working on X features...", "ref": "e5" }
       ]}
     ]
   }

3. AI 从快照中提取推文内容，整理后返回给用户

用户看到:
"Elon Musk 最近的推文：
- 2小时前：Just launched another rocket...
- 5小时前：Working on X features..."
```

### 场景 2: 从 Notion 获取文档内容

```
用户: "把我 Notion 里的项目计划文档读出来"

AI Agent 执行链路:
1. browser.open("https://notion.so/Project-Plan-xxx")
   → 用户已登录 Notion，直接显示文档

2. browser.snapshot(tabId)
   → 获取文档内容的无障碍树

3. 如果需要展开折叠部分:
   browser.click(tabId, ref="toggle-e12")
   browser.snapshot(tabId)

4. AI 整理文档内容返回
```

### 场景 3: 在 GitHub 上创建 Issue

```
用户: "在我的 flowq-app 仓库创建一个 bug issue"

AI Agent 执行链路:
1. browser.open("https://github.com/stevensu1977/flowq-app/issues/new")

2. browser.type(tabId, selector="title", text="Bug: ...")

3. browser.type(tabId, selector="body", text="## Description\n...")

4. browser.click(tabId, selector="submit-button")

5. browser.snapshot(tabId) → 确认 issue 创建成功
```

---

## 实现计划

### Phase 1: 基础架构

| 任务 | 描述 | 文件 |
|------|------|------|
| WebSocket 服务器 | Tauri 后端监听扩展连接 | `src-tauri/src/browser/server.rs` |
| Chrome 扩展骨架 | Manifest V3 基础结构 | `browser-extension/manifest.json` |
| 扩展 Background | CDP 封装和消息处理 | `browser-extension/background.js` |
| 扩展 Popup UI | 连接状态和标签页管理 | `browser-extension/popup.html` |

### Phase 2: 核心功能

| 任务 | 描述 | 文件 |
|------|------|------|
| Tab 管理 | 打开/关闭/列表标签页 | `browser/tabs.rs` |
| 页面快照 | Accessibility Tree 提取 | `browser/snapshot.rs` |
| 页面操作 | Click/Type/Scroll 封装 | `browser/actions.rs` |
| AI Tool 定义 | Browser tool for Claude | `lib/browser-tool.ts` |

### Phase 3: 集成与 UI

| 任务 | 描述 | 文件 |
|------|------|------|
| 设置页集成 | 扩展状态和配置 UI | `components/BrowserSetup.tsx` |
| Agent 模式集成 | Browser tool 注册 | `components/ChatWindow.tsx` |
| 快照预览 | 可视化页面状态 | `components/BrowserSnapshot.tsx` |

---

## 安全考虑

### 权限控制

```typescript
// 扩展只响应来自 FlowQ 的请求
const ALLOWED_ORIGINS = ['ws://127.0.0.1:18799'];

// 用户确认敏感操作
const SENSITIVE_ACTIONS = ['click', 'type', 'submit'];
// → 弹窗确认或在 FlowQ 中显示审批对话框
```

### 数据保护

- 快照数据不持久化，仅内存传输
- 不记录敏感表单内容（密码字段跳过）
- CDP 连接仅限本地 localhost

### 用户控制

- 扩展 popup 显示当前附加的标签页
- 用户可随时 detach 取消控制
- FlowQ 中显示浏览器活动日志

---

## 与现有系统的集成

### MCP 服务器对比

| 方面 | MCP 服务器 | Browser Relay |
|------|-----------|---------------|
| 运行方式 | 独立进程 (npx/uvx) | Chrome 扩展 |
| 能力范围 | 特定 API/数据源 | 任意网页 |
| 认证 | 需要 API Key | 使用用户登录态 |
| 适用场景 | 结构化 API 调用 | 网页浏览/操作 |

### 混合使用

```
用户: "帮我把 GitHub 上的这个 issue 同步到 Linear"

执行流程:
1. Browser Tool → GitHub (读取 issue 详情)
2. MCP Server (Linear) → 创建对应任务
   或
   Browser Tool → Linear 网页 → 填写表单创建
```

---

## 参考资源

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Debugger API](https://developer.chrome.com/docs/extensions/reference/debugger/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Playwright CDP Connection](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [OpenClaw Project](https://github.com/anthropics/openclaw) — 参考实现

---

*Last updated: February 2025*
