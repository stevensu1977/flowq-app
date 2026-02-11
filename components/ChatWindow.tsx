
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Paperclip,
  Database,
  Home,
  ChevronDown,
  Share2,
  Download,
  MoreVertical,
  Copy,
  Check,
  ExternalLink,
  Circle,
  CircleDot,
  CircleAlert,
  CircleCheck,
  CircleX,
  X,
  Square,
  FolderOpen,
  Brain,
} from 'lucide-react';
import { ChatSession, ChatMessage, Step, SessionStatus, SESSION_STATUS_CONFIG, ToolOutput, SessionTokenUsage, TokenUsage, ChatMode } from '../types';
import AgentSteps from './AgentSteps';
import ArchitectureDiagram from './ArchitectureDiagram';
import MarkdownContent from './MarkdownContent';
import { sendMessage, createSession, chatSend, searchWorkspaceFiles, readFileForMention, fetchUrlForMention, checkClaudeCode, browserRelayStatus, browserListTabs, browserAttachTab, browserSnapshot, type SessionEvent, type SimpleChatMessage, type ApiSettings, DEFAULT_API_SETTINGS, type WorkspaceFile, type ClaudeCodeStatus, type BrowserTab, type BrowserRelayStatus, type PageSnapshot } from '../lib/tauri-api';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { DocumentMarkdownOverlay } from './overlay/DocumentMarkdownOverlay';
import EscapeInterruptOverlay from './EscapeInterruptOverlay';
import Attachments, { Attachment } from './Attachments';
import MentionSuggestions, { MentionItem } from './MentionSuggestions';
import SlashCommands, { SlashCommand } from './SlashCommands';
import TokenUsageDisplay from './TokenUsageDisplay';
import PermissionCard, { PermissionRequest } from './PermissionCard';
import PermissionModeSelector, { PermissionMode } from './PermissionModeSelector';
import ChatModeSelector from './ChatModeSelector';
import type { SettingsTab } from './Sidebar';

// Message Action Bar Component
interface MessageActionsProps {
  content: string;
  onViewMarkdown: () => void;
}

const MessageActions: React.FC<MessageActionsProps> = ({ content, onViewMarkdown }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleCopy}
        className={`flex items-center gap-1.5 text-xs transition-colors select-none
          ${copied ? 'text-green-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}
        `}
      >
        {copied ? (
          <>
            <Check size={14} />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy size={14} />
            <span>Copy</span>
          </>
        )}
      </button>
      <button
        onClick={onViewMarkdown}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors select-none"
      >
        <ExternalLink size={14} />
        <span>View as Markdown</span>
      </button>
    </div>
  );
};

interface ChatWindowProps {
  session: ChatSession;
  onUpdateMessages: (messages: ChatMessage[]) => void;
  onUpdateSession?: (session: ChatSession) => void;
  apiSettings: ApiSettings;
  onSaveApiSettings: (settings: ApiSettings) => void;
  onOpenSettings?: (tab?: SettingsTab) => void;
  onSelectWorkspace?: () => void;
}

// Format timestamp for display
function formatMessageTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than a minute ago
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than an hour ago
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }

  // Today - show time
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  // Older - show date and time
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Status Icon Component
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

