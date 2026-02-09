import React from 'react';
import { Bot, MessageSquare } from 'lucide-react';
import { ChatMode, CHAT_MODE_CONFIG } from '../types';

interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

/**
 * Elegant toggle switch for Chat/Agent mode
 * Phase 2 UI Enhancement: Redesigned from dropdown to sliding toggle
 */
const ChatModeSelector: React.FC<ChatModeSelectorProps> = ({
  mode,
  onChange,
  disabled = false,
}) => {
  const handleToggle = () => {
    if (disabled) return;
    onChange(mode === 'agent' ? 'chat' : 'agent');
  };

  const agentConfig = CHAT_MODE_CONFIG.find(m => m.id === 'agent')!;
  const chatConfig = CHAT_MODE_CONFIG.find(m => m.id === 'chat')!;

  return (
    <div
      className={`relative inline-flex items-center rounded-xl p-1 bg-muted border border-border transition-all ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      onClick={handleToggle}
      role="switch"
      aria-checked={mode === 'agent'}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      }}
    >
      {/* Sliding indicator */}
      <div
        className={`absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-lg bg-card shadow-sm border border-border/50 transition-all duration-200 ease-out ${
          mode === 'agent' ? 'left-1' : 'left-[calc(50%+2px)]'
        }`}
      />

      {/* Agent option */}
      <button
        type="button"
        disabled={disabled}
        className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ${
          mode === 'agent'
            ? 'text-agent-mode'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled && mode !== 'agent') onChange('agent');
        }}
        title={agentConfig.description}
      >
        <Bot size={14} />
        <span>Agent</span>
      </button>

      {/* Chat option */}
      <button
        type="button"
        disabled={disabled}
        className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ${
          mode === 'chat'
            ? 'text-chat-mode'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled && mode !== 'chat') onChange('chat');
        }}
        title={chatConfig.description}
      >
        <MessageSquare size={14} />
        <span>Chat</span>
      </button>
    </div>
  );
};

export default ChatModeSelector;
