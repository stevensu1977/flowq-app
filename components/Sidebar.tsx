
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  MessageSquare,
  Flag,
  Activity,
  Tag,
  Link2,
  FolderOpen,
  Plug,
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
export type SettingsTab = 'preferences' | 'providers' | 'integrations' | 'mcp' | 'skills' | 'permissions' | 'appearance' | 'shortcuts';

interface SidebarProps {
  onNewChat: () => void;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  /** Callback to open current workspace in file manager */
  onOpenDirectory?: (path: string) => void;
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
  onOpenDirectory,
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
          ? 'bg-accent/10 text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
    <div className="flex flex-col h-full p-4 gap-6 paper-texture">
      <button
        onClick={onNewChat}
        className="sidebar-animate w-full flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm font-medium hover:bg-muted transition-all shadow-sm active:scale-95 relative z-10"
      >
        <Plus size={18} />
        New Chat
      </button>

      <div className="space-y-1 relative z-10">
        <div className="sidebar-animate">
          <NavItem
            icon={MessageSquare}
            label="All Chats"
            active={filter === 'all'}
            onClick={() => onFilterChange?.('all')}
          />
        </div>
        <div className="sidebar-animate">
          <NavItem
            icon={Flag}
            label="Flagged"
            active={filter === 'flagged'}
            onClick={() => onFilterChange?.('flagged')}
          />
        </div>

        {/* Status - Expandable */}
        <div className="sidebar-animate">
          <button
            type="button"
            onClick={() => setIsStatusExpanded(!isStatusExpanded)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              isStatusFilter(filter)
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
        <div className="sidebar-animate">
          <button
            type="button"
            onClick={() => setIsLabelsExpanded(!isLabelsExpanded)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              isLabelFilter(filter)
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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

      {/* SOURCES - Data integrations */}
      <div className="space-y-1 relative z-10">
        <h3 className="sidebar-animate px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sources</h3>
        <div className="sidebar-animate">
          <NavItem icon={Link2} label="Integrations" onClick={() => onOpenSettings?.('integrations')} />
        </div>
        <div className="sidebar-animate">
          <NavItem icon={FolderOpen} label="Local Folders" />
        </div>
      </div>

      {/* TOOLS - AI capabilities */}
      <div className="space-y-1 relative z-10">
        <h3 className="sidebar-animate px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tools</h3>
        <div className="sidebar-animate">
          <NavItem icon={Plug} label="MCP Servers" onClick={() => onOpenSettings?.('mcp')} />
        </div>
        <div className="sidebar-animate">
          <NavItem icon={Zap} label="Skills" onClick={() => onOpenSettings?.('skills')} />
        </div>
      </div>

      {/* Settings & Theme */}
      <div className="space-y-1 relative z-10">
        <div className="sidebar-animate">
          <NavItem icon={Settings} label="Settings" onClick={() => onOpenSettings?.()} />
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="sidebar-animate w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {resolvedTheme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          <span className="text-sm font-medium flex-1 text-left">
            {resolvedTheme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </button>
      </div>

      {/* Workspace Selector */}
      <div className="mt-auto pt-4 border-t border-border relative" ref={menuRef}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="flex-1 flex items-center justify-between px-2 py-2 rounded-lg hover:bg-muted transition-colors min-w-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs flex-shrink-0">
                {initials}
              </div>
              <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
              <div className="w-2 h-2 rounded-full bg-success flex-shrink-0"></div>
            </div>
            <ChevronDown
              size={16}
              className={`text-muted-foreground transition-transform flex-shrink-0 ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {/* Open in Finder button */}
          {currentWorkspace && onOpenDirectory && (
            <button
              onClick={() => onOpenDirectory(currentWorkspace.path)}
              className="p-2 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
              title="Open in Finder"
            >
              <FolderOpen size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Workspace Dropdown Menu */}
        {isWorkspaceMenuOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-card rounded-xl shadow-lg border border-border overflow-hidden z-50">
            <div className="p-2 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2">Workspaces</span>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {workspaces.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  No workspaces yet
                </div>
              ) : (
                workspaces.map((ws) => (
                  <div
                    key={ws.path}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer group"
                    onClick={() => {
                      onSelectWorkspace(ws);
                      setIsWorkspaceMenuOpen(false);
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-[10px] flex-shrink-0">
                      {getInitials(ws.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{ws.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{ws.path}</div>
                    </div>
                    {currentWorkspace?.path === ws.path && (
                      <Check size={14} className="text-success flex-shrink-0" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWorkspace(ws.path);
                      }}
                      className="p-1 rounded hover:bg-border opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <X size={12} className="text-muted-foreground" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-2 border-t border-border">
              <button
                onClick={() => {
                  onOpenWorkspace();
                  setIsWorkspaceMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors"
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
