
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import Sidebar, { ChatFilter, SettingsTab } from './components/Sidebar';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import CommandPalette from './components/CommandPalette';
import SettingsPage from './components/SettingsPage';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import { ChatSession, ChatMessage, SESSION_STATUS_CONFIG } from './types';
import {
  Workspace,
  getWorkspaces,
  getCurrentWorkspace,
  addWorkspace,
  setCurrentWorkspace,
  removeWorkspace,
  openDirectoryDialog,
  setWorkspaceBackend,
  getApiSettings,
  saveApiSettings,
  type ApiSettings,
  DEFAULT_API_SETTINGS,
} from './lib/tauri-api';
import {
  createSession as storageCreateSession,
  listSessions,
  loadSessionMessages,
  saveSession,
  deleteSession as storageDeleteSession,
  updateSessionHeader,
} from './lib/session-storage';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);  // 当前 workspace 的 sessions
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(DEFAULT_API_SETTINGS);

  // Load API settings on mount
  useEffect(() => {
    getApiSettings().then(settings => setApiSettings(settings));
  }, []);

  // Save API settings handler
  const handleSaveApiSettings = useCallback(async (settings: ApiSettings) => {
    setApiSettings(settings);
    await saveApiSettings(settings);
  }, []);

  // Open settings with optional tab
  const openSettings = useCallback((tab?: SettingsTab) => {
    if (tab) {
      setSettingsTab(tab);
    }
    setIsSettingsOpen(true);
  }, []);

  // Filter sessions based on current filter
  const filteredSessions = useMemo(() => {
    if (filter === 'all') {
      return sessions;
    }
    if (filter === 'flagged') {
      return sessions.filter(s => s.isFlagged);
    }
    // Filter by label
    if (filter.startsWith('label:')) {
      const labelId = filter.replace('label:', '');
      return sessions.filter(s => s.labels?.includes(labelId));
    }
    // Filter by status
    return sessions.filter(s => s.status === filter);
  }, [sessions, filter]);

  // Load sessions for a workspace from JSONL storage
  const loadSessionsForWorkspace = useCallback(async (workspacePath: string | null) => {
    try {
      const loadedSessions = await listSessions(workspacePath);
      setSessions(loadedSessions);
      return loadedSessions;
    } catch (e) {
      console.error('Failed to load sessions:', e);
      return [];
    }
  }, []);

  // Load messages for a session
  const loadMessagesForSession = useCallback(async (workspacePath: string | null, sessionId: string) => {
    try {
      const messages = await loadSessionMessages(workspacePath, sessionId);
      return messages;
    } catch (e) {
      console.error('Failed to load messages:', e);
      return [];
    }
  }, []);

  // Load workspaces and sessions on mount
  useEffect(() => {
    const loadData = async () => {
      // Load workspaces
      const ws = await getWorkspaces();
      setWorkspaces(ws);

      const currentPath = await getCurrentWorkspace();
      if (currentPath) {
        const current = ws.find(w => w.path === currentPath);
        if (current) {
          setCurrentWorkspaceState(current);
          // Load sessions for current workspace from SQLite
          const loadedSessions = await loadSessionsForWorkspace(currentPath);
          // Sync to backend
          try {
            await setWorkspaceBackend(currentPath);
          } catch (e) {
            console.error('Failed to set workspace backend:', e);
          }
          // Select first session if available
          if (loadedSessions.length > 0) {
            setActiveSessionId(loadedSessions[0].id);
          }
        }
      } else {
        // No workspace selected, show sessions without workspace
        const loadedSessions = await loadSessionsForWorkspace(null);
        if (loadedSessions.length > 0) {
          setActiveSessionId(loadedSessions[0].id);
        }
      }
    };
    loadData();
  }, [loadSessionsForWorkspace]);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) return;

    // Use currentWorkspace path for loading messages
    const workspacePath = currentWorkspace?.path || null;
    loadMessagesForSession(workspacePath, activeSessionId).then(messages => {
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, messages } : s
      ));
    });
  }, [activeSessionId, loadMessagesForSession, currentWorkspace?.path]);

  const handleOpenWorkspace = useCallback(async () => {
    const path = await openDirectoryDialog();
    if (path) {
      // Clear active session first to prevent race condition
      setActiveSessionId(null);

      const ws = await addWorkspace(path);
      setCurrentWorkspaceState(ws);
      // Sync to backend
      try {
        await setWorkspaceBackend(path);
      } catch (e) {
        console.error('Failed to set workspace backend:', e);
      }
      // Refresh workspaces list
      const updated = await getWorkspaces();
      setWorkspaces(updated);
      // Load sessions for new workspace from JSONL storage
      const workspaceSessions = await loadSessionsForWorkspace(path);
      setActiveSessionId(workspaceSessions.length > 0 ? workspaceSessions[0].id : null);
    }
  }, [loadSessionsForWorkspace]);

  const handleSelectWorkspace = useCallback(async (workspace: Workspace) => {
    // Clear active session first to prevent race condition
    setActiveSessionId(null);

    await setCurrentWorkspace(workspace.path);
    setCurrentWorkspaceState(workspace);
    // Sync to backend
    try {
      await setWorkspaceBackend(workspace.path);
    } catch (e) {
      console.error('Failed to set workspace backend:', e);
    }
    // Update lastUsed
    await addWorkspace(workspace.path);
    const updated = await getWorkspaces();
    setWorkspaces(updated);
    // Load sessions for selected workspace from JSONL storage
    const workspaceSessions = await loadSessionsForWorkspace(workspace.path);
    // Set active session after sessions are loaded
    setActiveSessionId(workspaceSessions.length > 0 ? workspaceSessions[0].id : null);
  }, [loadSessionsForWorkspace]);

  const handleRemoveWorkspace = useCallback(async (path: string) => {
    await removeWorkspace(path);
    const updated = await getWorkspaces();
    setWorkspaces(updated);

    // If removing current workspace, switch to another
    if (currentWorkspace?.path === path) {
      // Clear active session first to prevent race condition
      setActiveSessionId(null);

      if (updated.length > 0) {
        const newWorkspace = updated[0];
        setCurrentWorkspaceState(newWorkspace);
        await setCurrentWorkspace(newWorkspace.path);
        // Load sessions from JSONL storage
        const workspaceSessions = await loadSessionsForWorkspace(newWorkspace.path);
        setActiveSessionId(workspaceSessions.length > 0 ? workspaceSessions[0].id : null);
        // Sync to backend
        try {
          await setWorkspaceBackend(newWorkspace.path);
        } catch (e) {
          console.error('Failed to set workspace backend:', e);
        }
      } else {
        setCurrentWorkspaceState(null);
        // Show sessions without workspace from JSONL storage
        const noWorkspaceSessions = await loadSessionsForWorkspace(null);
        setActiveSessionId(noWorkspaceSessions.length > 0 ? noWorkspaceSessions[0].id : null);
      }
    }
  }, [currentWorkspace, loadSessionsForWorkspace]);

  const createNewSession = useCallback(async () => {
    try {
      // Create session in JSONL storage
      const newSession = await storageCreateSession(
        currentWorkspace?.path || null,
        'New Conversation'
      );

      // Update local state
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  }, [currentWorkspace]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  // Global keyboard shortcuts (Cmd+K, Cmd+N, Cmd+,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K: Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
      // Cmd+N: New session
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createNewSession();
      }
      // Cmd+,: Open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
      // Cmd+/: Show shortcuts help
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsShortcutsHelpOpen(true);
      }
      // Cmd+\: Toggle focus mode
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setIsFocusMode(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [createNewSession]);

  // Handle session update (flag, status, title changes)
  const handleUpdateSession = useCallback(async (updatedSession: ChatSession) => {
    // Update local state
    setSessions(prev => prev.map(s =>
      s.id === updatedSession.id ? updatedSession : s
    ));

    // Persist changes to JSONL storage
    try {
      await updateSessionHeader(
        updatedSession.workspacePath || null,
        updatedSession.id,
        {
          title: updatedSession.title,
          isFlagged: updatedSession.isFlagged,
          status: updatedSession.status,
          hasUnread: updatedSession.hasUnread,
          labels: updatedSession.labels,
        }
      );
    } catch (e) {
      console.error('Failed to update session:', e);
    }
  }, []);

  // Handle session deletion
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      const sessionToDelete = sessions.find(s => s.id === sessionId);
      const workspacePath = sessionToDelete?.workspacePath || currentWorkspace?.path || null;

      await storageDeleteSession(workspacePath, sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      // If deleted the active session, select another
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  }, [activeSessionId, sessions, currentWorkspace]);

  const handleUpdateMessages = useCallback(async (sessionId: string, messages: ChatMessage[]) => {
    // Helper to update a session
    const updateSession = (s: ChatSession): ChatSession => {
      if (s.id === sessionId) {
        const firstUserMsg = messages.find(m => m.role === 'user' && m.content);
        const newTitle = firstUserMsg
          ? (firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : ''))
          : s.title;
        return {
          ...s,
          messages,
          updatedAt: new Date(),
          title: newTitle
        };
      }
      return s;
    };

    // Update local state and persist to JSONL
    setSessions(prev => {
      const updated = prev.map(updateSession);
      // Save full session to JSONL storage
      const session = updated.find(s => s.id === sessionId);
      if (session) {
        saveSession(session).catch(e => console.error('Failed to save session:', e));
      }
      return updated;
    });
  }, []);

  return (
    <div className="flex h-screen w-full bg-gray-100 dark:bg-gray-900 overflow-hidden transition-colors">
      {/* Sidebar - Navigation (hidden in focus mode) */}
      {!isFocusMode && (
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 transition-colors">
          <Sidebar
            onNewChat={createNewSession}
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
            onSelectWorkspace={handleSelectWorkspace}
            onOpenWorkspace={handleOpenWorkspace}
            onRemoveWorkspace={handleRemoveWorkspace}
            filter={filter}
            onFilterChange={setFilter}
            sessions={sessions}
            onOpenSettings={openSettings}
          />
        </div>
      )}

      {/* Middle - Chat History List (hidden in focus mode) */}
      {!isFocusMode && (
        <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col flex-shrink-0 transition-colors">
          <ChatList
            sessions={filteredSessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewChat={createNewSession}
            onUpdateSession={handleUpdateSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>
      )}

      {/* Main Content - Active Chat */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 relative flex flex-col transition-colors">
        {/* Focus Mode Exit Button */}
        {isFocusMode && (
          <button
            onClick={() => setIsFocusMode(false)}
            className="absolute top-4 left-4 z-10 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            title="Exit focus mode (⌘\)"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        {activeSession ? (
          <ChatWindow
            session={activeSession}
            onUpdateMessages={(msgs) => handleUpdateMessages(activeSession.id, msgs)}
            onUpdateSession={handleUpdateSession}
            apiSettings={apiSettings}
            onSaveApiSettings={handleSaveApiSettings}
            onOpenSettings={openSettings}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">No conversations yet</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-xs">
              Conversations with your agent appear here. Start one to get going.
            </p>
            <button
              onClick={createNewSession}
              className="mt-6 px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            >
              New Conversation
            </button>
          </div>
        )}
      </div>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        sessions={sessions}
        onSelectSession={setActiveSessionId}
        onNewSession={createNewSession}
        onOpenSettings={openSettings}
      />

      {/* Settings Page (Cmd+,) */}
      <SettingsPage
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsTab}
        apiSettings={apiSettings}
        onSaveApiSettings={handleSaveApiSettings}
      />

      {/* Keyboard Shortcuts Help (Cmd+/) */}
      <KeyboardShortcutsHelp
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
      />
    </div>
  );
};

export default App;
