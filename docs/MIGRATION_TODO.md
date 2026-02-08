# UI 迁移计划：从 craft-agents-oss 到 craft-agent-tauri

> 参考项目：`/Users/wsuam/Documents/github/参考项目/craft-agents-oss`
> 目标项目：`/Users/wsuam/Documents/github/craft-agent-tauri`

---

## 概述

### 迁移进度概览

| 阶段 | 状态 | 完成项 |
|------|------|--------|
| Phase 1: 核心功能 (P0) | ✅ 完成 | 5/5 |
| Phase 2: 用户体验 (P1) | ✅ 完成 | 11/11 |
| Phase 3: 功能完善 (P2) | 🟡 进行中 | 11/12 |
| Phase 4: 高级功能 (P3) | ⏳ 待开始 | 0/10 |

### 已完成的新组件

| 组件 | 文件路径 | 功能描述 |
|------|---------|---------|
| CodePreviewOverlay | `components/overlay/CodePreviewOverlay.tsx` | 代码预览覆盖层，支持语法高亮、多文件标签、行号切换 |
| TerminalPreviewOverlay | `components/overlay/TerminalPreviewOverlay.tsx` | 终端输出覆盖层，ANSI 颜色解析、全屏模式 |
| Attachments | `components/Attachments.tsx` | 文件附件组件，支持选择、拖放、预览、移除 |
| MentionSuggestions | `components/MentionSuggestions.tsx` | @mention 自动完成下拉菜单 |
| SlashCommands | `components/SlashCommands.tsx` | /commands 命令菜单（12 个内置命令）|
| EscapeInterruptOverlay | `components/EscapeInterruptOverlay.tsx` | Escape 中断确认覆盖层 |
| ThemeContext | `context/ThemeContext.tsx` | 主题上下文，支持 light/dark/system |
| ThemeToggle | `components/ThemeToggle.tsx` | 主题切换组件 |
| JSONPreviewOverlay | `components/overlay/JSONPreviewOverlay.tsx` | JSON 预览覆盖层，支持 Tree/Raw 视图 |
| DiffBlock | `components/DiffBlock.tsx` | Diff 块渲染，支持行号、高亮、折叠 |
| SearchHighlight | `components/SearchHighlight.tsx` | 搜索高亮组件，支持精确/模糊匹配 |
| TokenUsageDisplay | `components/TokenUsageDisplay.tsx` | Token 用量显示，支持详情展开 |
| PermissionCard | `components/PermissionCard.tsx` | 权限请求卡片，支持批准/拒绝 |
| PermissionModeSelector | `components/PermissionModeSelector.tsx` | 权限模式选择器 (Safe/Ask/Allow All) |
| ModelSelector | `components/ModelSelector.tsx` | 模型选择器 (Sonnet/Opus/Haiku) |
| CommandPalette | `components/CommandPalette.tsx` | 命令面板 (Cmd+K 搜索会话/文件/操作) |
| LabelBadge | `components/LabelBadge.tsx` | 标签徽章组件 |
| LabelSelector | `components/LabelSelector.tsx` | 标签选择器组件 |
| SettingsPage | `components/SettingsPage.tsx` | 设置页面 (主题、权限、快捷键) |

### 技术栈对比

| 特性 | 参考项目 (Electron) | 当前项目 (Tauri) |
|------|---------------------|------------------|
| 桌面框架 | Electron 39 | Tauri 2.x |
| 前端框架 | React 18.3.1 | React 18 |
| 状态管理 | Jotai (原子状态) | useState/useCallback |
| UI 组件库 | Radix UI | 原生实现 |
| 样式系统 | Tailwind CSS 4 | Tailwind CSS 3 |
| 动画库 | Motion (Framer) | CSS transitions |
| 语法高亮 | Shiki | react-syntax-highlighter |
| 图标库 | lucide-react | lucide-react |
| 数据存储 | 内存 + 文件 | JSONL 文件 |

---

## 迁移优先级

- 🔴 **P0 - 必须**: 核心功能，影响基本使用
- 🟠 **P1 - 重要**: 提升用户体验的关键功能
- 🟡 **P2 - 一般**: 增强功能，可后续实现
- 🟢 **P3 - 低**: 锦上添花，非必需

---

## 一、布局与容器组件

