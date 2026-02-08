# UI Enhancement Reference Code

本文档包含参考项目中的关键实现代码，供实现时参考。

---

## 1. CopyButton 组件

**来源**: `craft-agents-oss/packages/ui/src/components/overlay/CopyButton.tsx`

```tsx
import * as React from 'react'
import { useCallback, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface CopyButtonProps {
  /** Content to copy to clipboard */
  content: string
  /** Optional label (default: "Copy") */
  label?: string
  /** Optional tooltip for the button */
  title?: string
  /** Optional className override */
  className?: string
}

export function CopyButton({ content, title = 'Copy', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [content])

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded-[6px] transition-colors shrink-0 select-none',
        copied
          ? 'text-success'
          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className
      )}
      title={copied ? 'Copied!' : title}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}
```

---

## 2. FullscreenOverlay 基础组件

**来源**: `craft-agents-oss/packages/ui/src/components/overlay/FullscreenOverlayBase.tsx`

### 关键常量

```tsx
// Z-index for fullscreen overlays
const Z_FULLSCREEN = 'var(--z-fullscreen, 350)'

// HEADER_HEIGHT must match PreviewHeader's height (48px)
// FADE_SIZE is the transition zone where content fades in/out at edges
const HEADER_HEIGHT = 48
const FADE_SIZE = 24

// Edge-to-edge gradient fade mask
const FADE_MASK = `linear-gradient(to bottom, transparent 0px, black ${FADE_SIZE}px, black calc(100% - ${FADE_SIZE}px), transparent 100%)`
```

### 核心结构

```tsx
export function FullscreenOverlayBase({
  isOpen,
  onClose,
  children,
  className,
  accessibleTitle = 'Overlay',
  typeBadge,
  filePath,
  title,
  onTitleClick,
  subtitle,
  headerActions,
  copyContent,
  error,
}: FullscreenOverlayBaseProps) {
  // Determine if we should render the structured header
  const hasHeader = !!(typeBadge || filePath || title || subtitle || headerActions || copyContent)

  // Content padding clears the floating header at rest (when present)
  const contentPaddingTop = hasHeader ? HEADER_HEIGHT + FADE_SIZE : FADE_SIZE

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          className={cn(
            'fixed inset-0 overflow-hidden outline-none',
            'bg-foreground-3 fullscreen-overlay-background',
            className
          )}
          style={{ zIndex: Z_FULLSCREEN }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Visually hidden title for accessibility */}
          <Dialog.Title className="sr-only">{accessibleTitle}</Dialog.Title>

          {/* Full-viewport masked scroll area */}
          <div
            className="absolute inset-0"
            style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
          >
            <div
              className="h-full overflow-y-auto"
              style={{
                paddingTop: contentPaddingTop,
                paddingBottom: FADE_SIZE,
                scrollPaddingTop: contentPaddingTop
              }}
            >
              {/* Centering wrapper */}
              <div className="min-h-full flex flex-col justify-center">
                {/* Error banner */}
                {error && (
                  <div className="px-6 pb-4">
                    <OverlayErrorBanner label={error.label} message={error.message} />
                  </div>
                )}
                {children}
              </div>
            </div>
          </div>

          {/* Floating header */}
          {hasHeader && (
            <div className="absolute top-0 left-0 right-0 z-10">
              <FullscreenOverlayBaseHeader
                onClose={onClose}
                typeBadge={typeBadge}
                filePath={filePath}
                title={title}
                onTitleClick={onTitleClick}
                subtitle={subtitle}
                headerActions={headerActions}
                copyContent={copyContent}
              />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

---

## 3. 消息底部操作栏

**来源**: `craft-agents-oss/packages/ui/src/components/chat/TurnCard.tsx` (ResponseCard 部分)

### Footer 结构

```tsx
{/* Footer with actions - hidden in compact mode */}
{!compactMode && (
  <div className={cn(
    "pl-4 pr-2.5 py-2 border-t border-border/30 flex items-center justify-between bg-muted/20",
    SIZE_CONFIG.fontSize
  )}>
    {/* Left side - Copy and View as Markdown */}
    <div className="flex items-center gap-3">
      <button
        onClick={handleCopy}
        className={cn(
          "flex items-center gap-1.5 transition-colors select-none",
          copied ? "text-success" : "text-muted-foreground hover:text-foreground",
          "focus:outline-none focus-visible:underline"
        )}
      >
        {copied ? (
          <>
            <Check className={SIZE_CONFIG.iconSize} />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className={SIZE_CONFIG.iconSize} />
            <span>Copy</span>
          </>
        )}
      </button>
      {onPopOut && (
        <button
          onClick={onPopOut}
          className={cn(
            "flex items-center gap-1.5 transition-colors select-none",
            "text-muted-foreground hover:text-foreground",
            "focus:outline-none focus-visible:underline"
          )}
        >
          <ExternalLink className={SIZE_CONFIG.iconSize} />
          <span>View as Markdown</span>
        </button>
      )}
    </div>
  </div>
)}
```

### Copy 处理逻辑

```tsx
const [copied, setCopied] = useState(false)

