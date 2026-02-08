import React, { useState, useEffect, useCallback, useRef } from 'react';
import { File, Folder, FileCode, Hash, User, Search } from 'lucide-react';

export interface MentionItem {
  id: string;
  type: 'file' | 'folder' | 'symbol' | 'user' | 'command';
  name: string;
  path?: string;
  description?: string;
}

interface MentionSuggestionsProps {
  query: string;
  isVisible: boolean;
  position: { top: number; left: number };
  items: MentionItem[];
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  isLoading?: boolean;
}

// Get icon for mention item
function getMentionIcon(type: MentionItem['type']) {
  const iconMap: Record<MentionItem['type'], React.ReactNode> = {
    file: <FileCode size={14} className="text-blue-500" />,
    folder: <Folder size={14} className="text-amber-500" />,
    symbol: <Hash size={14} className="text-purple-500" />,
    user: <User size={14} className="text-green-500" />,
    command: <span className="text-xs font-mono text-gray-500">/</span>,
  };
  return iconMap[type] || <File size={14} className="text-gray-400" />;
}

const MentionSuggestions: React.FC<MentionSuggestionsProps> = ({
  query,
  isVisible,
  position,
  items,
  onSelect,
  onClose,
  isLoading = false,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (items[selectedIndex]) {
            onSelect(items[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, items, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && items.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, items.length]);

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-50 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[280px] max-w-[400px] animate-fade-in"
      style={{ bottom: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Search size={12} />
          <span>
            {query ? `Searching for "${query}"` : 'Type to search files and symbols'}
          </span>
        </div>
      </div>

      {/* Items list */}
      <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
            <div className="animate-pulse">Searching...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
            {query ? 'No results found' : 'Start typing to search'}
          </div>
        ) : (
          items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                index === selectedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
              }`}
            >
              <span className="flex-shrink-0">
                {getMentionIcon(item.type)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {item.name}
                </div>
                {item.path && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                    {item.path}
                  </div>
                )}
                {item.description && !item.path && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                    {item.description}
                  </div>
                )}
              </div>
              <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 capitalize">
                {item.type}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-3">
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
        <span>Esc Cancel</span>
      </div>
    </div>
  );
};

export default MentionSuggestions;