### 1.1 AppShell 主容器

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 三栏布局 (左侧栏/主内容/右侧栏) | ✅ ResizablePanels | ✅ 固定宽度 | 🟡 P2 |
| 面板可调整大小 | ✅ react-resizable-panels | ❌ | 🟡 P2 |
| 面板折叠/展开 | ✅ | ❌ | 🟡 P2 |
| 焦点模式 (隐藏侧边栏) | ✅ isFocusedMode | ❌ | 🟢 P3 |
| 持久化布局状态 | ✅ localStorage | ❌ | 🟢 P3 |

**迁移任务**:
- [ ] 安装 `react-resizable-panels`
- [ ] 将 `App.tsx` 改为使用 ResizablePanels
- [ ] 添加面板大小持久化
- [ ] 实现焦点模式快捷键 (Cmd+\)

---

### 1.2 左侧栏 (LeftSidebar)

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 工作区切换器 | ✅ WorkspaceSwitcher | ✅ Sidebar | 🟠 P1 |
| 新建聊天按钮 | ✅ | ✅ | ✅ 完成 |
| 会话列表 | ✅ SessionList | ✅ ChatList | 🔴 P0 |
| 状态过滤器 | ✅ Statuses | ✅ Status filter | ✅ 完成 |
| 自定义视图 | ✅ Views | ❌ | 🟢 P3 |
| Sources/Skills 导航 | ✅ | ⚠️ 占位符 | 🟠 P1 |
| 标签导航 | ✅ Labels | ⚠️ 占位符 | 🟡 P2 |
| 设置入口 | ✅ | ⚠️ 占位符 | 🟠 P1 |

**迁移任务**:
- [ ] 实现 Sources 页面和导航
- [ ] 实现 Skills 页面和导航
- [ ] 实现 Settings 页面
- [ ] 添加 Labels 功能
- [ ] 实现自定义视图 (Views)

---

## 二、会话列表组件 (SessionList)

### 2.1 基础功能

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 会话列表显示 | ✅ | ✅ | ✅ 完成 |
| 日期分组 (Today/Yesterday/Older) | ✅ | ✅ | ✅ 完成 |
| 虚拟列表 (大量会话) | ✅ | ❌ | 🟡 P2 |
| 分页加载 | ✅ 20+20 | ❌ | 🟡 P2 |
| 模糊搜索 | ✅ ufuzzy | ✅ fuzzySearch | ✅ 完成 |
| 搜索高亮 | ✅ | ✅ SearchHighlight | ✅ 完成 |

### 2.2 会话项功能

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 会话标题 | ✅ | ✅ | ✅ 完成 |
| 预览文字 | ✅ preview | ✅ | ✅ 完成 |
| 时间戳 | ✅ relative time | ✅ | ✅ 完成 |
| Flag 标记图标 | ✅ | ✅ | ✅ 完成 |
| Status 状态图标 | ✅ | ✅ | ✅ 完成 |
| 处理中动画 | ✅ isProcessing | ✅ Loader2 spinner | ✅ 完成 |
| 未读标记 (NEW badge) | ✅ hasUnread | ✅ NEW badge | ✅ 完成 |
| Token 用量显示 | ✅ tokenUsage | ✅ TokenUsageDisplay | ✅ 完成 |
| 多标签显示 | ✅ labels[] | ✅ LabelBadge | ✅ 完成 |
| 分享链接图标 | ✅ sharedUrl | ❌ | 🟢 P3 |

### 2.3 交互功能

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 点击选中 | ✅ | ✅ | ✅ 完成 |
| 右键菜单 | ✅ | ✅ | ✅ 完成 |
| 重命名 | ✅ | ✅ | ✅ 完成 |
| 删除 | ✅ | ✅ | ✅ 完成 |
| Flag/Unflag | ✅ | ✅ | ✅ 完成 |
| 设置状态 | ✅ | ✅ | ✅ 完成 |
| 分享会话 | ✅ | ❌ | 🟢 P3 |
| 拖拽排序 | ✅ | ❌ | 🟢 P3 |
| 设置标签 | ✅ | ❌ | 🟡 P2 |

**迁移任务**:
- [x] 实现日期分组显示 ✅ (Today/Yesterday/This Week/Older)
- [x] 添加搜索功能 ✅ (自定义 fuzzySearch 函数)
- [x] 实现处理中动画 ✅ (Loader2 spinner)
- [x] 添加未读标记 ✅ (NEW badge)
- [ ] 实现虚拟列表 (使用 `react-window` 或 `@tanstack/virtual`)
- [ ] 添加 Token 用量显示

