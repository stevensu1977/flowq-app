
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
  Square,
  FolderOpen,
  Brain,
} from 'lucide-react';
import { ChatSession, ChatMessage, Step, SessionStatus, SESSION_STATUS_CONFIG, ToolOutput, SessionTokenUsage, TokenUsage, ChatMode } from '../types';
import AgentSteps from './AgentSteps';
import ArchitectureDiagram from './ArchitectureDiagram';
import MarkdownContent from './MarkdownContent';
import { sendMessage, createSession, chatSend, type SessionEvent, type SimpleChatMessage, type ApiSettings, DEFAULT_API_SETTINGS } from '../lib/tauri-api';
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
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  // Chat history for simple chat mode (managed locally)
  const chatHistoryRef = useRef<SimpleChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(session.messages);
  const backendSessionIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
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
            const rect = textarea.getBoundingClientRect();
            setMentionState({
              isVisible: true,
              query,
              startIndex: lastAtIndex,
              position: { top: 60, left: 0 }, // Position above textarea
            });

            // Generate sample suggestions (in real app, this would search the workspace)
            const sampleItems: MentionItem[] = [
              { id: '1', type: 'file', name: 'package.json', path: './package.json' },
              { id: '2', type: 'file', name: 'tsconfig.json', path: './tsconfig.json' },
              { id: '3', type: 'file', name: 'index.tsx', path: './index.tsx' },
              { id: '4', type: 'folder', name: 'components', path: './components' },
              { id: '5', type: 'folder', name: 'lib', path: './lib' },
              { id: '6', type: 'symbol', name: 'ChatWindow', description: 'React Component' },
              { id: '7', type: 'symbol', name: 'sendMessage', description: 'Function' },
            ].filter(item =>
              item.name.toLowerCase().includes(query.toLowerCase()) ||
              item.path?.toLowerCase().includes(query.toLowerCase())
            );

            setMentionItems(sampleItems.slice(0, 8));
            return;
          }
        }
      }
    }

    // Hide mention suggestions if not in a mention
    if (mentionState.isVisible) {
      setMentionState(prev => ({ ...prev, isVisible: false }));
    }
  }, [mentionState.isVisible]);

  // Handle mention selection
  const handleMentionSelect = useCallback((item: MentionItem) => {
    const beforeMention = inputValue.slice(0, mentionState.startIndex);
    const afterMention = inputValue.slice(
      mentionState.startIndex + mentionState.query.length + 1
    );
    const mentionText = item.path || item.name;
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

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: inputValue, // Display only the text, not the file content
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
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 md:bg-[#f9fafb] md:dark:bg-gray-900">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{session.title}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </div>
          {/* Memory indicator */}
          {session.workspacePath ? (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-md text-xs font-medium">
              <Brain size={12} />
              <span>Memory</span>
            </div>
          ) : chatMode === 'chat' && onSelectWorkspace ? (
            <button
              onClick={onSelectWorkspace}
              className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-md text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              <FolderOpen size={12} />
              <span>选择目录</span>
            </button>
          ) : null}
        </div>
        {/* Header actions moved to input area */}
        <div className="flex items-center gap-4">
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
            <Share2 size={18} />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
            <Download size={18} />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Messages Area with edge fade effect */}
      <div
        className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-white dark:bg-gray-900 md:bg-[#f9fafb] md:dark:bg-gray-900"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black calc(100% - 20px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black calc(100% - 20px), transparent 100%)',
        }}
      >
        {displayMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="opacity-50">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <Database size={24} className="text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Ready to collaborate. Ask me anything!</p>
              {session.workspacePath && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center justify-center gap-1">
                  <Brain size={12} />
                  Memory enabled
                </p>
              )}
            </div>
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

        {displayMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-gray-100/80 dark:bg-gray-700/80 rounded-2xl px-5 py-3 text-gray-800 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-600' : 'w-full'}`}>
              {msg.role === 'agent' && (
                <div className="space-y-4">
                  {msg.diagram && <ArchitectureDiagram data={msg.diagram} />}

                  {/* 先显示工具调用步骤 */}
                  {msg.steps && msg.steps.length > 0 && <AgentSteps steps={msg.steps} />}

                  {/* 然后显示最终响应内容 */}
                  {msg.content && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                      <MarkdownContent content={msg.content} />
                      {/* Message action bar - Copy and View as Markdown */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {formatMessageTime(msg.timestamp)}
                        </span>
                        <MessageActions
                          content={msg.content}
                          onViewMarkdown={() => setMarkdownOverlay({ isOpen: true, content: msg.content })}
                        />
                      </div>
                    </div>
                  )}

                  {/* 加载状态 */}
                  {!msg.content && isSending && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse"></div>
                        <span className="text-sm">Thinking...</span>
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
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md flex-shrink-0">
        <div className="max-w-4xl mx-auto space-y-4">
           {/* Quick Actions Row */}
           <div className="flex items-center gap-2">
             {/* Chat Mode Selector */}
             <ChatModeSelector
               mode={chatMode}
               onChange={setChatMode}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <StatusIcon status={session.status || 'todo'} size={14} />
                  {SESSION_STATUS_CONFIG.find(s => s.id === (session.status || 'todo'))?.label || 'Todo'}
                  <ChevronDown size={12} className={`transition-transform ${isStatusMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Status Dropdown Menu */}
                {isStatusMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-2 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    {SESSION_STATUS_CONFIG.map((statusConfig) => (
                      <button
                        key={statusConfig.id}
                        onClick={() => handleStatusChange(statusConfig.id)}
                        className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors ${
                          session.status === statusConfig.id ? 'bg-gray-50 dark:bg-gray-700' : ''
                        }`}
                      >
                        <StatusIcon status={statusConfig.id} size={16} />
                        <span className="text-sm">{statusConfig.label}</span>
                        {session.status === statusConfig.id && (
                          <Check size={14} className="ml-auto text-green-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
             </div>
           </div>

           {/* Input Box */}
           <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm transition-all p-3">
              {/* Attachments display */}
              <Attachments
                attachments={attachments}
                onAdd={handleAddAttachments}
                onRemove={handleRemoveAttachment}
                disabled={isSending}
              />

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

              <div className="relative">
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
                  placeholder="What would you like to work on? Type @ to mention files"
                  className="w-full resize-none border-none outline-none focus:ring-0 focus:outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 bg-transparent overflow-y-auto"
                  style={{ minHeight: '60px', maxHeight: '200px' }}
                />

                {/* Mention suggestions dropdown */}
                <MentionSuggestions
                  query={mentionState.query}
                  isVisible={mentionState.isVisible}
                  position={mentionState.position}
                  items={mentionItems}
                  onSelect={handleMentionSelect}
                  onClose={() => setMentionState(prev => ({ ...prev, isVisible: false }))}
                />

                {/* Slash commands dropdown */}
                <SlashCommands
                  query={slashCommandState.query}
                  isVisible={slashCommandState.isVisible}
                  position={{ top: 60, left: 0 }}
                  onSelect={handleSlashCommandSelect}
                  onClose={() => setSlashCommandState({ isVisible: false, query: '' })}
                />
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Attach files"
                    disabled={isSending}
                  >
                    <Paperclip size={18} />
                  </button>
                  <button className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"><Database size={18} /></button>
                  <button className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"><Home size={18} /></button>
                </div>
                <div className="flex items-center gap-2">
                  {tokenUsage && <TokenUsageDisplay usage={tokenUsage} />}
                  {/* Model ID Display - click to open settings */}
                  <button
                    onClick={() => onOpenSettings?.('apis')}
                    className="text-[11px] font-mono text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 max-w-[280px] truncate transition-colors"
                    title={`Model: ${currentModel} (click to configure)`}
                    disabled={isSending}
                  >
                    {currentModel}
                  </button>
                  {isSending ? (
                    <button
                      onClick={handleInterrupt}
                      className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-all bg-red-500 text-white hover:bg-red-600 active:scale-90"
                      title="Stop (Esc)"
                    >
                      <Square size={14} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!inputValue.trim() && attachments.length === 0}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-all ${
                        inputValue.trim() || attachments.length > 0
                          ? 'bg-gray-800 dark:bg-indigo-600 text-white hover:bg-gray-900 dark:hover:bg-indigo-700 active:scale-90'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500'
                      }`}
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
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
