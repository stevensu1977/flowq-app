import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Sparkles, Zap, Brain } from 'lucide-react';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  provider: string;
  contextWindow?: string;
  speed?: 'fast' | 'medium' | 'slow';
  isDefault?: boolean;
}

interface ModelSelectorProps {
  models: ModelOption[];
  selectedModel: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

// Default Claude models
export const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Best balance of speed and capability',
    provider: 'Anthropic',
    contextWindow: '200K',
    speed: 'fast',
    isDefault: true,
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    description: 'Most capable, best for complex tasks',
    provider: 'Anthropic',
    contextWindow: '200K',
    speed: 'slow',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest responses, great for simple tasks',
    provider: 'Anthropic',
    contextWindow: '200K',
    speed: 'fast',
  },
];

function getSpeedIcon(speed?: 'fast' | 'medium' | 'slow') {
  switch (speed) {
    case 'fast':
      return Zap;
    case 'slow':
      return Brain;
    default:
      return Sparkles;
  }
}

function getSpeedColor(speed?: 'fast' | 'medium' | 'slow') {
  switch (speed) {
    case 'fast':
      return 'text-green-500 dark:text-green-400';
    case 'slow':
      return 'text-purple-500 dark:text-purple-400';
    default:
      return 'text-blue-500 dark:text-blue-400';
  }
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  models = DEFAULT_MODELS,
  selectedModel,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentModel = models.find((m) => m.id === selectedModel) || models[0];

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
        <Cpu size={14} className="text-indigo-500" />
        <span className="text-gray-700 dark:text-gray-200 max-w-[120px] truncate">
          {currentModel?.name || 'Select Model'}
        </span>
        <ChevronDown size={12} className="text-gray-400" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
          <div className="px-3 pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Select Model</p>
          </div>

          {models.map((model) => {
            const SpeedIcon = getSpeedIcon(model.speed);
            const speedColor = getSpeedColor(model.speed);
            const isSelected = selectedModel === model.id;

            return (
              <button
                key={model.id}
                onClick={() => {
                  onChange(model.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                }`}
              >
                <div className={`mt-0.5 ${speedColor}`}>
                  <SpeedIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                      {model.name}
                    </span>
                    {model.isDefault && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {model.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {model.provider}
                    </span>
                    {model.contextWindow && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {model.contextWindow} context
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
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

export default ModelSelector;