---

## 三、聊天显示组件 (ChatDisplay)

### 3.1 消息渲染

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 用户消息气泡 | ✅ UserMessageBubble | ✅ | ✅ 完成 |
| AI 响应卡片 | ✅ TurnCard | ✅ | ✅ 完成 |
| 系统消息 | ✅ SystemMessage | ❌ | 🟡 P2 |
| 消息分组 (Turn) | ✅ groupMessagesByTurn | ❌ | 🟠 P1 |
| 流式文本渲染 | ✅ StreamingMarkdown | ⚠️ 基础 | 🔴 P0 |
| 消息时间戳 | ✅ | ✅ formatMessageTime | ✅ 完成 |
| 消息操作栏 | ✅ | ✅ Copy + View | 🟠 P1 |

### 3.2 Markdown 渲染

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 基础 Markdown | ✅ | ✅ | ✅ 完成 |
| 代码块语法高亮 | ✅ Shiki | ✅ react-syntax-highlighter | 🟡 P2 |
| 代码块 Copy | ✅ | ✅ | ✅ 完成 |
| 代码块行号 | ✅ | ✅ CodeBlockWithCopy | ✅ 完成 |
| 内联代码 | ✅ | ✅ | ✅ 完成 |
| 可折叠代码块 | ✅ CollapsibleMarkdown | ✅ CodeBlockWithCopy | ✅ 完成 |
| Diff 块渲染 | ✅ MarkdownDiffBlock | ✅ DiffBlock | ✅ 完成 |
| JSON 块渲染 | ✅ MarkdownJsonBlock | ✅ JSONPreviewOverlay | ✅ 完成 |
| Mermaid 图表 | ✅ MarkdownMermaidBlock | ❌ | 🟢 P3 |
| 数学公式 (LaTeX) | ✅ | ❌ | 🟢 P3 |

### 3.3 工具执行显示

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 活动项列表 | ✅ ActivityItem | ✅ steps | 🟠 P1 |
| 活动状态图标 | ✅ ActivityStatusIcon | ✅ | ✅ 完成 |
| 内联执行结果 | ✅ InlineExecution | ✅ AgentSteps 内联预览 | ✅ 完成 |
| 文件类型图标 | ✅ FileTypeIcon | ❌ | 🟡 P2 |
| 点击展开详情 | ✅ → overlay | ✅ → overlay | ✅ 完成 |
| 响应卡片 | ✅ ResponseCard | ❌ | 🟡 P2 |

### 3.4 权限/凭证请求

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 权限请求卡片 | ✅ PermissionCard | ✅ PermissionCard | ✅ 完成 |
| 凭证请求卡片 | ✅ CredentialCard | ❌ | 🟠 P1 |
| 批准/拒绝按钮 | ✅ | ✅ | ✅ 完成 |
| 权限模式切换 | ✅ safe/ask/allow-all | ✅ PermissionModeSelector | ✅ 完成 |

**迁移任务**:
- [ ] 实现消息 Turn 分组
- [ ] 改进流式文本渲染
- [ ] 实现权限请求卡片
- [ ] 实现凭证请求卡片
- [ ] 添加 Diff 块渲染
- [ ] 添加 JSON 块渲染
- [ ] 实现内联执行结果展示
- [ ] 考虑迁移到 Shiki 语法高亮

---

## 四、覆盖层组件 (Overlays)

### 4.1 基础覆盖层

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 全屏覆盖层容器 | ✅ FullscreenOverlayBase | ✅ FullscreenOverlay | ✅ 完成 |
| 覆盖层标题栏 | ✅ Header | ✅ | ✅ 完成 |
| 关闭按钮 | ✅ | ✅ | ✅ 完成 |
| Escape 关闭 | ✅ | ✅ | ✅ 完成 |
| 动画过渡 | ✅ Motion | ⚠️ 基础 CSS | 🟡 P2 |

