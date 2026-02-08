/**
 * CopyButton - Reusable copy-to-clipboard button with feedback
 *
 * Shows copy icon initially, then check icon for 2 seconds after copying.
 * Supports both icon-only and icon+label variants.
 */

import { useCallback, useState } from 'react'
import { Copy, Check } from 'lucide-react'

export interface CopyButtonProps {
  /** Content to copy to clipboard */
  content: string
  /** Optional label to show next to icon */
  label?: string
  /** Show label text (default: false, icon only) */
  showLabel?: boolean
  /** Optional tooltip for the button */
  title?: string
  /** Optional className override */
  className?: string
  /** Icon size (default: 14) */
  iconSize?: number
}

export function CopyButton({
  content,
  label = 'Copy',
  showLabel = false,
  title = 'Copy to clipboard',
  className = '',
  iconSize = 14
}: CopyButtonProps) {
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

  const baseClasses = showLabel
    ? 'flex items-center gap-1.5 transition-colors select-none focus:outline-none'
    : 'flex items-center justify-center p-1.5 rounded-md transition-colors select-none focus:outline-none'

  const colorClasses = copied
    ? 'text-green-500'
    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'

  return (
    <button
      onClick={handleCopy}
      className={`${baseClasses} ${colorClasses} ${className}`}
      title={copied ? 'Copied!' : title}
    >
      {copied ? (
        <>
          <Check size={iconSize} />
          {showLabel && <span>Copied!</span>}
        </>
      ) : (
        <>
          <Copy size={iconSize} />
          {showLabel && <span>{label}</span>}
        </>
      )}
    </button>
  )
}
