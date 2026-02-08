# UI Enhancement Plan - Copy & View as Markdown

## 1. 目标

从参考项目 `craft-agents-oss` 迁移以下 UI 功能到当前项目：

1. **Copy 功能** - 一键复制消息内容到剪贴板
2. **View as Markdown 功能** - 全屏预览消息的 Markdown 源码
3. **可滚动内容层** - 带淡出效果的优雅滚动容器

---

## 2. 功能对比分析

### 2.1 参考项目功能

| 功能 | 参考项目位置 | 实现方式 |
|------|-------------|---------|
| Copy 按钮 | `packages/ui/src/components/overlay/CopyButton.tsx` | navigator.clipboard.writeText() + 2s 反馈 |
| View as Markdown | `packages/ui/src/components/chat/TurnCard.tsx` (行 1393-1405) | 打开 DocumentFormattedMarkdownOverlay |
| 全屏 Overlay | `packages/ui/src/components/overlay/FullscreenOverlayBase.tsx` | Portal + CSS 遮罩渐变 + ESC 关闭 |
| 代码块 Copy | `packages/ui/src/components/markdown/CodeBlock.tsx` (行 187-201) | hover 显示 Copy 按钮 |
| 消息底部操作栏 | `packages/ui/src/components/chat/TurnCard.tsx` (ResponseCard) | Copy + View as Markdown 按钮 |

### 2.2 当前项目状态

| 功能 | 状态 | 说明 |
|------|------|------|
| Copy 按钮 | ❌ 未实现 | 代码块无复制按钮 |
| View as Markdown | ❌ 未实现 | 仅有 Download 占位按钮 |
| 全屏 Overlay | ✅ 部分实现 | MermaidDiagram 有基础 Modal |
| 代码块 Copy | ❌ 未实现 | - |
| 消息底部操作栏 | ❌ 未实现 | - |

---

## 3. 修改计划

### Phase 1: 基础组件创建

#### 3.1 CopyButton 组件

**新建文件**: `components/ui/CopyButton.tsx`

**功能**:
- 点击复制内容到剪贴板
- 复制成功后显示 Check 图标 (2秒)
- 支持自定义样式和 tooltip

**参考实现**:
```tsx
// 核心逻辑
const handleCopy = useCallback(async () => {
  try {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}, [content]);
```

**图标**: `lucide-react` 的 `Copy` 和 `Check`

---

#### 3.2 FullscreenOverlay 组件

**新建文件**: `components/ui/FullscreenOverlay.tsx`

**功能**:
- Portal 渲染到 document.body
- 可滚动内容区域
- 顶部/底部淡出效果 (CSS mask gradient)
- ESC 快捷键关闭
- 浮动 Header (包含关闭按钮和 Copy 按钮)
- 防止背景滚动

**参考结构**:
```
Dialog.Content (fixed inset-0)
├── Masked area (CSS mask gradient)
│   └── Scroll container (overflow-y-auto)
│       └── Content
└── Floating header (absolute top-0, z-10)
    ├── 标题/徽章
    ├── Copy 按钮
    └── 关闭按钮
```

**淡出效果实现**:
```css
mask-image: linear-gradient(
  to bottom,
  transparent 0px,
  black 24px,
  black calc(100% - 24px),
  transparent 100%
);
```

---

### Phase 2: 消息渲染增强

#### 3.3 代码块 Copy 功能

**修改文件**: `components/MarkdownContent.tsx`

**变更**:
1. 为代码块添加 Copy 按钮
2. hover 时显示，复制后显示 Check 图标
3. 右上角定位

**实现方案**:
```tsx
// 代码块渲染
code: ({ className, children }) => {
  const isBlock = /* 判断是否为代码块 */;

  if (isBlock) {
    return (
      <div className="relative group">
        <pre className="...">
          <code>{children}</code>
        </pre>
        <CopyButton
          content={String(children)}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
        />
      </div>
    );
  }
  // 行内代码...
}
```

---

#### 3.4 消息底部操作栏

**修改文件**: `components/ChatWindow.tsx`

**变更**:
1. 在每条 agent 消息底部添加操作栏
2. 包含 "Copy" 和 "View as Markdown" 按钮

**UI 设计**:
```
┌─────────────────────────────────────────┐
│ [Agent Message Content]                 │
│                                         │
├─────────────────────────────────────────┤
│ 📋 Copy    🔗 View as Markdown          │
└─────────────────────────────────────────┘
```

**实现**:
```tsx
{message.role === 'agent' && (
  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
    <button onClick={() => copyToClipboard(message.content)}>
      <Copy size={14} />
      <span>Copy</span>
    </button>
    <button onClick={() => openMarkdownOverlay(message.content)}>
      <ExternalLink size={14} />
      <span>View as Markdown</span>
    </button>
  </div>
)}
```

---

### Phase 3: Markdown 全屏预览

#### 3.5 DocumentMarkdownOverlay 组件

**新建文件**: `components/overlay/DocumentMarkdownOverlay.tsx`

**功能**:
- 全屏显示消息的 Markdown 渲染结果
- Header: 标题 + Copy + 关闭按钮
- 内容区: 可滚动的 Markdown 渲染
- 淡出边缘效果

**依赖**:
- `FullscreenOverlay` (基础框架)
- `MarkdownContent` (渲染器)
- `CopyButton` (复制功能)

---

### Phase 4: 滚动优化

#### 3.6 消息区域滚动优化

**修改文件**: `components/ChatWindow.tsx`