### 4.2 专用覆盖层

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| Markdown 文档 | ✅ DocumentFormattedMarkdownOverlay | ✅ | ✅ 完成 |
| 代码预览 | ✅ CodePreviewOverlay | ✅ | ✅ 完成 |
| 终端输出 | ✅ TerminalPreviewOverlay | ✅ | ✅ 完成 |
| JSON 预览 | ✅ JSONPreviewOverlay | ✅ | ✅ 完成 |
| 多文件 Diff | ✅ MultiDiffPreviewOverlay | ❌ | 🟠 P1 |
| 图片预览 | ✅ ImagePreviewOverlay | ❌ | 🟡 P2 |
| PDF 预览 | ✅ PDFPreviewOverlay | ❌ | 🟢 P3 |
| 数据表格 | ✅ DataTableOverlay | ❌ | 🟢 P3 |
| Mermaid 图表 | ✅ MermaidPreviewOverlay | ❌ | 🟢 P3 |

**迁移任务**:
- [x] 实现代码预览覆盖层 ✅ (语法高亮 + 行号 + 多文件标签)
- [x] 实现终端输出覆盖层 ✅ (ANSI 颜色解析 + 全屏模式)
- [ ] 实现多文件 Diff 覆盖层
- [x] 实现 JSON 预览覆盖层 ✅ (Tree/Raw 视图切换)
- [ ] 实现图片预览覆盖层
- [ ] 添加 Motion 动画库

---

## 五、输入组件 (Input)

### 5.1 基础输入

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 文本输入框 | ✅ FreeFormInput | ✅ textarea | ✅ 完成 |
| 自动增长 | ✅ | ✅ min/max 约束 | ✅ 完成 |
| Enter 发送 | ✅ | ✅ | ✅ 完成 |
| Shift+Enter 换行 | ✅ | ✅ | ✅ 完成 |
| 占位符文字 | ✅ | ✅ | ✅ 完成 |

### 5.2 富文本功能

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| @mentions (sources/skills) | ✅ | ✅ MentionSuggestions | ✅ 完成 |
| /commands (斜线菜单) | ✅ | ✅ SlashCommands | ✅ 完成 |
| 自动完成下拉 | ✅ | ✅ | ✅ 完成 |
| Markdown 预览 | ✅ | ❌ | 🟢 P3 |

### 5.3 附件功能

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 附件按钮 | ✅ | ✅ | ✅ 完成 |
| 文件选择对话框 | ✅ | ✅ | ✅ 完成 |
| 拖放文件 | ✅ | ✅ Attachments 组件 | ✅ 完成 |
| 粘贴图片 | ✅ | ❌ | 🟡 P2 |
| 附件预览 | ✅ | ✅ | ✅ 完成 |
| 移除附件 | ✅ | ✅ | ✅ 完成 |

### 5.4 取消执行

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| Escape 中断 | ✅ EscapeInterruptOverlay | ✅ | ✅ 完成 |
| 取消按钮 | ✅ | ✅ Stop 按钮 | ✅ 完成 |
| 中断确认 | ✅ | ✅ 两步确认 | ✅ 完成 |

**迁移任务**:
- [x] 实现 textarea 自动增长 ✅
- [x] 实现 @mentions 自动完成 ✅ (MentionSuggestions 组件)
- [x] 实现 /commands 斜线菜单 ✅ (SlashCommands 组件，12 个内置命令)
- [x] 实现文件附件功能 ✅ (Attachments 组件，支持选择、拖放、预览、移除)
- [x] 实现 Escape 中断功能 ✅ (EscapeInterruptOverlay 两步确认)

---

## 六、顶部栏 (Header/PanelHeader)

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 会话标题 | ✅ | ⚠️ 简单显示 | 🟠 P1 |
| 编辑标题 | ✅ inline edit | ❌ | 🟡 P2 |
| 会话菜单 (更多操作) | ✅ | ⚠️ 基础 | 🟠 P1 |
| 权限模式选择器 | ✅ PermissionModeSelector | ✅ PermissionModeSelector | ✅ 完成 |
| 模型选择器 | ✅ ModelSelector | ✅ ModelSelector | ✅ 完成 |
| 分享按钮 | ✅ | ❌ | 🟢 P3 |
| 思考模式切换 | ✅ thinking toggle | ❌ | 🟡 P2 |

**迁移任务**:
- [x] 实现权限模式选择器 (Safe/Ask/Allow All) ✅
- [x] 实现模型选择器 ✅
- [ ] 改进会话菜单
- [ ] 添加内联编辑标题功能

---

## 七、状态管理

### 7.1 当前实现 (useState/useCallback)

```typescript
// 当前: 简单状态管理
const [sessions, setSessions] = useState<ChatSession[]>([])
const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
```

