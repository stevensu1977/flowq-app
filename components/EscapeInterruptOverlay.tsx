import React, { useEffect, useCallback } from 'react';
import { StopCircle, X } from 'lucide-react';

interface EscapeInterruptOverlayProps {
  isVisible: boolean;
  onCancel: () => void;
  onDismiss: () => void;
}

const EscapeInterruptOverlay: React.FC<EscapeInterruptOverlayProps> = ({
  isVisible,
  onCancel,
  onDismiss,
}) => {
  // Handle Escape key - first press shows overlay, second press cancels
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isVisible) {
        // Second Escape press - confirm cancel
        onCancel();
      }
    }
  }, [isVisible, onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-dismiss after a few seconds if no action
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onDismiss]);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 pointer-events-none">
      <div className="flex justify-center pb-4">
        <div className="pointer-events-auto bg-gray-900/95 backdrop-blur-sm text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in">
          <StopCircle size={18} className="text-red-400" />
          <span className="text-sm">
            Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs font-mono mx-1">Esc</kbd> again to stop
          </span>
          <button
            onClick={onCancel}
            className="ml-2 px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Stop
          </button>
          <button
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default EscapeInterruptOverlay;
