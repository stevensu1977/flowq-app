/**
 * DocumentMarkdownOverlay - Fullscreen Markdown document preview
 *
 * A specialized overlay for viewing Markdown content in a clean,
 * readable format. Built on top of FullscreenOverlay.
 *
 * Features:
 * - Fullscreen Markdown rendering
 * - Copy entire content to clipboard
 * - Clean white card presentation
 * - Scrollable content with edge fade
 */

import { FullscreenOverlay } from '../ui/FullscreenOverlay';
import MarkdownContent from '../MarkdownContent';

export interface DocumentMarkdownOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** Callback when the overlay should close */
  onClose: () => void;
  /** Markdown content to display */
  content: string;
  /** Optional title for the header */
  title?: string;
}

export function DocumentMarkdownOverlay({
  isOpen,
  onClose,
  content,
  title = 'Document Preview'
}: DocumentMarkdownOverlayProps) {
  if (!content) return null;

  return (
    <FullscreenOverlay
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      copyContent={content}
    >
      <div className="bg-white rounded-2xl p-8 shadow-lg max-w-none">
        <MarkdownContent content={content} />
      </div>
    </FullscreenOverlay>
  );
}
