import React, { useState, useRef, useEffect } from 'react';
import { Bot, MessageSquare, ChevronDown, Check } from 'lucide-react';
import { ChatMode, CHAT_MODE_CONFIG } from '../types';

interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

const ModeIcon: React.FC<{ mode: ChatMode; size?: number; className?: string }> = ({
  mode,
  size = 14,
  className = '',
}) => {
  return mode === 'agent' ? (
    <Bot size={size} className={className} />
  ) : (
    <MessageSquare size={size} className={className} />
  );
};

const ChatModeSelector: React.FC<ChatModeSelectorProps> = ({
  mode,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentMode = CHAT_MODE_CONFIG.find((m) => m.id === mode) || CHAT_MODE_CONFIG[0];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
      >
        <ModeIcon
          mode={mode}
          size={14}
          className={mode === 'agent' ? 'text-purple-500' : 'text-blue-500'}
        />
        <span className="text-gray-700 dark:text-gray-200">{currentMode.label}</span>
        <ChevronDown size={12} className="text-gray-400" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
          <div className="px-3 pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Chat Mode</p>
          </div>

          {CHAT_MODE_CONFIG.map((modeConfig) => {
            const isSelected = mode === modeConfig.id;

            return (
              <button
                key={modeConfig.id}
                onClick={() => {
                  onChange(modeConfig.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                }`}
              >
                <div className={`mt-0.5 ${modeConfig.id === 'agent' ? 'text-purple-500' : 'text-blue-500'}`}>
                  <ModeIcon mode={modeConfig.id} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {modeConfig.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{modeConfig.description}</p>
                </div>
                {isSelected && (
                  <div className="mt-1">
                    <Check size={16} className="text-indigo-500" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChatModeSelector;
