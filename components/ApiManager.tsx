import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Globe,
  Key,
  Sparkles,
  Cloud,
} from 'lucide-react';
import { ApiProvider, ApiProviderType, DEFAULT_API_PROVIDERS } from '../types';

interface ApiManagerProps {
  providers: ApiProvider[];
  onUpdate: (providers: ApiProvider[]) => void;
}

const PROVIDER_ICONS: Record<ApiProviderType, typeof Sparkles> = {
  anthropic: Sparkles,
  openai: Cloud,
  azure: Globe,
  custom: Key,
};

const PROVIDER_COLORS: Record<ApiProviderType, string> = {
  anthropic: '#D97706',
  openai: '#10A37F',
  azure: '#0078D4',
  custom: '#6B7280',
};

const ApiManager: React.FC<ApiManagerProps> = ({ providers, onUpdate }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [newProvider, setNewProvider] = useState<Partial<ApiProvider> | null>(null);

  const handleToggleEnabled = useCallback((id: string) => {
    const updated = providers.map(p =>
      p.id === id ? { ...p, enabled: !p.enabled, updatedAt: new Date() } : p
    );
    onUpdate(updated);
  }, [providers, onUpdate]);

  const handleSetDefault = useCallback((id: string) => {
    const updated = providers.map(p => ({
      ...p,
      isDefault: p.id === id,
      updatedAt: new Date(),
    }));
    onUpdate(updated);
  }, [providers, onUpdate]);

  const handleUpdateApiKey = useCallback((id: string, apiKey: string) => {
    const updated = providers.map(p =>
      p.id === id ? { ...p, apiKey, updatedAt: new Date() } : p
    );
    onUpdate(updated);
  }, [providers, onUpdate]);

  const handleUpdateBaseUrl = useCallback((id: string, baseUrl: string) => {
    const updated = providers.map(p =>
      p.id === id ? { ...p, baseUrl, updatedAt: new Date() } : p
    );
    onUpdate(updated);
  }, [providers, onUpdate]);

  const handleDelete = useCallback((id: string) => {
    const updated = providers.filter(p => p.id !== id);
    onUpdate(updated);
  }, [providers, onUpdate]);

  const handleAddProvider = useCallback(() => {
    if (!newProvider?.name || !newProvider?.type) return;

    const provider: ApiProvider = {
      id: `api-${Date.now()}`,
      name: newProvider.name,
      type: newProvider.type,
      apiKey: newProvider.apiKey || '',
      baseUrl: newProvider.baseUrl,
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    onUpdate([...providers, provider]);
    setNewProvider(null);
  }, [newProvider, providers, onUpdate]);

  const toggleShowApiKey = useCallback((id: string) => {
    setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">API Providers</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Configure API keys for different AI providers
          </p>
        </div>
        <button
          onClick={() => setNewProvider({ type: 'anthropic', name: '' })}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Provider
        </button>
      </div>

      {/* Provider List */}
      <div className="space-y-3">
        {providers.map((provider) => {
          const Icon = PROVIDER_ICONS[provider.type];
          const isEditing = editingId === provider.id;
          const isKeyVisible = showApiKey[provider.id];

          return (
            <div
              key={provider.id}
              className={`rounded-xl border transition-colors ${
                provider.enabled
                  ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}
            >
              {/* Provider Header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${PROVIDER_COLORS[provider.type]}20` }}
                >
                  <Icon size={20} style={{ color: PROVIDER_COLORS[provider.type] }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {provider.name}
                    </span>
                    {provider.isDefault && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">
                        DEFAULT
                      </span>
                    )}
                    {provider.enabled && provider.apiKey && (
                      <Check size={14} className="text-green-500" />
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {provider.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEnabled(provider.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      provider.enabled
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {provider.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => setEditingId(isEditing ? null : provider.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Key size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(provider.id)}
                    className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Expanded Edit Section */}
              {isEditing && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
                  {/* API Key */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={isKeyVisible ? 'text' : 'password'}
                        value={provider.apiKey}
                        onChange={(e) => handleUpdateApiKey(provider.id, e.target.value)}
                        placeholder="Enter your API key..."
                        className="w-full px-3 py-2 pr-10 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <button
                        onClick={() => toggleShowApiKey(provider.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {isKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Base URL */}
                  {(provider.type === 'custom' || provider.type === 'azure') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={provider.baseUrl || ''}
                        onChange={(e) => handleUpdateBaseUrl(provider.id, e.target.value)}
                        placeholder="https://api.example.com"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  )}

                  {/* Set as Default */}
                  {!provider.isDefault && provider.enabled && provider.apiKey && (
                    <button
                      onClick={() => handleSetDefault(provider.id)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Set as default provider
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty State */}
        {providers.length === 0 && !newProvider && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <Key size={24} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">No API providers configured</p>
            <button
              onClick={() => setNewProvider({ type: 'anthropic', name: '' })}
              className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Add your first provider
            </button>
          </div>
        )}
      </div>

      {/* Add New Provider Form */}
      {newProvider && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Add New Provider</h4>

          {/* Provider Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Provider Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['anthropic', 'openai', 'azure', 'custom'] as ApiProviderType[]).map((type) => {
                const Icon = PROVIDER_ICONS[type];
                return (
                  <button
                    key={type}
                    onClick={() => setNewProvider({ ...newProvider, type, name: newProvider.name || type.charAt(0).toUpperCase() + type.slice(1) })}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                      newProvider.type === type
                        ? 'border-indigo-500 bg-white dark:bg-gray-800'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon size={18} style={{ color: PROVIDER_COLORS[type] }} />
                    <span className="text-xs capitalize">{type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={newProvider.name || ''}
              onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
              placeholder="My API Provider"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={newProvider.apiKey || ''}
              onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setNewProvider(null)}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddProvider}
              disabled={!newProvider.name}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Provider
            </button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          API keys are stored locally and never sent to our servers. Keep them secure and never share them.
        </p>
      </div>
    </div>
  );
};

export default ApiManager;
