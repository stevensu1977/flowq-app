/**
 * FullscreenOverlay - Base component for fullscreen overlays
 *
 * Features:
 * - Portal rendering to document.body
 * - ESC key to close
 * - Prevents background scrolling
 * - Edge fade effect (iOS-style)
 * - Floating header with close and copy buttons
 * - Content scrolls behind the header
 */

import { useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { CopyButton } from './CopyButton'

// Layout constants
const HEADER_HEIGHT = 48
const FADE_SIZE = 24

// CSS mask gradient for edge fade effect
const FADE_MASK = `linear-gradient(to bottom, transparent 0px, black ${FADE_SIZE}px, black calc(100% - ${FADE_SIZE}px), transparent 100%)`

export interface FullscreenOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean
  /** Callback when the overlay should close */
  onClose: () => void
  /** Content to render inside the overlay */
  children: ReactNode
  /** Optional title displayed in the header */
  title?: string
  /** Optional content to enable copy button in header */
  copyContent?: string
  /** Optional additional className */
  className?: string
  /** Background color/style (default: bg-black/85) */
  bgClassName?: string
  /** Content max width (default: 850px) */
  maxWidth?: number
}

export function FullscreenOverlay({
  isOpen,
  onClose,
  children,
  title,
  copyContent,
  className = '',
  bgClassName = 'bg-black/85',
  maxWidth = 850
}: FullscreenOverlayProps) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  // Prevent background scrolling
  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  const contentPaddingTop = HEADER_HEIGHT + FADE_SIZE

  return createPortal(
    <div
      className={`fixed inset-0 z-50 ${bgClassName} ${className}`}
      onClick={onClose}
    >
      {/* Floating Header - stays on top */}
      <div
        className="absolute top-0 left-0 right-0 z-10 h-12 flex items-center justify-between px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left side - title */}
        <div className="flex items-center gap-2 min-w-0">
          {title && (
            <span className="text-white/80 text-sm font-medium truncate">
              {title}
            </span>
          )}
        </div>

        {/* Right side - copy + close */}
        <div className="flex items-center gap-1">
          {copyContent && (
            <CopyButton
              content={copyContent}
              className="text-white/60 hover:text-white hover:bg-white/10"
              iconSize={16}
            />
          )}
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content area with fade mask */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: FADE_MASK,
          WebkitMaskImage: FADE_MASK
        }}
      >
        <div
          className="h-full overflow-y-auto"
          style={{
            paddingTop: contentPaddingTop,
            paddingBottom: FADE_SIZE,
            scrollPaddingTop: contentPaddingTop
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Centering wrapper */}
          <div className="min-h-full flex flex-col justify-start px-6">
            <div
              className="mx-auto w-full"
              style={{ maxWidth }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
