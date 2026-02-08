import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Filter,
  Search,
  Flag,
  FlagOff,
  Trash2,
  Pencil,
  MoreHorizontal,
  Circle,
  CircleDot,
  CircleAlert,
  CircleCheck,
  CircleX,
  ChevronRight,
  Loader2,
  X,
  Tag,
} from 'lucide-react';
import { ChatSession, SessionStatus, SESSION_STATUS_CONFIG, DEFAULT_SESSION_LABELS } from '../types';
import SearchHighlight from './SearchHighlight';
import LabelBadge from './LabelBadge';

interface ChatListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onUpdateSession?: (session: ChatSession) => void;
  onDeleteSession?: (id: string) => void;
}

// Date grouping helper
type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

function getDateGroup(date: Date): DateGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const sessionDate = new Date(date);
  const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

  if (sessionDay >= today) return 'today';
  if (sessionDay >= yesterday) return 'yesterday';
  if (sessionDay >= weekAgo) return 'thisWeek';
  return 'older';
}

const dateGroupLabels: Record<DateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  older: 'Older',
};

// Simple fuzzy search
function fuzzySearch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Simple contains check
  if (lowerText.includes(lowerQuery)) return true;

  // Fuzzy match - check if all characters appear in order
  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
}

// Format time for display
function formatTime(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDate = new Date(date);
  const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

  // If today, show time
  if (sessionDay >= today) {
    return sessionDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // If this year, show month/day
  if (sessionDate.getFullYear() === now.getFullYear()) {
    return sessionDate.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
  }

  // Otherwise show full date
  return sessionDate.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Status icon component
const StatusIcon: React.FC<{ status?: SessionStatus; size?: number }> = ({ status = 'todo', size = 12 }) => {
  const config = SESSION_STATUS_CONFIG.find(s => s.id === status) || SESSION_STATUS_CONFIG[0];

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

// Context Menu Component
interface ContextMenuProps {
  x: number;
  y: number;
  session: ChatSession;
  onClose: () => void;
  onFlag: () => void;
  onUnflag: () => void;
  onStatusChange: (status: SessionStatus) => void;
  onLabelToggle: (labelId: string) => void;
  onRename: () => void;
  onDelete: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  session,
  onClose,
  onFlag,
  onUnflag,
  onStatusChange,
  onLabelToggle,
  onRename,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
  const [showLabelsSubmenu, setShowLabelsSubmenu] = useState(false);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 text-sm"
      style={{ top: y, left: x }}
    >
      {/* Status submenu */}
      <div
        className="relative"
        onMouseEnter={() => setShowStatusSubmenu(true)}
        onMouseLeave={() => setShowStatusSubmenu(false)}
      >
        <button className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
          <StatusIcon status={session.status} size={14} />
          <span className="flex-1 text-left">Status</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        {showStatusSubmenu && (
          <div className="absolute left-full top-0 ml-1 min-w-[160px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1">
            {SESSION_STATUS_CONFIG.map((statusConfig) => (
              <button
                key={statusConfig.id}
                onClick={() => {
                  onStatusChange(statusConfig.id);
                  onClose();
                }}
                className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 ${
                  session.status === statusConfig.id ? 'bg-gray-50 dark:bg-gray-700' : ''
                }`}
              >
                <StatusIcon status={statusConfig.id} size={14} />
                <span className="flex-1 text-left">{statusConfig.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Labels submenu */}
      <div
        className="relative"
        onMouseEnter={() => setShowLabelsSubmenu(true)}
        onMouseLeave={() => setShowLabelsSubmenu(false)}
      >
        <button className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
          <Tag size={14} className="text-gray-500" />
          <span className="flex-1 text-left">Labels</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        {showLabelsSubmenu && (
          <div className="absolute left-full top-0 ml-1 min-w-[160px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1">
            {DEFAULT_SESSION_LABELS.map((label) => {
              const isSelected = session.labels?.includes(label.id);
              return (
                <button
                  key={label.id}
                  onClick={() => {
                    onLabelToggle(label.id);
                  }}
                  className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 ${
                    isSelected ? 'bg-gray-50 dark:bg-gray-700' : ''
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 text-left">{label.name}</span>
                  {isSelected && (
                    <span className="text-indigo-500">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />

      {/* Flag/Unflag */}
      {!session.isFlagged ? (
        <button
          onClick={() => { onFlag(); onClose(); }}
          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
        >
          <Flag size={14} className="text-amber-500" />
          <span>Flag</span>
        </button>
      ) : (
        <button
          onClick={() => { onUnflag(); onClose(); }}
          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
        >
          <FlagOff size={14} />
          <span>Unflag</span>
        </button>
      )}

      <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />

      {/* Rename */}
      <button
        onClick={() => { onRename(); onClose(); }}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
      >
        <Pencil size={14} />
        <span>Rename</span>
      </button>

      <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />

      {/* Delete */}
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
      >
        <Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
  );
};

const ChatList: React.FC<ChatListProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onUpdateSession,
  onDeleteSession,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    session: ChatSession;
  } | null>(null);

  const [renameDialog, setRenameDialog] = useState<{
    session: ChatSession;
    newTitle: string;
  } | null>(null);

  // Inline editing state
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const inlineEditRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter and group sessions
  const { groupedSessions, filteredCount, flattenedItems } = useMemo(() => {
    // First filter by search query
    let filtered = sessions;
    if (searchQuery.trim()) {
      filtered = sessions.filter(session => {
        // Search in title
        if (fuzzySearch(session.title, searchQuery)) return true;
        // Search in messages
        return session.messages.some(msg => fuzzySearch(msg.content, searchQuery));
      });
    }

    // Group by date
    const groups: Record<DateGroup, ChatSession[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    filtered.forEach(session => {
      const group = getDateGroup(session.updatedAt);
      groups[group].push(session);
    });

    // Flatten for virtualization: headers + sessions as items
    type FlattenedItem =
      | { type: 'header'; group: DateGroup }
      | { type: 'session'; session: ChatSession };

    const items: FlattenedItem[] = [];
    const groupOrder: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'older'];

    groupOrder.forEach(group => {
      if (groups[group].length > 0) {
        items.push({ type: 'header', group });
        groups[group].forEach(session => {
          items.push({ type: 'session', session });
        });
      }
    });

    return { groupedSessions: groups, filteredCount: filtered.length, flattenedItems: items };
  }, [sessions, searchQuery]);

  // Virtual list container ref
  const parentRef = useRef<HTMLDivElement>(null);

  // Item heights for variable size list
  const HEADER_HEIGHT = 36;
  const SESSION_HEIGHT = 80; // Base height
  const SESSION_WITH_LABELS_HEIGHT = 100; // Height when labels are shown

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flattenedItems[index];
      if (!item) return SESSION_HEIGHT;
      if (item.type === 'header') return HEADER_HEIGHT;
      const hasLabels = item.session.labels && item.session.labels.length > 0;
      return hasLabels ? SESSION_WITH_LABELS_HEIGHT : SESSION_HEIGHT;
    },
    overscan: 5,
  });

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  const handleContextMenu = useCallback((e: React.MouseEvent, session: ChatSession) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, session });
  }, []);

  const handleFlag = useCallback((session: ChatSession) => {
    if (onUpdateSession) {
      onUpdateSession({ ...session, isFlagged: true });
    }
  }, [onUpdateSession]);

  const handleUnflag = useCallback((session: ChatSession) => {
    if (onUpdateSession) {
      onUpdateSession({ ...session, isFlagged: false });
    }
  }, [onUpdateSession]);

  const handleStatusChange = useCallback((session: ChatSession, status: SessionStatus) => {
    if (onUpdateSession) {
      onUpdateSession({ ...session, status });
    }
  }, [onUpdateSession]);

  // Inline edit handlers - must be defined before handleRename
  const startInlineEdit = useCallback((session: ChatSession, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setInlineEditId(session.id);
    setInlineEditValue(session.title);
    // Focus input after state update
    setTimeout(() => inlineEditRef.current?.focus(), 0);
  }, []);

  const cancelInlineEdit = useCallback(() => {
    setInlineEditId(null);
    setInlineEditValue('');
  }, []);

  const submitInlineEdit = useCallback(() => {
    if (inlineEditId && inlineEditValue.trim() && onUpdateSession) {
      const session = sessions.find(s => s.id === inlineEditId);
      if (session && session.title !== inlineEditValue.trim()) {
        onUpdateSession({ ...session, title: inlineEditValue.trim() });
      }
    }
    cancelInlineEdit();
  }, [inlineEditId, inlineEditValue, sessions, onUpdateSession, cancelInlineEdit]);

  const handleInlineEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitInlineEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInlineEdit();
    }
  }, [submitInlineEdit, cancelInlineEdit]);

  const handleRename = useCallback((session: ChatSession) => {
    // Use inline edit instead of dialog
    startInlineEdit(session);
  }, [startInlineEdit]);

  const handleRenameSubmit = useCallback(() => {
    if (renameDialog && onUpdateSession && renameDialog.newTitle.trim()) {
      onUpdateSession({ ...renameDialog.session, title: renameDialog.newTitle.trim() });
    }
    setRenameDialog(null);
  }, [renameDialog, onUpdateSession]);

  const handleDelete = useCallback((session: ChatSession) => {
    if (onDeleteSession) {
      onDeleteSession(session.id);
    }
  }, [onDeleteSession]);

  const handleLabelToggle = useCallback((session: ChatSession, labelId: string) => {
    if (onUpdateSession) {
      const currentLabels = session.labels || [];
      const newLabels = currentLabels.includes(labelId)
        ? currentLabels.filter((id) => id !== labelId)
        : [...currentLabels, labelId];
      onUpdateSession({ ...session, labels: newLabels });
    }
  }, [onUpdateSession]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200">All Chats</h2>
        <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
          <Filter size={18} />
        </button>
      </div>

      <div className="p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-10 pr-16 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            >
              <X size={14} />
            </button>
          ) : (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">
              ⌘K
            </span>
          )}
        </div>
        {searchQuery && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 px-1">
            {filteredCount} result{filteredCount !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {sessions.length === 0 ? (
          <div className="mt-20 text-center px-6">
            <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-3">
              <MessageSquareIcon size={20} className="text-gray-300 dark:text-gray-500" />
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">No recent activity</p>
          </div>
        ) : filteredCount === 0 ? (
          <div className="mt-20 text-center px-6">
            <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Search size={20} className="text-gray-300 dark:text-gray-500" />
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">No matching conversations</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-400"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div
            ref={parentRef}
            className="h-full overflow-auto px-2 pb-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = flattenedItems[virtualRow.index];
                if (!item) return null;

                if (item.type === 'header') {
                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="px-2 py-2"
                    >
                      <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        {dateGroupLabels[item.group]}
                      </span>
                    </div>
                  );
                }

                const session = item.session;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      onClick={() => onSelectSession(session.id)}
                      onContextMenu={(e) => handleContextMenu(e, session)}
                      className={`p-3 rounded-xl cursor-pointer transition-all border group ${
                        activeSessionId === session.id
                          ? 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 shadow-sm'
                          : 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {session.isProcessing ? (
                            <Loader2 size={12} className="text-indigo-500 animate-spin shrink-0" />
                          ) : (
                            <StatusIcon status={session.status} size={12} />
                          )}
                          {session.isFlagged && <Flag size={12} className="text-amber-500 shrink-0" />}
                          {inlineEditId === session.id ? (
                            <input
                              ref={inlineEditRef}
                              type="text"
                              value={inlineEditValue}
                              onChange={(e) => setInlineEditValue(e.target.value)}
                              onKeyDown={handleInlineEditKeyDown}
                              onBlur={submitInlineEdit}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-indigo-500 outline-none py-0 px-0 min-w-0 flex-1"
                              autoFocus
                            />
                          ) : (
                            <h3
                              onDoubleClick={(e) => startInlineEdit(session, e)}
                              className={`text-sm font-semibold truncate cursor-text ${
                                activeSessionId === session.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'
                              }`}
                              title="Double-click to edit"
                            >
                              {searchQuery ? (
                                <SearchHighlight text={session.title} query={searchQuery} />
                              ) : (
                                session.title
                              )}
                            </h3>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {session.hasUnread && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold text-white bg-indigo-500 rounded-full">
                              NEW
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {formatTime(session.updatedAt)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleContextMenu(e, session);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate pl-5">
                        {session.messages.length > 0 ? (
                          searchQuery ? (
                            <SearchHighlight
                              text={session.messages[session.messages.length - 1].content}
                              query={searchQuery}
                            />
                          ) : (
                            session.messages[session.messages.length - 1].content
                          )
                        ) : (
                          'Empty conversation'
                        )}
                      </p>
                      {session.labels && session.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 pl-5">
                          {session.labels.slice(0, 3).map((labelId) => (
                            <LabelBadge key={labelId} labelId={labelId} size="sm" />
                          ))}
                          {session.labels.length > 3 && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              +{session.labels.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          session={contextMenu.session}
          onClose={() => setContextMenu(null)}
          onFlag={() => handleFlag(contextMenu.session)}
          onUnflag={() => handleUnflag(contextMenu.session)}
          onStatusChange={(status) => handleStatusChange(contextMenu.session, status)}
          onLabelToggle={(labelId) => handleLabelToggle(contextMenu.session, labelId)}
          onRename={() => handleRename(contextMenu.session)}
          onDelete={() => handleDelete(contextMenu.session)}
        />
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setRenameDialog(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-[400px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Rename Chat</h3>
            <input
              type="text"
              value={renameDialog.newTitle}
              onChange={(e) => setRenameDialog({ ...renameDialog, newTitle: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setRenameDialog(null);
              }}
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameDialog(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="px-4 py-2 text-sm text-white bg-gray-800 dark:bg-indigo-600 hover:bg-gray-900 dark:hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MessageSquareIcon = ({ size, className }: { size: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

export default ChatList;