### 7.2 参考项目 (Jotai)

```typescript
// 参考: 原子状态管理
const sessionAtomFamily = atomFamily<Session | null>((id) => atom(null))
const sessionMetaMapAtom = atom<Map<string, SessionMeta>>()
const sessionIdsAtom = atom<string[]>([])
```

### 7.3 迁移建议

| 方面 | 建议 | 优先级 |
|------|------|--------|
| 会话隔离更新 | 迁移到 Jotai atomFamily | 🟡 P2 |
| 元数据分离 | 分离 meta 和完整会话 | 🟡 P2 |
| 消息懒加载 | 按需加载消息 | 🟡 P2 |
| 后台任务追踪 | 实现 backgroundTasksAtom | 🟠 P1 |

**迁移任务**:
- [ ] 评估是否迁移到 Jotai
- [ ] 如果迁移，安装 `jotai` 并重构状态管理
- [ ] 实现会话元数据与完整会话分离
- [ ] 实现消息懒加载

---

## 八、快捷键系统

| 快捷键 | 参考项目功能 | 当前状态 | 优先级 |
|--------|-------------|----------|--------|
| `Cmd+K` | 搜索会话 | ✅ CommandPalette | ✅ 完成 |
| `Cmd+N` | 新建会话 | ✅ | ✅ 完成 |
| `Cmd+/` | 显示快捷键帮助 | ❌ | 🟡 P2 |
| `Escape` | 取消/关闭 | ✅ | ✅ 完成 |
| `Cmd+\` | 焦点模式 | ❌ | 🟢 P3 |
| `Tab` | 权限模式切换 | ❌ | 🟡 P2 |
| `Cmd+Enter` | 发送消息 | ❌ | 🟡 P2 |

**迁移任务**:
- [x] 实现全局快捷键钩子 (`useGlobalShortcuts`) ✅
- [x] 实现 Cmd+K 搜索 ✅ (CommandPalette 组件)
- [x] 实现 Cmd+N 新建会话 ✅
- [x] 实现 Escape 取消操作 ✅
- [ ] 创建快捷键帮助对话框

---

## 九、主题系统

### 9.1 颜色系统

| 变量 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| `--background` | ✅ | ✅ | ✅ 完成 |
| `--foreground` | ✅ | ✅ | ✅ 完成 |
| `--accent` (紫色) | ✅ | ❌ | 🟡 P2 |
| `--info` (琥珀色) | ✅ | ❌ | 🟡 P2 |
| `--success` (绿色) | ✅ | ⚠️ | 🟡 P2 |
| `--destructive` (红色) | ✅ | ⚠️ | 🟡 P2 |
| 透明度变体 (/50) | ✅ | ❌ | 🟡 P2 |
| 混合变体 (-50) | ✅ | ❌ | 🟢 P3 |

### 9.2 暗色模式

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 系统跟随 | ✅ | ✅ | ✅ 完成 |
| 手动切换 | ✅ | ✅ | ✅ 完成 |
| 持久化偏好 | ✅ | ✅ | ✅ 完成 |

**迁移任务**:
- [x] 实现完整的 CSS 变量主题系统 ✅
- [x] 实现暗色模式切换 ✅ (ThemeContext + ThemeToggle)
- [x] 添加主题偏好持久化 ✅ (localStorage)

---

## 十、页面路由

| 页面 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| ChatPage | ✅ | ✅ 内嵌 | ✅ 完成 |
| SkillInfoPage | ✅ | ❌ | 🟠 P1 |
| SourceInfoPage | ✅ | ❌ | 🟠 P1 |
| PreferencesPage | ✅ | ✅ SettingsPage | ✅ 完成 |
| SettingsNavigator | ✅ | ✅ SettingsPage | ✅ 完成 |
| OnboardingFlow | ✅ | ❌ | 🟡 P2 |

**迁移任务**:
- [ ] 实现页面路由系统
- [ ] 创建 SkillInfoPage
- [ ] 创建 SourceInfoPage
- [ ] 创建 PreferencesPage/SettingsNavigator
- [ ] 创建 OnboardingFlow

---

## 十一、后端集成

### 11.1 Agent 通信

| 功能 | 参考项目 | 当前状态 | 优先级 |
|------|---------|----------|--------|
| 发送消息 | ✅ | ✅ send_message | ✅ 完成 |
| 流式响应 | ✅ event stream | ⚠️ 基础 | 🔴 P0 |
| 工具执行事件 | ✅ ToolStart/Result | ❌ | 🔴 P0 |
| 权限请求事件 | ✅ PermissionRequest | ❌ | 🔴 P0 |
| 凭证请求事件 | ✅ CredentialRequest | ❌ | 🟠 P1 |
| 错误事件 | ✅ ErrorEvent | ⚠️ 基础 | 🟠 P1 |

### 11.2 事件处理

```typescript
// 需要实现的事件类型
TextDeltaEvent         // 流式文本
TextCompleteEvent      // 文本完成
ToolStartEvent         // 工具开始
ToolResultEvent        // 工具结果
PermissionRequestEvent // 权限请求
CredentialRequestEvent // 凭证请求
ErrorEvent             // 错误
```

**迁移任务**:
- [ ] 实现完整的事件处理系统
- [ ] 实现工具执行事件处理
- [ ] 实现权限请求事件处理
- [ ] 改进错误处理

---

## 十二、数据结构

### 12.1 会话结构

```typescript
// 参考项目 SessionMeta
interface SessionMeta {
  id: string
  name?: string
  preview?: string
  workspaceId: string
  lastMessageAt?: number
  isProcessing?: boolean
  hasUnread?: boolean
  labels?: string[]           // 需要添加
  todoState?: string          // 已有 status
  lastMessageRole?: string
  tokenUsage?: TokenUsage     // 需要添加
  sharedUrl?: string          // 需要添加
}

