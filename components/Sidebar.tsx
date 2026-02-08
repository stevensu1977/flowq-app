
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  MessageSquare,
  Flag,
  Activity,
  Tag,
  Database,
  Cpu,
  FolderOpen,
  Zap,
  Settings,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  FolderPlus,
  Circle,
  CircleDot,
  CircleAlert,
  CircleCheck,
  CircleX,
  Moon,
  Sun,
} from 'lucide-react';
import { Workspace } from '../lib/tauri-api';
import { SessionStatus, SESSION_STATUS_CONFIG, ChatSession, SessionLabel, DEFAULT_SESSION_LABELS } from '../types';
import { useTheme } from '../context/ThemeContext';

/**
 * Filter type for chat list
 * - 'all': Show all chats
 * - 'flagged': Show only flagged chats
 * - SessionStatus: Show chats with specific status
 * - `label:${labelId}`: Show chats with specific label
 */
export type ChatFilter = 'all' | 'flagged' | SessionStatus | `label:${string}`;

/** Settings tab types */
export type SettingsTab = 'general' | 'apis' | 'mcp' | 'skills' | 'permissions' | 'appearance' | 'shortcuts';

interface SidebarProps {
  onNewChat: () => void;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  /** Current filter */
  filter?: ChatFilter;
  /** Callback when filter changes */
  onFilterChange?: (filter: ChatFilter) => void;
  /** Sessions for counting status */
  sessions?: ChatSession[];
  /** Callback to open settings with optional tab */
  onOpenSettings?: (tab?: SettingsTab) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onNewChat,
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  onOpenWorkspace,
  onRemoveWorkspace,
  filter = 'all',
  onFilterChange,
  sessions = [],
  onOpenSettings,
}) => {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isStatusExpanded, setIsStatusExpanded] = useState(false);
  const [isLabelsExpanded, setIsLabelsExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, toggleTheme } = useTheme();

  // Calculate status counts
  const statusCounts = SESSION_STATUS_CONFIG.reduce((acc, config) => {
    acc[config.id] = sessions.filter(s => s.status === config.id).length;
    return acc;
  }, {} as Record<SessionStatus, number>);

  // Calculate label counts
  const labelCounts = DEFAULT_SESSION_LABELS.reduce((acc, label) => {
    acc[label.id] = sessions.filter(s => s.labels?.includes(label.id)).length;
    return acc;
  }, {} as Record<string, number>);

  // Close workspace menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Status icon component
  const StatusIcon: React.FC<{ status: SessionStatus; size?: number }> = ({ status, size = 14 }) => {
    const config = SESSION_STATUS_CONFIG.find(s => s.id === status);
    if (!config) return <Circle size={size} />;

    const iconMap: Record<string, React.ReactNode> = {
      'Circle': <Circle size={size} />,
      'CircleDot': <CircleDot size={size} />,
      'CircleAlert': <CircleAlert size={size} />,
      'CircleCheck': <CircleCheck size={size} />,
      'CircleX': <CircleX size={size} />,
    };

    return (
      <span style={{ color: config.color }}>
        {iconMap[config.icon] || <Circle size={size} />}
      </span>
    );
  };

  // Check if a status is currently selected
  const isStatusFilter = (f: ChatFilter): f is SessionStatus => {
    return SESSION_STATUS_CONFIG.some(s => s.id === f);
  };

  // Check if a label filter is currently selected
  const isLabelFilter = (f: ChatFilter): f is `label:${string}` => {
    return typeof f === 'string' && f.startsWith('label:');
  };

  // Get label id from filter
  const getLabelIdFromFilter = (f: ChatFilter): string | null => {
    if (isLabelFilter(f)) {
      return f.replace('label:', '');
    }
    return null;
  };

  const NavItem = ({
    icon: Icon,
    label,
    active = false,
    onClick,
    hasSubmenu = false
  }: {
    icon: any,
    label: string,
    active?: boolean,
    onClick?: () => void,
    hasSubmenu?: boolean
  }) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        active
          ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <Icon size={18} />
      <span className="text-sm font-medium flex-1 text-left">{label}</span>
      {hasSubmenu && <ChevronRight size={14} className="text-gray-400" />}
    </button>
  );

  // Get initials from workspace name
  const getInitials = (name: string) => {
    return name
      .split(/[-_\s]/)
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'WS';
  };

  const displayName = currentWorkspace?.name || 'No Workspace';
  const initials = currentWorkspace ? getInitials(currentWorkspace.name) : 'NW';

  return (
    <div className="flex flex-col h-full p-4 gap-6">
      <button
        onClick={onNewChat}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm active:scale-95"
      >
        <Plus size={18} />
        New Chat
      </button>

      <div className="space-y-1">
        <NavItem
          icon={MessageSquare}
          label="All Chats"
          active={filter === 'all'}
          onClick={() => onFilterChange?.('all')}
        />
        <NavItem
          icon={Flag}
          label="Flagged"
          active={filter === 'flagged'}
          onClick={() => onFilterChange?.('flagged')}
        />

        {/* Status - Expandable */}
        <div>
          <button
            type="button"
            onClick={() => setIsStatusExpanded(!isStatusExpanded)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              isStatusFilter(filter)
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Activity size={18} />
            <span className="text-sm font-medium flex-1 text-left">Status</span>
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform ${isStatusExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Status options - Inline expanded */}
          {isStatusExpanded && (
            <div className="ml-4 mt-1 space-y-0.5">
              {SESSION_STATUS_CONFIG.map((statusConfig) => (
                <button
                  key={statusConfig.id}
                  type="button"
                  onClick={() => onFilterChange?.(statusConfig.id)}
                  className={`w-full px-3 py-1.5 flex items-center gap-2 rounded-lg transition-colors ${
                    filter === statusConfig.id
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <StatusIcon status={statusConfig.id} size={16} />
                  <span className="flex-1 text-left text-sm">{statusConfig.label}</span>
                  <span className="text-xs text-gray-400">{statusCounts[statusConfig.id]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Labels - Expandable */}
        <div>
          <button
            type="button"
            onClick={() => setIsLabelsExpanded(!isLabelsExpanded)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              isLabelFilter(filter)
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Tag size={18} />
            <span className="text-sm font-medium flex-1 text-left">Labels</span>
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform ${isLabelsExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Label options - Inline expanded */}
          {isLabelsExpanded && (
            <div className="ml-4 mt-1 space-y-0.5">
              {DEFAULT_SESSION_LABELS.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => onFilterChange?.(`label:${label.id}`)}
                  className={`w-full px-3 py-1.5 flex items-center gap-2 rounded-lg transition-colors ${
                    getLabelIdFromFilter(filter) === label.id
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 text-left text-sm">{label.name}</span>
                  <span className="text-xs text-gray-400">{labelCounts[label.id]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="px-3 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Sources</h3>
        <NavItem icon={Database} label="APIs" onClick={() => onOpenSettings?.('apis')} />
        <NavItem icon={Cpu} label="MCPs" onClick={() => onOpenSettings?.('mcp')} />
        <NavItem icon={FolderOpen} label="Local Folders" />
      </div>

      <div className="space-y-1">
        <NavItem icon={Zap} label="Skills" onClick={() => onOpenSettings?.('skills')} />
        <NavItem icon={Settings} label="Settings" onClick={() => onOpenSettings?.()} />

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {resolvedTheme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          <span className="text-sm font-medium flex-1 text-left">
            {resolvedTheme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </button>
      </div>

      {/* Workspace Selector */}
      <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700 relative" ref={menuRef}>
        <button
          onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
          className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs flex-shrink-0">
              {initials}
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{displayName}</span>
            <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
          </div>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform flex-shrink-0 ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Workspace Dropdown Menu */}
        {isWorkspaceMenuOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2">Workspaces</span>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {workspaces.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">
                  No workspaces yet
                </div>
              ) : (
                workspaces.map((ws) => (
                  <div
                    key={ws.path}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer group"
                    onClick={() => {
                      onSelectWorkspace(ws);
                      setIsWorkspaceMenuOpen(false);
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-[10px] flex-shrink-0">
                      {getInitials(ws.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{ws.name}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{ws.path}</div>
                    </div>
                    {currentWorkspace?.path === ws.path && (
                      <Check size={14} className="text-green-500 flex-shrink-0" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWorkspace(ws.path);
                      }}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <X size={12} className="text-gray-400" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => {
                  onOpenWorkspace();
                  setIsWorkspaceMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <FolderPlus size={16} />
                Open Folder...
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
