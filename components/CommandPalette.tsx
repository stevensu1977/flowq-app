import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  MessageSquare,
  FileText,
  Folder,
  Hash,
  Clock,
  ChevronRight,
  X,
  Plus,
  Settings,
  Command,
} from 'lucide-react';
import { ChatSession } from '../types';
import { matchesSearch, getMatchScore } from './SearchHighlight';

export type CommandItem = {
  id: string;
  type: 'session' | 'file' | 'folder' | 'action' | 'recent';
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: () => void;
  shortcut?: string;
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (sessionId: string) => void;
  onNewSession?: () => void;
  onOpenSettings?: () => void;
  recentFiles?: string[];
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onNewSession,
  onOpenSettings,
  recentFiles = [],
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build searchable items
  const items = useMemo(() => {
    const result: CommandItem[] = [];

    // Actions (always shown)
    if (!query || 'new session'.includes(query.toLowerCase()) || 'create'.includes(query.toLowerCase())) {
      result.push({
        id: 'action-new',
        type: 'action',
        title: 'New Session',
        subtitle: 'Start a new chat session',
        icon: <Plus size={16} className="text-green-500" />,
        action: () => {
          onNewSession?.();
          onClose();
        },
        shortcut: '⌘N',
      });
    }

    if (!query || 'settings'.includes(query.toLowerCase())) {
      result.push({
        id: 'action-settings',
        type: 'action',
        title: 'Settings',
        subtitle: 'Open application settings',
        icon: <Settings size={16} className="text-gray-500" />,
        action: () => {
          onOpenSettings?.();
          onClose();
        },
        shortcut: '⌘,',
      });
    }

    // Sessions
    const filteredSessions = sessions
      .filter((s) => !query || matchesSearch(s.title, query) || matchesSearch(s.messages.map(m => m.content).join(' '), query))
      .sort((a, b) => {
        if (!query) {
          // Sort by most recent
          const aTime = a.messages.length > 0 ? new Date(a.messages[a.messages.length - 1].timestamp).getTime() : 0;
          const bTime = b.messages.length > 0 ? new Date(b.messages[b.messages.length - 1].timestamp).getTime() : 0;
          return bTime - aTime;
        }
        // Sort by match score
        return getMatchScore(b.title, query) - getMatchScore(a.title, query);
      })
      .slice(0, 8);

    filteredSessions.forEach((session) => {
      const lastMessage = session.messages[session.messages.length - 1];
      result.push({
        id: `session-${session.id}`,
        type: 'session',
        title: session.title,
        subtitle: lastMessage ? lastMessage.content.slice(0, 60) + (lastMessage.content.length > 60 ? '...' : '') : 'No messages',
        icon: <MessageSquare size={16} className="text-indigo-500" />,
        action: () => {
          onSelectSession(session.id);
          onClose();
        },
      });
    });

    // Recent files
    recentFiles
      .filter((f) => !query || matchesSearch(f, query))
      .slice(0, 5)
      .forEach((file) => {
        const fileName = file.split('/').pop() || file;
        const isFolder = !fileName.includes('.');
        result.push({
          id: `file-${file}`,
          type: isFolder ? 'folder' : 'file',
          title: fileName,
          subtitle: file,
          icon: isFolder ? (
            <Folder size={16} className="text-amber-500" />
          ) : (
            <FileText size={16} className="text-blue-500" />
          ),
          action: () => {
            // TODO: Open file
            onClose();
          },
        });
      });

    return result;
  }, [query, sessions, recentFiles, onSelectSession, onNewSession, onOpenSettings, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedItem = items[selectedIndex];
        if (selectedItem?.action) {
          selectedItem.action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [items, selectedIndex, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement) return;

    const selectedElement = listElement.children[selectedIndex] as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search size={18} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search sessions, files, or actions..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
          />
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-medium text-gray-500 dark:text-gray-400">
            <Command size={10} />
            <span>K</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No results found</p>
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                onClick={item.action}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === selectedIndex
                    ? 'bg-indigo-50 dark:bg-indigo-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex-shrink-0">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium truncate ${
                        index === selectedIndex
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.type === 'action' && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 rounded">
                        ACTION
                      </span>
                    )}
                  </div>
                  {item.subtitle && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {item.subtitle}
                    </p>
                  )}
                </div>
                {item.shortcut && (
                  <div className="flex-shrink-0 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-medium text-gray-500 dark:text-gray-400">
                    {item.shortcut}
                  </div>
                )}
                <ChevronRight
                  size={14}
                  className={`flex-shrink-0 ${
                    index === selectedIndex ? 'text-indigo-400' : 'text-gray-300 dark:text-gray-600'
                  }`}
                />
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">esc</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
