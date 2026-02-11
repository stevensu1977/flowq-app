import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Moon,
  Sun,
  Monitor,
  Shield,
  Cpu,
  Key,
  Keyboard,
  Palette,
  X,
  Check,
  Server,
  Zap,
  Cloud,
  Eye,
  EyeOff,
  ChevronDown,
  Link2,
  Plug,
  Globe,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { PermissionMode } from './PermissionModeSelector';
import { DEFAULT_MODELS, ModelOption } from './ModelSelector';
import McpManager from './McpManager';
import SkillsManager from './SkillsManager';
import type { ApiSettings } from '../lib/tauri-api';
import { DEFAULT_API_SETTINGS } from '../lib/tauri-api';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  apiSettings?: ApiSettings;
  onSaveApiSettings?: (settings: ApiSettings) => void;
}

// AWS Regions for Bedrock
const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
];

export type SettingsTab = 'preferences' | 'providers' | 'integrations' | 'mcp' | 'skills' | 'permissions' | 'appearance' | 'shortcuts';

interface SettingsState {
  permissionMode: PermissionMode;
  autoSave: boolean;
  showLineNumbers: boolean;
  confirmDelete: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  permissionMode: 'ask',
  autoSave: true,
  showLineNumbers: true,
  confirmDelete: true,
};

// Storage keys
const STORAGE_KEYS = {
  settings: 'flowq-settings',
};

// Settings sections
const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'providers', label: 'AI Provider', icon: Cpu },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'mcp', label: 'MCP Servers', icon: Plug },
  { id: 'skills', label: 'Skills', icon: Zap },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
];

// Theme options
const THEME_OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const;

// Permission mode options
const PERMISSION_OPTIONS: { id: PermissionMode; label: string; description: string }[] = [
  { id: 'safe', label: 'Safe Mode', description: 'Ask for all potentially dangerous operations' },
  { id: 'ask', label: 'Ask Mode', description: 'Ask only for file writes and shell commands' },
  { id: 'allow-all', label: 'Allow All', description: 'Skip all permission prompts (use with caution)' },
];

// Keyboard shortcuts
const SHORTCUTS = [
  { key: '⌘K', description: 'Open command palette' },
  { key: '⌘N', description: 'New conversation' },
  { key: '⌘/', description: 'Show shortcuts help' },
  { key: 'Esc', description: 'Cancel operation / Close dialog' },
  { key: 'Enter', description: 'Send message' },
  { key: 'Shift+Enter', description: 'New line in message' },
  { key: '⌘+Click', description: 'Open link in browser' },
];