const handleCopy = useCallback(async () => {
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}, [text])
```

### SIZE_CONFIG 参考

```tsx
const SIZE_CONFIG = {
  maxVisibleActivities: 14,
  activityRowHeight: 24,
  staggeredAnimationLimit: 10,
  fontSize: 'text-[13px]',
  iconSize: 'w-3 h-3',
  spinnerSize: 'w-3 h-3',
}
```

---

## 4. 滚动内容淡出效果

### 暗色模式下的淡出遮罩

```tsx
<div
  className="pl-[22px] pr-4 py-3 text-sm overflow-y-auto"
  style={{
    maxHeight: MAX_HEIGHT,
    // Subtle fade at top and bottom edges (16px) - only in dark mode
    ...(isDarkMode && {
      maskImage: 'linear-gradient(to bottom, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)',
      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)',
    }),
  }}
>
  {/* Content */}
</div>
```

### 常量定义

```tsx
// 最大高度 540px 带滚动
const MAX_HEIGHT = 540

// 淡出大小
const FADE_SIZE = 16 // 消息卡片内
const FADE_SIZE = 24 // 全屏 Overlay
```

---

## 5. DocumentFormattedMarkdownOverlay 集成

```tsx
{/* Fullscreen overlay for reading response/plan */}
<DocumentFormattedMarkdownOverlay
  content={text}
  isOpen={isFullscreen}
  onClose={() => setIsFullscreen(false)}
  variant={isPlan ? 'plan' : undefined}
  onOpenUrl={onOpenUrl}
  onOpenFile={onOpenFile}
/>
```

### 触发全屏

```tsx
const [isFullscreen, setIsFullscreen] = useState(false)

// View as Markdown 按钮点击
const handlePopOut = () => {
  setIsFullscreen(true)
}
```

---

## 6. 简化版实现 (适用于当前项目)

由于当前项目不使用 Radix Dialog，可以使用 Portal + 简单 Modal 实现：

### 简化版 FullscreenOverlay

```tsx
import { useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface FullscreenOverlayProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  copyContent?: string
}

const FADE_SIZE = 24
const HEADER_HEIGHT = 48
const FADE_MASK = `linear-gradient(to bottom, transparent 0px, black ${FADE_SIZE}px, black calc(100% - ${FADE_SIZE}px), transparent 100%)`

export function FullscreenOverlay({
  isOpen,
  onClose,
  children,
  title,
  copyContent
}: FullscreenOverlayProps) {
  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  // 防止背景滚动
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-10 h-12 flex items-center justify-between px-4 bg-gradient-to-b from-black/50 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {title && <span className="text-white/80 text-sm">{title}</span>}
        </div>
        <div className="flex items-center gap-2">
          {copyContent && <CopyButton content={copyContent} />}
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content with fade mask */}
      <div
        className="absolute inset-0"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-full overflow-y-auto"
          style={{
            paddingTop: HEADER_HEIGHT + FADE_SIZE,
            paddingBottom: FADE_SIZE
          }}
        >
          <div className="min-h-full flex flex-col justify-center px-6">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

---

## 7. 样式工具类 (可添加到 index.css)

```css
/* 成功色 */
.text-success {
  color: #22c55e;
}

/* 淡出遮罩 */
.fade-mask-vertical {
  mask-image: linear-gradient(to bottom, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%);
}

/* 全屏背景模糊 */
.fullscreen-overlay-background {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
```

---

## 8. 依赖说明

当前项目已有的依赖：
- `lucide-react` - Copy, Check, ExternalLink, X 图标
- `react` - createPortal, useState, useEffect, useCallback
- `tailwindcss` - 样式类

无需额外安装依赖。
