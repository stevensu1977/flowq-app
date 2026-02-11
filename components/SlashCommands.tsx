import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  FileSearch,
  Settings,
  History,
  Trash2,
  RefreshCw,
  HelpCircle,
  Code,
  Bug,
  Wand2,
  GitBranch,
  FileEdit,
} from 'lucide-react';

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  action?: 'insert' | 'execute';
  insertText?: string;
}

// Default available commands
export const DEFAULT_COMMANDS: SlashCommand[] = [
  {
    id: 'fix',
    name: '/fix',
    description: 'Fix bugs or issues in the code',
    icon: <Bug size={14} className="text-red-500" />,
    action: 'insert',
    insertText: '/fix ',
  },
  {
    id: 'explain',
    name: '/explain',
    description: 'Explain how the code works',
    icon: <HelpCircle size={14} className="text-blue-500" />,
    action: 'insert',
    insertText: '/explain ',
  },
  {
    id: 'refactor',
    name: '/refactor',
    description: 'Refactor and improve code quality',
    icon: <Wand2 size={14} className="text-purple-500" />,
    action: 'insert',
    insertText: '/refactor ',
  },
  {
    id: 'test',
    name: '/test',
    description: 'Generate tests for the code',
    icon: <Code size={14} className="text-green-500" />,
    action: 'insert',
    insertText: '/test ',
  },
  {
    id: 'edit',
    name: '/edit',
    description: 'Edit a specific file',
    icon: <FileEdit size={14} className="text-amber-500" />,
    action: 'insert',
    insertText: '/edit ',
  },
  {
    id: 'run',
    name: '/run',
    description: 'Run a command in terminal',
    icon: <Terminal size={14} className="text-gray-500" />,
    action: 'insert',
    insertText: '/run ',
  },
  {
    id: 'search',
    name: '/search',
    description: 'Search files in workspace',
    icon: <FileSearch size={14} className="text-cyan-500" />,
    action: 'insert',
    insertText: '/search ',
  },
  {
    id: 'git',
    name: '/git',
    description: 'Git operations (commit, push, etc)',
    icon: <GitBranch size={14} className="text-orange-500" />,
    action: 'insert',
    insertText: '/git ',
  },
  {
    id: 'clear',
    name: '/clear',
    description: 'Clear conversation history',
    icon: <Trash2 size={14} className="text-red-400" />,
    action: 'execute',
  },
  {
    id: 'reset',
    name: '/reset',
    description: 'Reset session state',
    icon: <RefreshCw size={14} className="text-gray-400" />,
    action: 'execute',
  },
  {
    id: 'history',
    name: '/history',
    description: 'View command history',
    icon: <History size={14} className="text-gray-400" />,
    action: 'execute',
  },
  {
    id: 'settings',
    name: '/settings',
    description: 'Open settings',
    icon: <Settings size={14} className="text-gray-400" />,
    action: 'execute',
  },
];

interface SlashCommandsProps {
  query: string;
  isVisible: boolean;
  position: { top: number; left: number };
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  commands?: SlashCommand[];
}

const SlashCommands: React.FC<SlashCommandsProps> = ({
  query,
  isVisible,
  position,
  onSelect,
  onClose,
  commands = DEFAULT_COMMANDS,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter commands by query
  const filteredCommands = commands.filter(
    cmd =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
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
  }, [isVisible, filteredCommands, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredCommands.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredCommands.length]);

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-50 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[300px] max-w-[400px] animate-fade-in bottom-full mb-2 left-3"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Terminal size={12} />
          <span>Commands</span>
          {query && (
            <span className="ml-auto text-gray-400 dark:text-gray-500">
              {filteredCommands.length} result{filteredCommands.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Commands list */}
      <div ref={listRef} className="max-h-[280px] overflow-y-auto py-1">
        {filteredCommands.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
            No commands found
          </div>
        ) : (
          filteredCommands.map((command, index) => (
            <button
              key={command.id}
              onClick={() => onSelect(command)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
                index === selectedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
              }`}
            >
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                {command.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium font-mono">
                  {command.name}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {command.description}
                </div>
              </div>
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

export default SlashCommands;
