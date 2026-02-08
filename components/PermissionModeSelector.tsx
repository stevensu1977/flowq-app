import React, { useState, useRef, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, ChevronDown } from 'lucide-react';

export type PermissionMode = 'safe' | 'ask' | 'allow-all';

interface PermissionModeSelectorProps {
  mode: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}

const PERMISSION_MODES: { id: PermissionMode; label: string; description: string; icon: typeof Shield; color: string }[] = [
  {
    id: 'safe',
    label: 'Safe Mode',
    description: 'Ask for all potentially dangerous operations',
    icon: Shield,
    color: 'text-green-500 dark:text-green-400',
  },
  {
    id: 'ask',
    label: 'Ask Mode',
    description: 'Ask only for file writes and shell commands',
    icon: ShieldAlert,
    color: 'text-amber-500 dark:text-amber-400',
  },
  {
    id: 'allow-all',
    label: 'Allow All',
    description: 'Skip all permission prompts (use with caution)',
    icon: ShieldCheck,
    color: 'text-red-500 dark:text-red-400',
  },
];

const PermissionModeSelector: React.FC<PermissionModeSelectorProps> = ({
  mode,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentMode = PERMISSION_MODES.find((m) => m.id === mode) || PERMISSION_MODES[0];
  const Icon = currentMode.icon;

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
        <Icon size={14} className={currentMode.color} />
        <span className="text-gray-700 dark:text-gray-200">{currentMode.label}</span>
        <ChevronDown size={12} className="text-gray-400" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
          {PERMISSION_MODES.map((modeOption) => {
            const ModeIcon = modeOption.icon;
            const isSelected = mode === modeOption.id;

            return (
              <button
                key={modeOption.id}
                onClick={() => {
                  onChange(modeOption.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  isSelected ? 'bg-gray-50 dark:bg-gray-700' : ''
                }`}
              >
                <div className={`mt-0.5 ${modeOption.color}`}>
                  <ModeIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {modeOption.label}
                    </span>
                    {isSelected && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 rounded">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {modeOption.description}
                  </p>
                </div>
              </button>
            );
          })}

          {/* Warning for allow-all mode */}
          {mode === 'allow-all' && (
            <div className="mx-3 mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-600 dark:text-red-400">
                <strong>Warning:</strong> All operations will be executed without confirmation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PermissionModeSelector;