// 当前项目 ChatSession
interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: Date
  workspacePath?: string
  isFlagged?: boolean
  status?: SessionStatus
  hasUnread?: boolean
}
```

### 12.2 需要扩展的字段

- [ ] `labels: string[]` - 多标签支持
- [ ] `tokenUsage: { inputTokens, outputTokens, totalTokens }` - Token 统计
- [x] `isProcessing: boolean` - 处理状态 ✅ 已添加
- [ ] `sharedUrl?: string` - 分享链接
- [ ] `lastMessageRole?: string` - 最后消息角色

### 12.3 新增类型定义

```typescript
// ✅ 已添加 - 工具输出类型
export interface ToolOutput {
  type: 'code' | 'terminal' | 'text';
  content: string;
  filename?: string;
  language?: string;
  exitCode?: number;
  cwd?: string;
}

// ✅ 已扩展 - Step 接口
export interface Step {
  id: string;
  label: string;
  status: 'pending' | 'thinking' | 'completed' | 'error';
  details?: string;
  output?: ToolOutput; // 新增
}
```

---

## 十三、组件库依赖

### 13.1 建议安装

```bash
# 动画
pnpm add motion

# 可调整面板
pnpm add react-resizable-panels

# 模糊搜索
pnpm add @leeoniya/ufuzzy

# 虚拟列表 (可选)
pnpm add @tanstack/react-virtual

# 命令菜单
pnpm add cmdk