**变更**:
1. 添加顶部/底部淡出效果
2. 优化滚动行为

**淡出效果**:
```tsx
<div
  className="flex-1 overflow-y-auto"
  style={{
    maskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
    WebkitMaskImage: '...' // Safari 兼容
  }}
>
```

---

## 4. 文件变更清单

### 新建文件

| 文件路径 | 描述 | 优先级 |
|---------|------|--------|
| `components/ui/CopyButton.tsx` | 通用复制按钮组件 | P0 |
| `components/ui/FullscreenOverlay.tsx` | 全屏 Overlay 基础组件 | P0 |
| `components/overlay/DocumentMarkdownOverlay.tsx` | Markdown 预览 Overlay | P1 |

### 修改文件

| 文件路径 | 变更内容 | 优先级 |
|---------|---------|--------|
| `components/MarkdownContent.tsx` | 代码块添加 Copy 按钮 | P0 |
| `components/ChatWindow.tsx` | 消息底部操作栏 + 滚动优化 | P1 |
| `index.css` | 添加淡出效果相关样式 | P2 |

---

## 5. 实现顺序

```
Phase 1 (基础组件)
├── 1.1 CopyButton.tsx
└── 1.2 FullscreenOverlay.tsx

Phase 2 (消息增强)
├── 2.1 MarkdownContent - 代码块 Copy
└── 2.2 ChatWindow - 消息操作栏

Phase 3 (全屏预览)
└── 3.1 DocumentMarkdownOverlay.tsx

Phase 4 (优化)
└── 4.1 滚动淡出效果
```

---

## 6. 参考项目关键文件

以下是需要重点参考的源文件：

| 功能 | 参考文件 |
|------|---------|
| CopyButton | `/参考项目/craft-agents-oss/packages/ui/src/components/overlay/CopyButton.tsx` |
| FullscreenOverlay | `/参考项目/craft-agents-oss/packages/ui/src/components/overlay/FullscreenOverlayBase.tsx` |
| 消息底部操作栏 | `/参考项目/craft-agents-oss/packages/ui/src/components/chat/TurnCard.tsx` (行 1350-1420) |
| 代码块 Copy | `/参考项目/craft-agents-oss/packages/ui/src/components/markdown/CodeBlock.tsx` (行 187-201) |
| Markdown 预览 | `/参考项目/craft-agents-oss/packages/ui/src/components/overlay/DocumentFormattedMarkdownOverlay.tsx` |
| 淡出效果常量 | `/参考项目/craft-agents-oss/packages/ui/src/components/overlay/FullscreenOverlayBase.tsx` (FADE_MASK, HEADER_HEIGHT) |

---

## 7. 技术注意事项

### 7.1 剪贴板 API

```tsx
// 现代 API (推荐)
navigator.clipboard.writeText(content);

// 需要处理权限和错误
try {
  await navigator.clipboard.writeText(content);
} catch (err) {
  // fallback 或错误提示
}
```

### 7.2 CSS Mask 兼容性

```css
/* 需要同时添加标准和 webkit 前缀 */
mask-image: linear-gradient(...);
-webkit-mask-image: linear-gradient(...);
```

### 7.3 Portal 渲染

```tsx
// 使用 React Portal 渲染 Overlay 到 body
import { createPortal } from 'react-dom';

return createPortal(
  <div className="fixed inset-0 z-50">...</div>,
  document.body
);
```

### 7.4 ESC 键监听

```tsx
useEffect(() => {
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handleEsc);
  return () => document.removeEventListener('keydown', handleEsc);
}, [onClose]);
```

### 7.5 防止背景滚动

```tsx
useEffect(() => {
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = '';
  };
}, []);
```

---

## 8. UI 样式参考

### 8.1 按钮样式

```tsx
// Copy / View as Markdown 按钮
className={cn(
  "flex items-center gap-1.5 transition-colors select-none",
  "text-muted-foreground hover:text-foreground",
  "focus:outline-none focus-visible:underline"
)}
```

### 8.2 淡出遮罩

```tsx
// 参考项目常量
const HEADER_HEIGHT = 48;
const FADE_SIZE = 24;

style={{
  maskImage: `linear-gradient(to bottom, transparent 0px, black ${FADE_SIZE}px, black calc(100% - ${FADE_SIZE}px), transparent 100%)`
}}
```

### 8.3 Copy 按钮反馈

```tsx
// 复制成功后的图标切换
{copied ? (
  <Check className="w-4 h-4 text-green-500" />
) : (
  <Copy className="w-4 h-4" />
)}
```

---

## 9. 验收标准

### Phase 1
- [ ] CopyButton 组件可独立工作
- [ ] FullscreenOverlay 支持 ESC 关闭和背景点击关闭

### Phase 2
- [ ] 代码块 hover 显示 Copy 按钮
- [ ] 复制后显示成功反馈 (Check 图标)
- [ ] Agent 消息底部有 Copy 和 View as Markdown 按钮

### Phase 3
- [ ] View as Markdown 打开全屏预览
- [ ] 预览内容可滚动
- [ ] Header 固定在顶部
- [ ] 有 Copy 整个内容的按钮

### Phase 4
- [ ] 消息区域有淡出边缘效果
- [ ] 滚动体验流畅

---

## 10. 估算工作量

| Phase | 工作内容 | 预估复杂度 |
|-------|---------|-----------|
| Phase 1 | 基础组件 | 中等 |
| Phase 2 | 消息增强 | 低 |
| Phase 3 | 全屏预览 | 中等 |
| Phase 4 | 滚动优化 | 低 |