const ChatWindow: React.FC<ChatWindowProps> = ({ session, onUpdateMessages, onUpdateSession, apiSettings, onSaveApiSettings, onOpenSettings, onSelectWorkspace }) => {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [showInterruptOverlay, setShowInterruptOverlay] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mentionState, setMentionState] = useState<{
    isVisible: boolean;
    query: string;
    startIndex: number;
    position: { top: number; left: number };
  }>({ isVisible: false, query: '', startIndex: 0, position: { top: 0, left: 0 } });
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [isMentionLoading, setIsMentionLoading] = useState(false);
  const mentionSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const browserTabsRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const [slashCommandState, setSlashCommandState] = useState<{
    isVisible: boolean;
    query: string;
  }>({ isVisible: false, query: '' });
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [markdownOverlay, setMarkdownOverlay] = useState<{ isOpen: boolean; content: string }>({
    isOpen: false,
    content: ''
  });
  const [tokenUsage, setTokenUsage] = useState<SessionTokenUsage | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('ask');
  // Chat mode configuration
  const [chatMode, setChatMode] = useState<ChatMode>('agent');
  const [claudeCodeStatus, setClaudeCodeStatus] = useState<ClaudeCodeStatus | null>(null);
  const [showClaudeCodeWarning, setShowClaudeCodeWarning] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  // Chat history for simple chat mode (managed locally)
  const chatHistoryRef = useRef<SimpleChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(session.messages);
  const backendSessionIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  // Store browser snapshots for injection when sending message
  const browserSnapshotsRef = useRef<Map<number, { snapshot: PageSnapshot; title: string; url: string }>>(new Map());
  const streamingContentRef = useRef<string>('');

  // Keep messagesRef in sync with session.messages
  useEffect(() => {
    messagesRef.current = session.messages;
  }, [session.messages]);

  // Get current model based on provider
  const currentModel = apiSettings.provider === 'anthropic'
    ? apiSettings.anthropicModel || DEFAULT_API_SETTINGS.anthropicModel!
    : apiSettings.bedrockModel || DEFAULT_API_SETTINGS.bedrockModel!;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight, with min and max constraints
      const minHeight = 60;
      const maxHeight = 200;
      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  // Check Claude Code CLI status on mount
  useEffect(() => {
    checkClaudeCode().then(status => {
      setClaudeCodeStatus(status);
      // Show warning if in agent mode and CLI not installed
      if (chatMode === 'agent' && !status.installed) {
        setShowClaudeCodeWarning(true);
      }
    }).catch(err => {
      console.error('Failed to check Claude Code status:', err);
    });
  }, []);

  // Handle chat mode change with Claude Code check
  const handleChatModeChange = useCallback((newMode: ChatMode) => {
    setChatMode(newMode);
    if (newMode === 'agent' && claudeCodeStatus && !claudeCodeStatus.installed) {
      setShowClaudeCodeWarning(true);
    } else {
      setShowClaudeCodeWarning(false);
    }
  }, [claudeCodeStatus]);

  // Escape key to show interrupt overlay when sending
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSending && !showInterruptOverlay) {
        setShowInterruptOverlay(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSending, showInterruptOverlay]);


  // Handle cancel/interrupt
  const handleInterrupt = useCallback(() => {
    setShowInterruptOverlay(false);
    setIsSending(false);
    setStreamingContent('');
    streamingContentRef.current = '';

    // Clean up event listener
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    // If there's partial streaming content, save it as a cancelled message
    if (streamingContentRef.current) {
      const interruptedMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: streamingContentRef.current + '\n\n*[Response interrupted]*',
        timestamp: new Date(),
      };
      onUpdateMessages([...messagesRef.current, interruptedMessage]);
    }
  }, [onUpdateMessages]);

  // Handle file attachments
  const handleAddAttachments = useCallback(async (files: File[]) => {
    const newAttachments: Attachment[] = await Promise.all(
      files.map(async (file) => {
        // Read file content for text-based files
        let content: string | undefined;
        let base64Data: string | undefined;

        if (file.type.startsWith('image/')) {
          // Read image as base64
          try {
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            base64Data = btoa(binary);
          } catch (e) {
            console.error('Failed to read image as base64:', e);
          }
        } else if (file.type.startsWith('text/') || file.name.match(/\.(ts|tsx|js|jsx|json|md|txt|py|rb|go|rs|java|c|cpp|h|cs|php|swift|kt|yaml|yml|xml|html|css|scss|sh)$/i)) {
          // Read text file content
          try {
            content = await file.text();
          } catch (e) {
            console.error('Failed to read file content:', e);
          }
        }

        return {
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          content,
          base64Data,
        };
      })
    );

    setAttachments(prev => [...prev, ...newAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // Handle @ mention and /command detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    setInputValue(value);

    // Check for slash commands at the start of input
    if (value.startsWith('/')) {
      const query = value.slice(1).split(' ')[0]; // Get command name without args
      if (!value.includes(' ') || cursorPosition <= value.indexOf(' ')) {
        setSlashCommandState({ isVisible: true, query });
        // Hide mention suggestions when showing slash commands
        if (mentionState.isVisible) {
          setMentionState(prev => ({ ...prev, isVisible: false }));
        }
        return;
      }
    }

    // Hide slash commands if not at start
    if (slashCommandState.isVisible) {
      setSlashCommandState({ isVisible: false, query: '' });
    }

    // Check if we're typing a mention
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check if @ is at start or after a space
      const charBeforeAt = textBeforeCursor[lastAtIndex - 1];
      if (lastAtIndex === 0 || charBeforeAt === ' ' || charBeforeAt === '\n') {
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        // Only show if query doesn't contain spaces (still typing the mention)
        if (!query.includes(' ')) {
          // Calculate position for dropdown
          const textarea = textareaRef.current;
          if (textarea) {
            setMentionState({
              isVisible: true,
              query,
              startIndex: lastAtIndex,
              position: { top: 60, left: 0 }, // Position above textarea
            });

            // Clear previous search timeout
            if (mentionSearchTimeoutRef.current) {
              clearTimeout(mentionSearchTimeoutRef.current);
            }

            // Check for @# - browser tab mention
            if (query.startsWith('#')) {
              const tabQuery = query.slice(1).toLowerCase();
              setIsMentionLoading(true);

              // Fetch browser tabs
              mentionSearchTimeoutRef.current = setTimeout(async () => {
                try {
                  const status = await browserRelayStatus();
                  if (!status.connected) {
                    setMentionItems([{
                      id: 'browser-disconnected',
                      type: 'browser',
                      name: 'Browser not connected',
                      description: 'Install FlowQ Browser Relay extension and open FlowQ',
                    }]);
                    setIsMentionLoading(false);
                    return;
                  }

                  const tabs = await browserListTabs();
                  const filteredTabs = tabQuery
                    ? tabs.filter(tab =>
                        (tab.title?.toLowerCase().includes(tabQuery)) ||
                        (tab.url?.toLowerCase().includes(tabQuery))
                      )
                    : tabs;

                  const items: MentionItem[] = filteredTabs.slice(0, 10).map(tab => ({
                    id: `tab-${tab.id}`,
                    type: 'browser' as const,
                    name: tab.title || 'Untitled',
                    path: tab.url || '',
                    description: tab.attached ? '🔗 Attached' : undefined,
                    tabId: tab.id,
                    attached: tab.attached,
                  }));

                  if (items.length === 0) {
                    items.push({
                      id: 'no-tabs',
                      type: 'browser',
                      name: tabQuery ? 'No matching tabs' : 'No open tabs',
                      description: 'Open a page in Chrome to see it here',
                    });
                  }

                  setMentionItems(items);
                } catch (error) {
                  console.error('Failed to fetch browser tabs:', error);
                  setMentionItems([{
                    id: 'browser-error',
                    type: 'browser',
                    name: 'Failed to connect',
                    description: String(error),
                  }]);
                } finally {
                  setIsMentionLoading(false);
                }
              }, 100);
              return;
            }

            // Show type suggestions when query is empty or very short
            if (query === '' || (!query.startsWith('file:') && !query.startsWith('url:') && query.length < 2)) {
              const typeHints: MentionItem[] = [
                {
                  id: 'type-file',
                  type: 'file',
                  name: 'file:',
                  description: 'Search and include file content',
                },
                {
                  id: 'type-url',
                  type: 'url',
                  name: 'url:',
                  description: 'Fetch and include URL content',
                },
                {
                  id: 'type-browser',
                  type: 'browser',
                  name: '#',
                  description: 'Get content from browser tab',
                },
              ];
              // Filter by query if user started typing
              const filteredHints = query
                ? typeHints.filter(h => h.name.startsWith(query))
                : typeHints;
              setMentionItems(filteredHints.length > 0 ? filteredHints : typeHints);
              setIsMentionLoading(false);
              return;
            }

            // Check for @url: prefix - show URL input hint
            if (query.startsWith('url:')) {
              const urlQuery = query.slice(4);
              setMentionItems([{
                id: 'url-hint',
                type: 'url',
                name: urlQuery || 'Enter URL...',
                description: urlQuery ? 'Press Enter to add this URL' : 'Type a URL to fetch content',
                fullPath: urlQuery.startsWith('http') ? urlQuery : (urlQuery ? `https://${urlQuery}` : ''),
              }]);
              setIsMentionLoading(false);
              return;
            }

            // Check for @file: prefix - search files
            const fileQuery = query.startsWith('file:') ? query.slice(5) : query;

            // Search workspace files with debounce
            setIsMentionLoading(true);
            mentionSearchTimeoutRef.current = setTimeout(async () => {
              if (!session.workspacePath) {
                // No workspace - show placeholder
                setMentionItems([{
                  id: 'no-workspace',
                  type: 'folder',
                  name: 'No workspace selected',
                  description: 'Select a workspace to search files',
                }]);
                setIsMentionLoading(false);
                return;
              }

              try {
                const files = await searchWorkspaceFiles(session.workspacePath, fileQuery, 10);
                const items: MentionItem[] = files.map((file, index) => ({
                  id: `file-${index}`,
                  type: file.is_dir ? 'folder' : 'file',
                  name: file.name,
                  path: file.relative_path,
                  fullPath: file.path,
                }));

                // Add URL option if query looks like a URL
                if (fileQuery.includes('.') && (fileQuery.includes('/') || fileQuery.startsWith('http'))) {
                  items.push({
                    id: 'url-option',
                    type: 'url',
                    name: `Add URL: ${query}`,
                    description: 'Fetch content from URL',
                    fullPath: query.startsWith('http') ? query : `https://${query}`,
                  });
                }

                setMentionItems(items);
              } catch (error) {
                console.error('Failed to search files:', error);
                setMentionItems([]);
              } finally {
                setIsMentionLoading(false);
              }
            }, 150); // 150ms debounce

            return;
          }
        }
      }
    }

    // Hide mention suggestions if not in a mention
    if (mentionState.isVisible) {
      setMentionState(prev => ({ ...prev, isVisible: false }));
    }
  }, [mentionState.isVisible, session.workspacePath]);

  // Handle mention selection
  const handleMentionSelect = useCallback((item: MentionItem) => {
    const beforeMention = inputValue.slice(0, mentionState.startIndex);
    const afterMention = inputValue.slice(
      mentionState.startIndex + mentionState.query.length + 1
    );

    // Check if this is a type hint selection (file: or url: or #)
    if (item.id === 'type-file' || item.id === 'type-url' || item.id === 'type-browser') {
      // Insert the type prefix and keep suggestions visible
      const typePrefix = item.name; // "file:" or "url:" or "#"
      const newValue = `${beforeMention}@${typePrefix}${afterMention}`;
      setInputValue(newValue);

      // Update mention state to show next level suggestions
      const newQuery = typePrefix;
      setMentionState(prev => ({
        ...prev,
        query: newQuery,
      }));

      // Focus and position cursor after the prefix
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = beforeMention.length + 1 + typePrefix.length;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
      return;
    }

    // Handle browser tab selection - fetch snapshot and inject content
    if (item.type === 'browser' && item.tabId) {
      setMentionState(prev => ({ ...prev, isVisible: false }));

      const tabId = item.tabId;
      const tabTitle = item.name;
      const tabUrl = item.path || '';
      const wasAttached = item.attached;

      // IMMEDIATELY update input with tab mention format
      // This ensures regex will match even if user sends before snapshot loads
      const mentionText = `#tab:${tabId}`;
      const newValue = `${beforeMention}@${mentionText} ${afterMention}`;
      setInputValue(newValue);

      // Focus textarea immediately
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = beforeMention.length + mentionText.length + 2;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);

      // Fetch snapshot in background - if ready when user sends, use cached version
      // If not ready, parseMentionsAndInjectContent will fetch live
      (async () => {
        try {
          // Attach to tab if not already attached
          if (!wasAttached) {
            await browserAttachTab(tabId);
          }

          // Get page snapshot and cache it
          const snapshot = await browserSnapshot(tabId);
          browserSnapshotsRef.current.set(tabId, {
            snapshot,
            title: tabTitle,
            url: tabUrl,
          });
          console.log(`[Browser] Cached snapshot for tab ${tabId}: ${tabTitle}`);
        } catch (error) {
          console.error('Failed to pre-fetch browser snapshot:', error);
          // Don't update input on error - let parseMentionsAndInjectContent handle it
        }
      })();
      return;
    }

    // Determine the mention text format based on type
    let mentionText: string;
    if (item.type === 'url') {
      // For URL, use the full path directly
      mentionText = `url:${item.fullPath || item.name}`;
    } else if (item.type === 'file' || item.type === 'folder') {
      // Use full path for content injection
      mentionText = `file:${item.fullPath || item.path || item.name}`;
    } else {
      mentionText = item.path || item.name;
    }

    const newValue = `${beforeMention}@${mentionText} ${afterMention}`;

    setInputValue(newValue);
    setMentionState(prev => ({ ...prev, isVisible: false }));

    // Focus textarea and move cursor after the mention
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = beforeMention.length + mentionText.length + 2;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [inputValue, mentionState.startIndex, mentionState.query.length]);

  // Handle slash command selection
  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    setSlashCommandState({ isVisible: false, query: '' });

    if (command.action === 'insert' && command.insertText) {
      setInputValue(command.insertText);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            command.insertText!.length,
            command.insertText!.length
          );
        }
      }, 0);
    } else if (command.action === 'execute') {
      // Handle execute commands
      switch (command.id) {
        case 'clear':
          // Clear messages
          onUpdateMessages([]);
          break;
        case 'settings':
          // TODO: Open settings
          console.log('Open settings');
          break;
        case 'history':
          // TODO: Show history
          console.log('Show history');
          break;
        case 'reset':
          // Reset session
          setInputValue('');
          setStreamingContent('');
          streamingContentRef.current = '';
          break;
        default:
          console.log('Execute command:', command.id);
      }
    }
  }, [onUpdateMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session.messages, streamingContent]);

  // Close status menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle status change
  const handleStatusChange = useCallback((newStatus: SessionStatus) => {
    if (onUpdateSession) {
      onUpdateSession({ ...session, status: newStatus });
    }
    setIsStatusMenuOpen(false);
  }, [session, onUpdateSession]);

  // Handle permission approval
  const handlePermissionApprove = useCallback(async (id: string, remember?: boolean) => {
    console.log('Permission approved:', id, remember ? '(remembered)' : '');
    // Remove from pending list
    setPendingPermissions(prev => prev.filter(p => p.id !== id));

    // TODO: Send approval to backend
    // await approvePermission(backendSessionIdRef.current, id, remember);
  }, []);

  // Handle permission denial
  const handlePermissionDeny = useCallback(async (id: string) => {
    console.log('Permission denied:', id);
    // Remove from pending list
    setPendingPermissions(prev => prev.filter(p => p.id !== id));

    // TODO: Send denial to backend
    // await denyPermission(backendSessionIdRef.current, id);
  }, []);

  // Handle incoming events
  const handleEvent = useCallback((event: SessionEvent) => {
    console.log('handleEvent called:', event.event_type, event.data);
    if (event.event_type === 'text_delta') {
      const data = event.data as { text: string; message_id: string };
      console.log('text_delta received, text length:', data.text?.length);
      // Replace instead of append - SDK sends full text, not deltas
      streamingContentRef.current = data.text || '';
      setStreamingContent(streamingContentRef.current);
      console.log('streamingContent updated to:', streamingContentRef.current.slice(0, 50));

      // Update steps to show we're processing
      const currentMessages = messagesRef.current;
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.role === 'agent' && lastMsg.steps) {
        const updatedSteps = lastMsg.steps.map((s, i) => ({
          ...s,
          status: i === 0 ? 'completed' as const : i === 1 ? 'thinking' as const : s.status
        }));
        const updatedMessages = [
          ...currentMessages.slice(0, -1),
          { ...lastMsg, steps: updatedSteps }
        ];
        onUpdateMessages(updatedMessages);
      }
    } else if (event.event_type === 'tool_use') {
      const data = event.data as { tool_name: string; tool_id: string; tool_input: Record<string, unknown> };
      console.log('tool_use received:', data.tool_name, data.tool_input);

      // Format tool input for display
      let inputDisplay = '';
      if (data.tool_input) {
        if (data.tool_name === 'Bash' && data.tool_input.command) {
          inputDisplay = String(data.tool_input.command);
        } else if (data.tool_name === 'Read' && data.tool_input.file_path) {
          inputDisplay = String(data.tool_input.file_path);
        } else if (data.tool_name === 'Write' && data.tool_input.file_path) {
          inputDisplay = String(data.tool_input.file_path);
        } else if (data.tool_name === 'Edit' && data.tool_input.file_path) {
          inputDisplay = String(data.tool_input.file_path);
        } else if (data.tool_name === 'Glob' && data.tool_input.pattern) {
          inputDisplay = String(data.tool_input.pattern);
        } else if (data.tool_name === 'Grep' && data.tool_input.pattern) {
          inputDisplay = String(data.tool_input.pattern);
        } else {
          // For other tools, show JSON summary
          inputDisplay = JSON.stringify(data.tool_input, null, 2).slice(0, 200);
        }
      }

      // Update steps to show tool is being used
      const currentMessages = messagesRef.current;
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.role === 'agent') {
        const existingSteps = lastMsg.steps || [];
        const lastStep = existingSteps[existingSteps.length - 1];

        let updatedSteps: Step[];

        // 如果最后一个 step 是同类型工具，只更新内容
        if (lastStep && lastStep.label === data.tool_name && lastStep.status === 'thinking') {
          updatedSteps = [
            ...existingSteps.slice(0, -1),
            { ...lastStep, details: inputDisplay }
          ];
        } else {
          // 不同工具类型，将之前的 thinking 标记为 completed，添加新 step
          const completedSteps = existingSteps.map(s => ({
            ...s,
            status: s.status === 'thinking' ? 'completed' as const : s.status
          }));

          const newStep: Step = {
            id: data.tool_id,
            label: data.tool_name,
            status: 'thinking' as const,
            details: inputDisplay,
          };

          updatedSteps = [...completedSteps, newStep];
        }

        const updatedMessages = [
          ...currentMessages.slice(0, -1),
          { ...lastMsg, steps: updatedSteps }
        ];
        onUpdateMessages(updatedMessages);
      }
    } else if (event.event_type === 'complete') {
      // Finalize the message with complete content
      const data = event.data as { content?: string; message_id: string };
      const finalContent = streamingContentRef.current || data.content || '';
      console.log('complete event, final content length:', finalContent.length);

      const currentMessages = messagesRef.current;
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.role === 'agent') {
        const updatedMessages = [
          ...currentMessages.slice(0, -1),
          {
            ...lastMsg,
            content: finalContent,
            steps: lastMsg.steps?.map(s => ({ ...s, status: 'completed' as const }))
          }
        ];
        onUpdateMessages(updatedMessages);
      }
      streamingContentRef.current = '';
      setStreamingContent('');
      setIsSending(false);
    } else if (event.event_type === 'tool_result') {
      // Handle tool execution result
      const data = event.data as { tool_id: string; tool_name?: string; result?: string; error?: string };
      console.log('tool_result received:', data.tool_id, data.tool_name);

      const currentMessages = messagesRef.current;
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.role === 'agent' && lastMsg.steps) {
        // Find the step with matching tool_id and add output
        const updatedSteps = lastMsg.steps.map(step => {
          if (step.id === data.tool_id) {
            // Determine output type based on tool name
            let output: ToolOutput | undefined;
            const content = data.result || data.error || '';

            if (['Read', 'Write', 'Edit'].includes(step.label)) {
              output = {
                type: 'code',
                content,
                filename: step.details,
              };
            } else if (step.label === 'Bash') {
              output = {
                type: 'terminal',
                content,
              };
            } else if (content) {
              output = {
                type: 'text',
                content,
              };
            }

            return {
              ...step,
              status: data.error ? 'error' as const : 'completed' as const,
              output,
            };
          }
          return step;
        });

        const updatedMessages = [
          ...currentMessages.slice(0, -1),
          { ...lastMsg, steps: updatedSteps }
        ];
        onUpdateMessages(updatedMessages);
      }
    } else if (event.event_type === 'usage') {
      // Handle token usage update
      const data = event.data as {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_tokens?: number;
        cache_write_tokens?: number;
      };

      setTokenUsage((prev) => {
        const inputTokens = (prev?.total.inputTokens || 0) + (data.input_tokens || 0);
        const outputTokens = (prev?.total.outputTokens || 0) + (data.output_tokens || 0);
        const cacheReadTokens = (prev?.total.cacheReadTokens || 0) + (data.cache_read_tokens || 0);
        const cacheWriteTokens = (prev?.total.cacheWriteTokens || 0) + (data.cache_write_tokens || 0);

        return {
          total: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            cacheReadTokens: cacheReadTokens || undefined,
            cacheWriteTokens: cacheWriteTokens || undefined,
          },
          model: 'claude-bedrock',
        };
      });
    } else if (event.event_type === 'permission_request') {
      // Handle permission request from agent
      const data = event.data as {
        id: string;
        tool_name: string;
        tool_input: Record<string, unknown>;
        description?: string;
      };
      console.log('permission_request received:', data.tool_name, data.id);

      // Determine permission type based on tool name
      let permissionType: PermissionRequest['permissionType'] = 'unknown';
      let riskLevel: PermissionRequest['riskLevel'] = 'medium';

      if (data.tool_name === 'Bash') {
        permissionType = 'bash';
        riskLevel = 'high';
      } else if (['Write', 'Edit', 'NotebookEdit'].includes(data.tool_name)) {
        permissionType = 'file_write';
        riskLevel = 'medium';
      } else if (['Read', 'Glob', 'Grep'].includes(data.tool_name)) {
        permissionType = 'file_read';
        riskLevel = 'low';
      } else if (['WebFetch', 'WebSearch'].includes(data.tool_name)) {
        permissionType = 'network';
        riskLevel = 'medium';
      } else if (data.tool_name.includes('mcp') || data.tool_name.includes('Mcp')) {
        permissionType = 'mcp';
        riskLevel = 'medium';
      }

      const newRequest: PermissionRequest = {
        id: data.id,
        toolName: data.tool_name,
        toolInput: data.tool_input,
        permissionType,
        description: data.description,
        riskLevel,
      };

      setPendingPermissions(prev => [...prev, newRequest]);
    } else if (event.event_type === 'error') {
      const errorData = event.data as { error?: string };
      console.error('Session error:', errorData);
      const currentMessages = messagesRef.current;
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.role === 'agent') {
        const updatedMessages = [
          ...currentMessages.slice(0, -1),
          {
            ...lastMsg,
            content: `Error: ${errorData.error || 'Unknown error'}`,
            steps: lastMsg.steps?.map(s => ({ ...s, status: 'completed' as const }))
          }
        ];
        onUpdateMessages(updatedMessages);
      }
      streamingContentRef.current = '';
      setStreamingContent('');
      setIsSending(false);
    }
  }, [onUpdateMessages]);

  // Initialize backend session and subscribe to events
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Cleanup previous listener if exists
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      try {
        // Create a backend session
        const backendSession = await createSession(session.title);
        if (!mounted) return;

        backendSessionIdRef.current = backendSession.id;

        // Set up event listener
        const unlisten = await listen<SessionEvent>('session-event', (e) => {
          handleEvent(e.payload);
        });

        if (!mounted) {
          unlisten();
          return;
        }

        unlistenRef.current = unlisten;
      } catch (error) {
        console.error('Failed to initialize session:', error);
      }
    };

    init();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [session.id, session.title, handleEvent]);

  // Format browser snapshot for AI consumption with browser control API instructions
  const formatBrowserSnapshot = (snapshot: PageSnapshot, title: string, tabId?: number): string => {
    const { page, tree, nodeCount, textContent } = snapshot;

    // Recursively format accessibility tree (simplified)
    const formatNode = (node: { ref: string; role: string; name: string; children?: any[] }, depth = 0): string => {
      const indent = '  '.repeat(depth);
      const children = node.children?.map(c => formatNode(c, depth + 1)).join('') || '';
      if (!node.name && !children) return '';
      return `${indent}[${node.ref}] ${node.role}: ${node.name}\n${children}`;
    };

    const treeText = tree.map(node => formatNode(node)).join('').trim();

    // Truncate text content if too long
    const truncatedText = textContent
      ? textContent.length > 8000
        ? textContent.slice(0, 8000) + '\n... (truncated)'
        : textContent
      : '';

    // Browser control API documentation for agentic control
    const browserApiDocs = tabId ? `
---
## ⛔ ABSOLUTE RESTRICTIONS FOR THIS BROWSER TAB

**THIS IS A LIVE BROWSER TAB WITH USER'S LOGIN SESSION. THE FOLLOWING TOOLS ARE ABSOLUTELY FORBIDDEN:**
- ❌ **WebFetch** - FORBIDDEN (no cookies/auth)
- ❌ **WebSearch** - FORBIDDEN (use the page content below instead)
- ❌ **curl/wget on URLs** - FORBIDDEN (no cookies/auth)

**YOU MUST:**
1. **ANALYZE the "Visible Page Content" section below** - it contains the actual page text
2. **PRESENT the information** from the content to the user
3. **USE Browser Control API** only if you need to interact (click, scroll, etc.)

## 🤖 Browser Control API (Tab ID: ${tabId})

\`\`\`bash
# Get updated snapshot
curl -s -X POST http://127.0.0.1:18800/snapshot -H "Content-Type: application/json" -d '{"tabId":${tabId}}'
# Click element
curl -s -X POST http://127.0.0.1:18800/click -H "Content-Type: application/json" -d '{"tabId":${tabId},"selector":"CSS"}'
# Scroll down
curl -s -X POST http://127.0.0.1:18800/scroll -H "Content-Type: application/json" -d '{"tabId":${tabId},"direction":"down"}'
\`\`\`

---
` : '';

    return `🌐 **Browser Tab: ${title}**
**URL:** ${page.url} | **Tab ID:** ${tabId || 'unknown'} | **Scroll:** ${Math.round(page.scrollY)}/${Math.round(page.scrollHeight)}
${browserApiDocs}
## Visible Page Content (ANALYZE THIS AND PRESENT TO USER):
\`\`\`
${truncatedText || '(No text content extracted)'}
\`\`\`

## Interactive Elements (${nodeCount} nodes):
\`\`\`
${treeText.slice(0, 3000)}${treeText.length > 3000 ? '\n... (truncated)' : ''}
\`\`\`
`;
  };

  // Parse @file: and @url: and @#tab: mentions and inject their content
  const parseMentionsAndInjectContent = async (text: string): Promise<string> => {
    // Regex to match @file:path, @url:url, and @#tab:id mentions
    const mentionRegex = /@(file|url|#tab):([^\s]+)/g;
    const mentions: { match: string; type: 'file' | 'url' | 'browser'; path: string }[] = [];

    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const type = match[1] === '#tab' ? 'browser' : match[1] as 'file' | 'url';
      mentions.push({
        match: match[0],
        type,
        path: match[2],
      });
    }

    console.log('[Mentions] Parsing text:', text.slice(0, 100));
    console.log('[Mentions] Found mentions:', mentions);

    if (mentions.length === 0) {
      return text;
    }

    // Fetch content for each mention
    const contentMap = new Map<string, string>();
    for (const mention of mentions) {
      try {
        let content: string;
        if (mention.type === 'file') {
          content = await readFileForMention(mention.path, 500); // Limit to 500 lines
          contentMap.set(mention.match, `\n\n📄 **File: ${mention.path}**\n\`\`\`\n${content}\n\`\`\`\n`);
        } else if (mention.type === 'url') {
          content = await fetchUrlForMention(mention.path);
          // Truncate URL content if too long
          const truncatedContent = content.length > 10000
            ? content.slice(0, 10000) + '\n\n... (content truncated)'
            : content;
          contentMap.set(mention.match, `\n\n🔗 **URL: ${mention.path}**\n\`\`\`\n${truncatedContent}\n\`\`\`\n`);
        } else if (mention.type === 'browser') {
          // Get snapshot from cache or fetch live
          const tabId = parseInt(mention.path);
          console.log(`[Browser] Processing tab mention: ${tabId}`);
          const cached = browserSnapshotsRef.current.get(tabId);
          if (cached) {
            console.log(`[Browser] Using cached snapshot for tab ${tabId}`);
            content = formatBrowserSnapshot(cached.snapshot, cached.title, tabId);
            contentMap.set(mention.match, `\n\n${content}\n`);
            // Clear from cache after use
            browserSnapshotsRef.current.delete(tabId);
          } else {
            console.log(`[Browser] No cache, fetching live snapshot for tab ${tabId}`);
            // Try to fetch live snapshot
            try {
              await browserAttachTab(tabId);
              const snapshot = await browserSnapshot(tabId);
              console.log(`[Browser] Got live snapshot:`, snapshot.page?.url);
              content = formatBrowserSnapshot(snapshot, `Tab ${tabId}`, tabId);
              contentMap.set(mention.match, `\n\n${content}\n`);
            } catch (e) {
              console.error(`[Browser] Failed to get snapshot:`, e);
              contentMap.set(mention.match, `\n\n⚠️ **Failed to get browser tab ${tabId}**\nError: ${e}\n`);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to fetch content for ${mention.match}:`, error);
        contentMap.set(mention.match, `\n\n⚠️ **Failed to load: ${mention.path}**\nError: ${error}\n`);
      }
    }

    // Build the augmented message
    let augmentedText = text;

    // Remove the mention markers from the text and add content at the end
    for (const mention of mentions) {
      augmentedText = augmentedText.replace(mention.match, '');
    }

    // Append all fetched content
    for (const [, content] of contentMap) {
      augmentedText += content;
    }

    return augmentedText.trim();
  };

  const handleSend = async () => {
    // For agent mode, require backend session; for chat mode, no backend session needed
    if (chatMode === 'agent') {
      const currentBackendSessionId = backendSessionIdRef.current;
      if ((!inputValue.trim() && attachments.length === 0) || isSending || !currentBackendSessionId) return;
      await handleSendAgent(currentBackendSessionId);
    } else {
      if ((!inputValue.trim() && attachments.length === 0) || isSending) return;
      await handleSendChat();
    }
  };

  // Agent mode: Use Claude Code SDK with tools
  const handleSendAgent = async (currentBackendSessionId: string) => {
    // Store original input for display (without injected content)
    const displayContent = inputValue;

    // Build message content with attachments
    let messageContent = inputValue;
    if (attachments.length > 0) {
      const attachmentText = attachments.map(a => {
        if (a.content) {
          return `\n\n--- File: ${a.name} ---\n${a.content}\n--- End of ${a.name} ---`;
        }
        return `\n[Attached file: ${a.name} (${a.type}, ${a.size} bytes)]`;
      }).join('');
      messageContent = inputValue + attachmentText;
    }

    // Parse @file: and @url: mentions and inject their content
    try {
      messageContent = await parseMentionsAndInjectContent(messageContent);
    } catch (error) {
      console.error('Failed to parse mentions:', error);
    }

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: displayContent, // Display only the text, not the injected content
      timestamp: new Date(),
    };

    // Initial agent placeholder message
    const agentMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'agent',
      content: '',
      timestamp: new Date(),
      steps: [
        { id: '1', label: 'Sending to Claude', status: 'thinking' },
        { id: '2', label: 'Processing response', status: 'pending' },
      ],
    };

    const newMessages = [...session.messages, userMessage, agentMessage];
    onUpdateMessages(newMessages);

    const contentToSend = messageContent;
    setInputValue('');
    setAttachments([]);
    setIsSending(true);
    streamingContentRef.current = '';
    setStreamingContent('');

    try {
      // Pass API settings to use Bedrock or Anthropic based on user config
      await sendMessage(currentBackendSessionId, contentToSend, undefined, apiSettings);
    } catch (err) {
      console.error('Failed to send message:', err);
      const errorMessages = [
        ...session.messages,
        userMessage,
        {
          ...agentMessage,
          content: `Error: ${err instanceof Error ? err.message : 'Failed to get response from Claude'}`,
          steps: agentMessage.steps?.map(s => ({ ...s, status: 'completed' as const }))
        }
      ];
      onUpdateMessages(errorMessages);
      setIsSending(false);
    }
  };

  // Chat mode: Direct API call without tools
  const handleSendChat = async () => {
    // Build message content - check if we have images for multimodal
    const hasImages = attachments.some(a => a.base64Data);

    let messageContent: string | Array<{type: string; text?: string; source?: {type: string; media_type: string; data: string}}>;

    if (hasImages) {
      // Build multimodal content array
      const contentBlocks: Array<{type: string; text?: string; source?: {type: string; media_type: string; data: string}}> = [];

      // Add images first
      for (const attachment of attachments) {
        if (attachment.base64Data) {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: attachment.type,
              data: attachment.base64Data,
            },
          });
        } else if (attachment.content) {
          // Add text file content
          contentBlocks.push({
            type: 'text',
            text: `--- File: ${attachment.name} ---\n${attachment.content}\n--- End of ${attachment.name} ---`,
          });
        }
      }

      // Add user's text message
      if (inputValue.trim()) {
        contentBlocks.push({
          type: 'text',
          text: inputValue,
        });
      }

      messageContent = contentBlocks;
    } else {
      // Simple text content with text file attachments
      let textContent = inputValue;
      if (attachments.length > 0) {
        const attachmentText = attachments.map(a => {
          if (a.content) {
            return `\n\n--- File: ${a.name} ---\n${a.content}\n--- End of ${a.name} ---`;
          }
          return `\n[Attached file: ${a.name} (${a.type}, ${a.size} bytes)]`;
        }).join('');
        textContent = inputValue + attachmentText;
      }
      messageContent = textContent;
    }

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    // Placeholder for assistant response
    const agentMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'agent',
      content: '',
      timestamp: new Date(),
    };

    const newMessages = [...session.messages, userMessage, agentMessage];
    onUpdateMessages(newMessages);

    // Update local chat history with multimodal content
    chatHistoryRef.current.push({ role: 'user', content: messageContent as string | Array<{type: string; text?: string; source?: {type: string; media_type: string; data: string}}> });

    setInputValue('');
    setAttachments([]);
    setIsSending(true);

    try {
      // Build request based on provider settings
      const isAnthropic = apiSettings.provider === 'anthropic';
      const response = await chatSend({
        messages: chatHistoryRef.current,
        provider: apiSettings.provider,
        model: isAnthropic ? apiSettings.anthropicModel : apiSettings.bedrockModel,
        apiKey: isAnthropic ? apiSettings.anthropicApiKey : undefined,
        baseUrl: isAnthropic && apiSettings.anthropicBaseUrl ? apiSettings.anthropicBaseUrl : undefined,
        region: !isAnthropic ? apiSettings.bedrockRegion : undefined,
        awsProfile: !isAnthropic && apiSettings.bedrockAuthMethod === 'profile' ? apiSettings.bedrockProfile : undefined,
        maxTokens: 4096,
        workspace: session.workspacePath,  // Enable memory context injection
      });

      // Update chat history with response
      chatHistoryRef.current.push({ role: 'assistant', content: response.content });

      // Update UI
      const finalMessages = [
        ...session.messages,
        userMessage,
        {
          ...agentMessage,
          content: response.content,
        }
      ];
      onUpdateMessages(finalMessages);

      // Update token usage
      if (response.usage) {
        setTokenUsage((prev) => ({
          total: {
            inputTokens: (prev?.total.inputTokens || 0) + response.usage!.input_tokens,
            outputTokens: (prev?.total.outputTokens || 0) + response.usage!.output_tokens,
            totalTokens: (prev?.total.totalTokens || 0) + response.usage!.input_tokens + response.usage!.output_tokens,
          },
          model: response.model,
        }));
      }
    } catch (err) {
      console.error('Failed to send chat message:', err);
      // Remove from history on error
      chatHistoryRef.current.pop();

      const errorMessages = [
        ...session.messages,
        userMessage,
        {
          ...agentMessage,
          content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
        }
      ];
      onUpdateMessages(errorMessages);
    } finally {
      setIsSending(false);
    }
  };

  // Get display content for the last agent message (combine stored + streaming)
  const getDisplayMessages = () => {
    if (!streamingContent) return session.messages;

    const messages = [...session.messages];
    const lastIndex = messages.length - 1;
    if (lastIndex >= 0 && messages[lastIndex].role === 'agent') {
      messages[lastIndex] = {
        ...messages[lastIndex],
        content: streamingContent
      };
    }
    return messages;
  };

  const displayMessages = getDisplayMessages();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card px-6 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer hover:bg-muted px-3 py-1.5 rounded-lg transition-colors">
            <span className="text-sm font-semibold text-foreground">{session.title}</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </div>
          {/* Memory indicator */}
          {session.workspacePath ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-success/10 text-success rounded-md text-xs font-medium">
              <Brain size={12} />
              <span>Memory</span>
            </div>
          ) : chatMode === 'chat' && onSelectWorkspace ? (
            <button
              onClick={onSelectWorkspace}
              className="flex items-center gap-1.5 px-2 py-1 bg-accent-secondary/10 text-accent-secondary rounded-md text-xs font-medium hover:bg-accent-secondary/20 transition-colors"
            >
              <FolderOpen size={12} />
              <span>Select Folder</span>
            </button>
          ) : null}
        </div>
        {/* Header actions */}
        <div className="flex items-center gap-2">
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">
            <Share2 size={18} />
          </button>
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">
            <Download size={18} />
          </button>
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Messages Area with edge fade effect */}
      <div
        className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-background"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black calc(100% - 20px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black calc(100% - 20px), transparent 100%)',
        }}
      >
        {displayMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            {/* Friendly illustration */}
            <div className="mb-6 animate-fade-in">
              <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">◡</span>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Ready when you are</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Start typing, or try one of these:
              </p>
            </div>

            {/* Suggested prompts grid */}
            <div className="grid grid-cols-2 gap-3 max-w-md w-full">
              {[
                { text: "Help me write a function...", icon: "✏️" },
                { text: "Review this code...", icon: "🔍" },
                { text: "Explain how this works...", icon: "💡" },
                { text: "Debug this error...", icon: "🐛" },
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => setInputValue(prompt.text)}
                  className={`px-4 py-3 bg-card border border-border rounded-xl text-left text-sm text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/5 transition-all animate-fade-in stagger-${i + 1}`}
                >
                  <span className="mr-2">{prompt.icon}</span>
                  {prompt.text}
                </button>
              ))}
            </div>

            {/* Memory status */}
            {session.workspacePath && (
              <div className="mt-6 flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success rounded-full text-xs font-medium animate-fade-in stagger-5">
                <Brain size={12} />
                <span>Memory enabled</span>
              </div>
            )}
          </div>
        )}

        {/* Pending Permission Requests */}
        {pendingPermissions.length > 0 && (
          <div className="space-y-3 mb-6">
            {pendingPermissions.map((request) => (
              <PermissionCard
                key={request.id}
                request={request}
                onApprove={handlePermissionApprove}
                onDeny={handlePermissionDeny}
                isProcessing={false}
              />
            ))}
          </div>
        )}

        {displayMessages.map((msg, index) => (
          <div key={msg.id} className={`flex message-new ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-muted/80 rounded-2xl px-5 py-3 text-foreground shadow-sm border border-border' : 'w-full'}`}>
              {msg.role === 'agent' && (
                <div className="space-y-4">
                  {msg.diagram && <ArchitectureDiagram data={msg.diagram} />}

                  {/* 先显示工具调用步骤 */}
                  {msg.steps && msg.steps.length > 0 && <AgentSteps steps={msg.steps} />}

                  {/* 然后显示最终响应内容 */}
                  {msg.content && (
                    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border overflow-hidden">
                      <MarkdownContent content={msg.content} />
                      {/* Message action bar - Copy and View as Markdown */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <span className="text-[10px] text-muted-foreground">
                          {formatMessageTime(msg.timestamp)}
                        </span>
                        <MessageActions
                          content={msg.content}
                          onViewMarkdown={() => setMarkdownOverlay({ isOpen: true, content: msg.content })}
                        />
                      </div>
                    </div>
                  )}

                  {/* 加载状态 with streaming cursor */}
                  {!msg.content && isSending && (
                    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-sm">Thinking</span>
                        <span className="streaming-cursor text-accent">▋</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {msg.role === 'user' && (
                <div>
                  <p className="text-sm font-medium">{msg.content}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-right">
                    {formatMessageTime(msg.timestamp)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Footer */}
      <div className="p-6 border-t border-border bg-card/80 backdrop-blur-md flex-shrink-0">
        <div className="max-w-4xl mx-auto space-y-4">
           {/* Quick Actions Row */}
           <div className="flex items-center gap-2">
             {/* Chat Mode Selector */}
             <ChatModeSelector
               mode={chatMode}
               onChange={handleChatModeChange}
               disabled={isSending}
             />
             {/* Permission Mode Selector - only show in agent mode */}
             {chatMode === 'agent' && (
               <PermissionModeSelector
                 mode={permissionMode}
                 onChange={setPermissionMode}
                 disabled={isSending}
               />
             )}
             {/* Status Dropdown */}
             <div className="ml-auto relative" ref={statusMenuRef}>
                <button
                  onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
                >
                  <StatusIcon status={session.status || 'todo'} size={14} />
                  {SESSION_STATUS_CONFIG.find(s => s.id === (session.status || 'todo'))?.label || 'Todo'}
                  <ChevronDown size={12} className={`text-muted-foreground transition-transform ${isStatusMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Status Dropdown Menu */}
                {isStatusMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-2 w-44 bg-card rounded-xl shadow-lg border border-border py-1 z-50">
                    {SESSION_STATUS_CONFIG.map((statusConfig) => (
                      <button
                        key={statusConfig.id}
                        onClick={() => handleStatusChange(statusConfig.id)}
                        className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-muted text-foreground transition-colors ${
                          session.status === statusConfig.id ? 'bg-muted' : ''
                        }`}
                      >
                        <StatusIcon status={statusConfig.id} size={16} />
                        <span className="text-sm">{statusConfig.label}</span>
                        {session.status === statusConfig.id && (
                          <Check size={14} className="ml-auto text-success" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
             </div>
           </div>

           {/* Claude Code CLI Warning */}
           {showClaudeCodeWarning && chatMode === 'agent' && (
             <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm">
               <div className="flex-shrink-0 w-8 h-8 bg-amber-100 dark:bg-amber-800 rounded-lg flex items-center justify-center">
                 <CircleAlert size={18} className="text-amber-600 dark:text-amber-400" />
               </div>
               <div className="flex-1">
                 <span className="text-amber-800 dark:text-amber-200 font-medium">Claude Code CLI not installed</span>
                 <span className="text-amber-600 dark:text-amber-400 ml-2">Agent mode requires Claude Code CLI.</span>
               </div>
               <button
                 onClick={() => onOpenSettings?.('providers')}
                 className="px-3 py-1.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-medium hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
               >
                 Install
               </button>
               <button
                 onClick={() => setShowClaudeCodeWarning(false)}
                 className="p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded transition-colors"
               >
                 <X size={14} className="text-amber-600 dark:text-amber-400" />
               </button>
             </div>
           )}

           {/* Input Box */}
           <div className="relative bg-card border border-border rounded-2xl shadow-sm transition-all">
              {/* Mention suggestions dropdown - positioned outside overflow container */}
              <MentionSuggestions
                query={mentionState.query}
                isVisible={mentionState.isVisible}
                position={mentionState.position}
                items={mentionItems}
                onSelect={handleMentionSelect}
                onClose={() => setMentionState(prev => ({ ...prev, isVisible: false }))}
                isLoading={isMentionLoading}
              />

              {/* Slash commands dropdown */}
              <SlashCommands
                query={slashCommandState.query}
                isVisible={slashCommandState.isVisible}
                position={{ top: 60, left: 0 }}
                onSelect={handleSlashCommandSelect}
                onClose={() => setSlashCommandState({ isVisible: false, query: '' })}
              />
              {/* Attachments display */}
              <div className="p-3 pb-0">
                <Attachments
                  attachments={attachments}
                  onAdd={handleAddAttachments}
                  onRemove={handleRemoveAttachment}
                  disabled={isSending}
                />
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    handleAddAttachments(files);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />

              <div className="relative px-3">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    // Don't send if mention/command suggestions are visible
                    if ((mentionState.isVisible || slashCommandState.isVisible) &&
                        ['Enter', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                      return; // Let dropdowns handle these
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="What would you like to work on?"
                  className="w-full resize-none border-none outline-none focus:ring-0 focus:outline-none text-sm text-foreground placeholder-muted-foreground bg-transparent overflow-y-auto py-3"
                  style={{ minHeight: '60px', maxHeight: '200px' }}
                />

              </div>

              {/* Action bar with visible affordances */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted rounded-lg transition-colors text-xs"
                    title="Attach files"
                    disabled={isSending}
                  >
                    <Paperclip size={14} />
                    <span className="hidden sm:inline">Attach</span>
                  </button>
                  <span className="w-px h-4 bg-border mx-1" />
                  <button
                    onClick={() => {
                      setInputValue(prev => prev + '@');
                      textareaRef.current?.focus();
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted rounded-lg transition-colors text-xs"
                    title="Mention files or symbols"
                    disabled={isSending}
                  >
                    <span className="font-medium">@</span>
                    <span className="hidden sm:inline">Mention</span>
                  </button>
                  <button
                    onClick={() => {
                      setInputValue('/');
                      textareaRef.current?.focus();
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted rounded-lg transition-colors text-xs"
                    title="Run a command"
                    disabled={isSending}
                  >
                    <span className="font-medium">/</span>
                    <span className="hidden sm:inline">Command</span>
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {tokenUsage && <TokenUsageDisplay usage={tokenUsage} />}
                  {isSending ? (
                    <button
                      onClick={handleInterrupt}
                      className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all bg-danger text-white hover:bg-danger/90 active:scale-95"
                      title="Stop (Esc)"
                    >
                      <Square size={14} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!inputValue.trim() && attachments.length === 0}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-all ${
                        inputValue.trim() || attachments.length > 0
                          ? 'bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
           </div>

           {/* Context line */}
           <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
             {session.workspacePath && (
               <>
                 <span className="flex items-center gap-1 text-success">
                   <Brain size={10} />
                   Memory
                 </span>
                 <span>•</span>
               </>
             )}
             <span className={chatMode === 'agent' ? 'text-agent-mode' : 'text-chat-mode'}>
               {chatMode === 'agent' ? 'Agent' : 'Chat'} mode
             </span>
             <span>•</span>
             <button
               onClick={() => onOpenSettings?.('providers')}
               className="font-mono hover:text-foreground transition-colors truncate max-w-[200px]"
               title={`Model: ${currentModel} (click to configure)`}
             >
               {currentModel}
             </button>
           </div>
        </div>
      </div>

      {/* Fullscreen Markdown Preview Overlay */}
      <DocumentMarkdownOverlay
        isOpen={markdownOverlay.isOpen}
        onClose={() => setMarkdownOverlay({ isOpen: false, content: '' })}
        content={markdownOverlay.content}
        title="View as Markdown"
      />

      {/* Escape Interrupt Overlay */}
      <EscapeInterruptOverlay
        isVisible={showInterruptOverlay}
        onCancel={handleInterrupt}
        onDismiss={() => setShowInterruptOverlay(false)}
      />

      {/* Workspace Selection Modal */}
      {!session.workspacePath && onSelectWorkspace && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal Content */}
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="px-6 pt-8 pb-6 text-center border-b border-gray-100 dark:border-gray-700">
              <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <FolderOpen size={28} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Select a Workspace</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {chatMode === 'agent'
                  ? 'Choose a directory where the Agent will execute file operations and code modifications.'
                  : 'Choose a directory to enable Memory. The AI will remember important information you share.'}
              </p>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Brain size={16} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Persistent Memory</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      AI can save and recall information across sessions
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={onSelectWorkspace}
                className="w-full mt-6 py-3 bg-gray-900 dark:bg-indigo-600 hover:bg-gray-800 dark:hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors active:scale-[0.98]"
              >
                Choose Directory
              </button>

              <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">
                You can change the workspace anytime from the sidebar
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