const SettingsPage: React.FC<SettingsPageProps> = ({ isOpen, onClose, initialTab, apiSettings, onSaveApiSettings }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'preferences');

  // Update active tab when initialTab changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [localApiSettings, setLocalApiSettings] = useState<ApiSettings>(apiSettings || DEFAULT_API_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Sync local API settings when prop changes
  useEffect(() => {
    if (apiSettings) {
      setLocalApiSettings(apiSettings);
    }
  }, [apiSettings]);

  // Load all settings from localStorage
  useEffect(() => {
    // General settings
    const savedSettings = localStorage.getItem(STORAGE_KEYS.settings);
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch {
        // Ignore invalid JSON
      }
    }

    }, []);

  // Save settings to localStorage
  const updateSettings = (updates: Partial<SettingsState>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(newSettings));
  };

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end p-4">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-overlay transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="relative w-full max-w-3xl h-full bg-card shadow-2xl border border-border rounded-2xl flex overflow-hidden slide-in-right">
        {/* Sidebar */}
        <div className="w-52 border-r border-border bg-muted/50 p-4 paper-texture">
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Settings</h2>
              <p className="text-xs text-muted-foreground">Configure preferences</p>
            </div>
          </div>

          <nav className="space-y-1 relative z-10">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-card text-accent shadow-sm border border-border/50'
                      : 'text-muted-foreground hover:bg-card/50 hover:text-foreground'
                  }`}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-background">
          {/* Header */}
          <div className="h-14 border-b border-border px-6 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-w-0">
            {/* Preferences Settings */}
            {activeTab === 'preferences' && (
              <div className="space-y-6">
                {/* Behavior Toggles */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    Behavior
                  </label>
                  <div className="space-y-2">
                    <ToggleItem
                      label="Auto-save conversations"
                      description="Automatically save conversations as you type"
                      checked={settings.autoSave}
                      onChange={(checked) => updateSettings({ autoSave: checked })}
                    />
                    <ToggleItem
                      label="Show line numbers"
                      description="Display line numbers in code blocks"
                      checked={settings.showLineNumbers}
                      onChange={(checked) => updateSettings({ showLineNumbers: checked })}
                    />
                    <ToggleItem
                      label="Confirm before delete"
                      description="Ask for confirmation when deleting conversations"
                      checked={settings.confirmDelete}
                      onChange={(checked) => updateSettings({ confirmDelete: checked })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Model Providers Settings */}
            {activeTab === 'providers' && (
              <div className="space-y-6">
                {/* Provider Selection */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Provider</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setLocalApiSettings(prev => ({ ...prev, provider: 'anthropic' }))}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        localApiSettings.provider === 'anthropic'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Server size={20} className={localApiSettings.provider === 'anthropic' ? 'text-purple-500' : 'text-gray-400'} />
                      <div className="text-left">
                        <div className="font-medium text-gray-900 dark:text-white">Anthropic API</div>
                        <div className="text-xs text-gray-500">Direct or Proxy</div>
                      </div>
                      {localApiSettings.provider === 'anthropic' && (
                        <Check size={16} className="text-purple-500 ml-auto" />
                      )}
                    </button>
                    <button
                      onClick={() => setLocalApiSettings(prev => ({ ...prev, provider: 'bedrock' }))}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        localApiSettings.provider === 'bedrock'
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Cloud size={20} className={localApiSettings.provider === 'bedrock' ? 'text-orange-500' : 'text-gray-400'} />
                      <div className="text-left">
                        <div className="font-medium text-gray-900 dark:text-white">AWS Bedrock</div>
                        <div className="text-xs text-gray-500">Via AWS Account</div>
                      </div>
                      {localApiSettings.provider === 'bedrock' && (
                        <Check size={16} className="text-orange-500 ml-auto" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Anthropic Settings */}
                {localApiSettings.provider === 'anthropic' && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    {/* Official / Custom Mode Slider Toggle */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        API Mode
                      </label>
                      <div
                        className="relative inline-flex items-center rounded-xl p-1 bg-muted border border-border cursor-pointer"
                        onClick={() => setLocalApiSettings(prev => ({
                          ...prev,
                          anthropicMode: prev.anthropicMode === 'custom' ? 'official' : 'custom'
                        }))}
                        role="switch"
                        aria-checked={localApiSettings.anthropicMode === 'custom'}
                      >
                        {/* Sliding indicator */}
                        <div
                          className={`absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-lg bg-card shadow-sm border border-border/50 transition-all duration-200 ease-out ${
                            localApiSettings.anthropicMode !== 'custom' ? 'left-1' : 'left-[calc(50%+2px)]'
                          }`}
                        />

                        {/* Official option */}
                        <button
                          type="button"
                          className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ${
                            localApiSettings.anthropicMode !== 'custom'
                              ? 'text-purple-600 dark:text-purple-400'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocalApiSettings(prev => ({ ...prev, anthropicMode: 'official' }));
                          }}
                        >
                          <Globe size={14} />
                          <span>Official</span>
                        </button>

                        {/* Custom option */}
                        <button
                          type="button"
                          className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ${
                            localApiSettings.anthropicMode === 'custom'
                              ? 'text-purple-600 dark:text-purple-400'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocalApiSettings(prev => ({ ...prev, anthropicMode: 'custom' }));
                          }}
                        >
                          <Plug size={14} />
                          <span>Custom</span>
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {localApiSettings.anthropicMode !== 'custom'
                          ? 'Using official api.anthropic.com'
                          : 'Using your own proxy endpoint'}
                      </p>
                    </div>

                    {/* API Key - Always shown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={localApiSettings.anthropicApiKey || ''}
                          onChange={(e) => setLocalApiSettings(prev => ({ ...prev, anthropicApiKey: e.target.value }))}
                          placeholder="sk-ant-..."
                          className="w-full px-4 py-3 pr-12 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>

                    {/* Custom Mode: Base URL and Model */}
                    {localApiSettings.anthropicMode === 'custom' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Base URL
                          </label>
                          <input
                            type="text"
                            value={localApiSettings.anthropicBaseUrl || ''}
                            onChange={(e) => setLocalApiSettings(prev => ({ ...prev, anthropicBaseUrl: e.target.value }))}
                            placeholder="https://your-proxy.example.com"
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Model ID
                          </label>
                          <input
                            type="text"
                            value={localApiSettings.anthropicModel || ''}
                            onChange={(e) => setLocalApiSettings(prev => ({ ...prev, anthropicModel: e.target.value }))}
                            placeholder="claude-sonnet-4-5-20250514"
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                          />
                        </div>
                      </>
                    )}

                    {/* Default Model Selection - Only for Official Mode */}
                    {localApiSettings.anthropicMode !== 'custom' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Default Model
                        </label>
                        <select
                          value={localApiSettings.defaultModel || DEFAULT_MODELS[0].id}
                          onChange={(e) => setLocalApiSettings(prev => ({ ...prev, defaultModel: e.target.value }))}
                          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-foreground appearance-none cursor-pointer"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 12px center',
                          }}
                        >
                          {DEFAULT_MODELS.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name} {model.id === DEFAULT_MODELS[0].id ? '(Recommended)' : ''}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-2">
                          {DEFAULT_MODELS.find(m => m.id === localApiSettings.defaultModel)?.description || DEFAULT_MODELS[0].description}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bedrock Settings */}
                {localApiSettings.provider === 'bedrock' && (
                  <div className="space-y-4">
                    {/* Region */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        AWS Region
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsRegionOpen(!isRegionOpen)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl"
                        >
                          <span className="text-gray-900 dark:text-white">
                            {AWS_REGIONS.find(r => r.value === localApiSettings.bedrockRegion)?.label || 'Select region...'}
                          </span>
                          <ChevronDown size={20} className={`text-gray-400 transition-transform ${isRegionOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isRegionOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                            {AWS_REGIONS.map(region => (
                              <button
                                key={region.value}
                                onClick={() => {
                                  setLocalApiSettings(prev => ({ ...prev, bedrockRegion: region.value }));
                                  setIsRegionOpen(false);
                                }}
                                className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                  localApiSettings.bedrockRegion === region.value ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600' : ''
                                }`}
                              >
                                {region.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auth Method */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Authentication
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setLocalApiSettings(prev => ({ ...prev, bedrockAuthMethod: 'profile' }))}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            localApiSettings.bedrockAuthMethod !== 'access_key'
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">AWS Profile</span>
                            {localApiSettings.bedrockAuthMethod !== 'access_key' && <Check size={14} className="text-orange-500" />}
                          </div>
                          <p className="text-xs text-gray-500">~/.aws/credentials</p>
                        </button>
                        <button
                          onClick={() => setLocalApiSettings(prev => ({ ...prev, bedrockAuthMethod: 'access_key' }))}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            localApiSettings.bedrockAuthMethod === 'access_key'
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">Access Key</span>
                            {localApiSettings.bedrockAuthMethod === 'access_key' && <Check size={14} className="text-orange-500" />}
                          </div>
                          <p className="text-xs text-gray-500">Key ID + Secret</p>
                        </button>
                      </div>
                    </div>

                    {/* Profile or Access Keys */}
                    {localApiSettings.bedrockAuthMethod !== 'access_key' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Profile Name <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={localApiSettings.bedrockProfile || ''}
                          onChange={(e) => setLocalApiSettings(prev => ({ ...prev, bedrockProfile: e.target.value }))}
                          placeholder="default"
                          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Access Key ID
                          </label>
                          <input
                            type="text"
                            value={localApiSettings.bedrockAccessKeyId || ''}
                            onChange={(e) => setLocalApiSettings(prev => ({ ...prev, bedrockAccessKeyId: e.target.value }))}
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Secret Access Key
                          </label>
                          <div className="relative">
                            <input
                              type={showSecretKey ? 'text' : 'password'}
                              value={localApiSettings.bedrockSecretAccessKey || ''}
                              onChange={(e) => setLocalApiSettings(prev => ({ ...prev, bedrockSecretAccessKey: e.target.value }))}
                              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                              className="w-full px-4 py-3 pr-12 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecretKey(!showSecretKey)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            >
                              {showSecretKey ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Model */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Model <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={localApiSettings.bedrockModel || ''}
                        onChange={(e) => setLocalApiSettings(prev => ({ ...prev, bedrockModel: e.target.value }))}
                        placeholder="us.anthropic.claude-sonnet-4-5-20250929-v1:0"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <div className="pt-4 border-t border-border">
                  <button
                    onClick={() => {
                      onSaveApiSettings?.(localApiSettings);
                    }}
                    className="w-full px-4 py-2.5 bg-accent text-accent-foreground font-medium rounded-xl hover:opacity-90 transition-colors"
                  >
                    Save API Settings
                  </button>
                </div>
              </div>
            )}

            {/* Integrations Settings */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                {/* Local Note Apps Section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">💻</span>
                    <h4 className="text-sm font-semibold text-foreground">Local Note Apps</h4>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded">
                      100% Private
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Connect local note-taking apps. Data stays on your machine.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Obsidian', icon: '💎', description: 'Markdown vault', color: 'purple' },
                      { name: 'Craft', icon: '📝', description: 'Rich documents', color: 'blue' },
                      { name: 'Logseq', icon: '🌳', description: 'Outliner & PKM', color: 'green' },
                      { name: 'Bear', icon: '🐻', description: 'Markdown notes', color: 'red' },
                    ].map((app) => (
                      <button
                        key={app.name}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-accent/30 hover:bg-accent/5 transition-all text-left group"
                      >
                        <div className={`w-9 h-9 rounded-lg bg-${app.color}-100 dark:bg-${app.color}-900/30 flex items-center justify-center`}>
                          <span className="text-lg">{app.icon}</span>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{app.name}</div>
                          <div className="text-xs text-muted-foreground">{app.description}</div>
                        </div>
                        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          Connect →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* Cloud Integrations Section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">☁️</span>
                    <h4 className="text-sm font-semibold text-foreground">Cloud Integrations</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Connect cloud services via OAuth. Requires authentication.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Notion', icon: '📄', description: 'Wikis & databases' },
                      { name: 'GitHub', icon: '🐙', description: 'Repos & issues' },
                      { name: 'Google Drive', icon: '📁', description: 'Docs & files' },
                      { name: 'Linear', icon: '📊', description: 'Issue tracking' },
                      { name: 'Slack', icon: '💬', description: 'Team messages' },
                      { name: 'Jira', icon: '🎯', description: 'Project tracking' },
                    ].map((integration) => (
                      <button
                        key={integration.name}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-accent/30 hover:bg-accent/5 transition-all text-left group"
                      >
                        <span className="text-xl">{integration.icon}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{integration.name}</div>
                          <div className="text-xs text-muted-foreground">{integration.description}</div>
                        </div>
                        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          Connect →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info Box */}
                <div className="p-4 bg-accent/5 rounded-xl border border-accent/20">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Privacy Note:</strong> Local note apps access files directly on your machine—no data leaves your computer. Cloud integrations use OAuth and only fetch data when requested.
                  </p>
                </div>
              </div>
            )}

            {/* MCP Servers Settings */}
            {activeTab === 'mcp' && <McpManager />}

            {/* Skills Settings */}
            {activeTab === 'skills' && <SkillsManager />}

            {/* Permissions Settings */}
            {activeTab === 'permissions' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Shield size={16} className="text-muted-foreground" />
                    Default Permission Mode
                  </label>
                  <div className="space-y-2">
                    {PERMISSION_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => updateSettings({ permissionMode: option.id })}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                          settings.permissionMode === option.id
                            ? 'border-accent bg-accent/10'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium text-foreground">
                            {option.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                        {settings.permissionMode === option.id && (
                          <Check size={16} className="text-accent" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {settings.permissionMode === 'allow-all' && (
                  <div className="px-4 py-3 bg-danger/10 rounded-xl border border-danger/30">
                    <p className="text-sm text-danger">
                      <strong>Warning:</strong> In "Allow All" mode, all operations will be executed without confirmation. Use with caution.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Appearance Settings */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Palette size={16} className="text-muted-foreground" />
                    Theme
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {THEME_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.id}
                          onClick={() => setTheme(option.id)}
                          className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-colors ${
                            theme === option.id
                              ? 'border-accent bg-accent/10'
                              : 'border-border hover:bg-muted'
                          }`}
                        >
                          <Icon
                            size={24}
                            className={theme === option.id ? 'text-accent' : 'text-muted-foreground'}
                          />
                          <span
                            className={`text-sm font-medium ${
                              theme === option.id
                                ? 'text-accent'
                                : 'text-foreground'
                            }`}
                          >
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Shortcuts */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Keyboard shortcuts to help you work faster
                </p>
                <div className="space-y-2">
                  {SHORTCUTS.map((shortcut, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 py-3 bg-muted rounded-xl"
                    >
                      <span className="text-sm text-foreground">
                        {shortcut.description}
                      </span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-card border border-border rounded shadow-sm text-foreground">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Toggle Item Component
interface ToggleItemProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleItem: React.FC<ToggleItemProps> = ({ label, description, checked, onChange }) => (
  <div
    onClick={() => onChange(!checked)}
    className="flex items-center justify-between px-4 py-3 rounded-xl border border-border cursor-pointer hover:bg-muted transition-colors"
  >
    <div>
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
    <div
      className={`w-10 h-6 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-border'
      }`}
    >
      <div
        className={`w-5 h-5 bg-white dark:bg-card rounded-full shadow-sm transform transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        } mt-0.5`}
      />
    </div>
  </div>
);

export default SettingsPage;