# 语法高亮 (可选升级)
pnpm add shiki
```

### 13.2 Radix UI 组件 (可选)

如果需要更好的无障碍支持：

```bash
pnpm add @radix-ui/react-dialog
pnpm add @radix-ui/react-dropdown-menu
pnpm add @radix-ui/react-context-menu
pnpm add @radix-ui/react-popover
pnpm add @radix-ui/react-select
pnpm add @radix-ui/react-tabs
pnpm add @radix-ui/react-tooltip
```

---

## 十四、迁移阶段规划

### Phase 1: 核心功能完善 (P0) ✅ 完成

1. **流式响应改进**
   - [x] 改进流式文本渲染 ✅
   - [x] 实现工具执行事件处理 ✅ (tool_result 事件处理)

2. **权限系统**
   - [x] 实现权限请求卡片 ✅ (PermissionCard 组件)
   - [x] 实现权限模式选择器 ✅ (PermissionModeSelector 组件)
   - [x] 实现 Escape 中断功能 ✅

3. **基础 UI 完善**
   - [x] Session 切换 bug 修复 ✅ 已完成
   - [x] 实现取消执行功能 ✅ (EscapeInterruptOverlay + Stop 按钮)

### Phase 2: 用户体验提升 (P1)

1. **会话列表增强**
   - [x] 日期分组显示 ✅
   - [x] 搜索功能 ✅
   - [x] 处理中动画 ✅
   - [x] 未读标记 ✅

2. **输入功能**
   - [x] textarea 自动增长 ✅
   - [x] 文件附件功能 ✅
   - [x] @mentions 自动完成 ✅
   - [x] /commands 斜线菜单 ✅

3. **覆盖层**
   - [x] 代码预览覆盖层 ✅
   - [x] 终端输出覆盖层 ✅
   - [ ] 多文件 Diff 覆盖层

4. **导航和页面**
   - [ ] Sources 页面
   - [ ] Skills 页面
   - [x] Settings 页面 ✅ (SettingsPage 组件)
   - [x] 模型选择器 ✅ (ModelSelector 组件)

5. **快捷键**
   - [x] Cmd+K 搜索 ✅ (CommandPalette 组件)
   - [x] Cmd+N 新建 ✅

### Phase 3: 功能完善 (P2)

1. **可调整布局**
   - [ ] 安装 react-resizable-panels (暂缓)
   - [ ] 实现面板可调整大小
   - [ ] 面板状态持久化

2. **主题系统**
   - [x] 完整 CSS 变量系统 ✅
   - [x] 暗色模式 ✅ (ThemeContext + Tailwind dark mode)
   - [x] 主题偏好持久化 ✅

3. **会话增强**
   - [ ] 虚拟列表
   - [ ] 分页加载
   - [x] Token 用量显示 ✅ (TokenUsageDisplay 组件)
   - [x] 搜索高亮 ✅ (SearchHighlight 组件)
   - [x] 多标签支持 ✅ (LabelBadge、LabelSelector)

4. **Markdown 增强**
   - [x] Diff 块渲染 ✅ (DiffBlock 组件)
   - [x] JSON 块渲染 ✅ (JSONPreviewOverlay 组件)
   - [x] 代码块行号 ✅ (CodeBlockWithCopy 组件)
   - [x] 可折叠代码块 ✅ (CodeBlockWithCopy 自动折叠)

5. **状态管理**
   - [ ] 评估 Jotai 迁移
   - [ ] 会话元数据分离
   - [ ] 消息懒加载

### Phase 4: 高级功能 (P3)

1. **高级 UI**
   - [ ] 焦点模式
   - [ ] 自定义视图 (Views)
   - [ ] 拖拽排序

2. **分享功能**
   - [ ] 会话分享
   - [ ] 分享链接图标

3. **更多覆盖层**
   - [ ] PDF 预览
   - [ ] 数据表格
   - [ ] Mermaid 图表

4. **高级功能**
   - [ ] OnboardingFlow
   - [ ] 数学公式 (LaTeX)
   - [ ] Markdown 预览输入

---

## 十五、文件结构建议

```
craft-agent-tauri/
├── components/
│   ├── app-shell/           # 主容器组件
│   │   ├── AppShell.tsx     # 根容器 (新建)
│   │   ├── LeftSidebar.tsx  # 重构 Sidebar
│   │   ├── ChatDisplay.tsx  # 从 ChatWindow 提取
│   │   ├── SessionList.tsx  # 重构 ChatList
│   │   └── input/
│   │       ├── InputContainer.tsx
│   │       └── EscapeInterruptOverlay.tsx # ✅ 已完成
│   ├── Attachments.tsx          # ✅ 已完成 (文件附件组件)
│   ├── MentionSuggestions.tsx   # ✅ 已完成 (@mention 下拉)
│   ├── SlashCommands.tsx        # ✅ 已完成 (/commands 命令菜单)
│   ├── ui/                  # 基础 UI
│   │   ├── button.tsx       # (保留)
│   │   ├── CopyButton.tsx   # (保留)
│   │   ├── dialog.tsx       # (新建或从 Radix)
│   │   └── ...
│   ├── overlay/             # 覆盖层
│   │   ├── FullscreenOverlay.tsx  # (保留)
│   │   ├── CodePreviewOverlay.tsx # ✅ 已完成
│   │   ├── TerminalPreviewOverlay.tsx # ✅ 已完成
│   │   ├── DocumentMarkdownOverlay.tsx # (保留)
│   │   ├── index.ts               # ✅ 导出文件
│   │   └── ...
│   ├── chat/                # 聊天相关
│   │   ├── TurnCard.tsx
│   │   ├── UserMessageBubble.tsx
│   │   ├── ActivityItem.tsx
│   │   └── PermissionCard.tsx
│   └── settings/            # 设置页面
│       ├── PreferencesPage.tsx
│       └── ...
├── context/                 # React Context
│   ├── AppShellContext.tsx
│   └── ThemeContext.tsx
├── hooks/                   # 自定义钩子
│   ├── useSession.ts
│   ├── useGlobalShortcuts.ts
│   └── ...
├── lib/                     # 工具函数
│   ├── session-storage.ts   # (保留)
│   ├── tauri-api.ts         # (保留)
│   └── ...
└── types.ts                 # 类型定义
```

---

## 参考文件索引

| 功能 | 参考项目文件路径 |
|------|------------------|
| 主容器 | `/apps/electron/src/renderer/components/app-shell/AppShell.tsx` |
| 会话列表 | `/apps/electron/src/renderer/components/app-shell/SessionList.tsx` |
| 聊天显示 | `/apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx` |
| 输入组件 | `/apps/electron/src/renderer/components/app-shell/input/` |
| 富文本输入 | `/apps/electron/src/renderer/components/ui/rich-text-input.tsx` |
| 覆盖层 | `/packages/ui/src/components/overlay/` |
| Markdown | `/packages/ui/src/components/markdown/` |
| 代码查看器 | `/packages/ui/src/components/code/` |
| 主题配置 | `/packages/ui/src/styles/` |
| 状态原子 | `/apps/electron/src/renderer/atoms/` |
| 上下文 | `/apps/electron/src/renderer/context/` |
| 钩子 | `/apps/electron/src/renderer/hooks/` |
| 页面 | `/apps/electron/src/renderer/pages/` |

---

## 更新日志

| 日期 | 更新内容 |
|------|---------|
| 2026-02-06 | 初始版本，完成参考项目分析 |
| 2026-02-06 | 修复 Session 切换 bug (list_dir 返回完整路径问题) |
| 2026-02-06 | ✅ Phase 2 完成：会话列表日期分组、搜索功能、处理中动画、未读标记 |
| 2026-02-06 | ✅ 输入功能完成：textarea 自动增长、文件附件、@mentions、/commands |
| 2026-02-06 | ✅ 覆盖层完成：CodePreviewOverlay、TerminalPreviewOverlay |
| 2026-02-06 | ✅ 中断功能完成：EscapeInterruptOverlay、Stop 按钮 |
| 2026-02-06 | ✅ 工具执行结果：AgentSteps 增强（内联预览、展开详情、overlay 集成）|
| 2026-02-06 | ✅ 暗色模式：ThemeContext + 全组件 dark mode 支持 |
| 2026-02-06 | ✅ JSON 预览覆盖层：JSONPreviewOverlay (Tree/Raw 视图切换) |
| 2026-02-06 | ✅ Diff 块渲染：DiffBlock 组件 (行号、高亮、折叠、复制) |
| 2026-02-06 | ✅ 代码块增强：行号显示、可折叠 (>15行自动折叠) |
| 2026-02-06 | ✅ 搜索高亮：SearchHighlight 组件 (精确/模糊匹配高亮) |
| 2026-02-06 | ✅ Token 用量显示：TokenUsageDisplay 组件 (输入/输出/缓存/成本) |
| 2026-02-07 | ✅ 权限系统：PermissionCard、PermissionModeSelector、permission_request 事件处理 |
| 2026-02-07 | ✅ 模型选择器：ModelSelector 组件 (Sonnet/Opus/Haiku) |
| 2026-02-07 | ✅ 快捷键系统：Cmd+K (CommandPalette)、Cmd+N (新建会话) |
| 2026-02-07 | ✅ 多标签系统：LabelBadge、LabelSelector、会话标签管理 |
| 2026-02-07 | ✅ 设置页面：SettingsPage (主题、权限模式、快捷键帮助) |
| 2026-02-07 | ✅ 消息时间戳：用户和 Agent 消息显示相对时间 |

---

## 注意事项

1. **不使用 Radix UI**: 当前项目使用原生实现，如需使用 Radix 需要评估迁移成本
2. **Tailwind CSS 版本**: 参考项目使用 Tailwind 4，当前使用 Tailwind 3
3. **动画库**: 参考项目使用 Motion (Framer Motion 替代)，当前使用 CSS transitions
4. **Monorepo vs 单仓库**: 参考项目是 monorepo，当前是单仓库
5. **Electron vs Tauri**: 底层桌面框架不同，部分 API 需要适配
