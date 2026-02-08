import React, { useState, useCallback, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Server,
  Terminal,
  Globe,
  Wifi,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  FileJson,
} from 'lucide-react';
import {
  mcpListServers,
  mcpAddServer,
  mcpRemoveServer,
  mcpToggleServer,
  mcpUpdateServer,
  type McpServerInfo,
  type AddMcpServerRequest,
} from '../lib/tauri-api';

// Default templates for quick start
const DEFAULT_MCP_TEMPLATES: Omit<AddMcpServerRequest, 'name'>[] = [
  {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
  },
  {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: '' },
  },
  {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
  },
];

const TEMPLATE_INFO = [
  { name: 'Filesystem', description: 'Read and write files on the local filesystem' },
  { name: 'GitHub', description: 'Interact with GitHub repositories' },
  { name: 'Brave Search', description: 'Search the web using Brave Search API' },
];

type TransportType = 'stdio' | 'http';

const TRANSPORT_ICONS: Record<TransportType, typeof Terminal> = {
  stdio: Terminal,
  http: Globe,
};

interface NewServerForm {
  name: string;
  transport: TransportType;
  command: string;
  args: string;
  url: string;
  env: string;
}

const McpManager: React.FC = () => {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState<NewServerForm>({
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    url: '',
    env: '',
  });

  // Load servers from ~/.claude.json
  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await mcpListServers();
      setServers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MCP servers');
      console.error('Failed to load MCP servers:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Toggle server enabled/disabled
  const handleToggle = useCallback(async (name: string, currentDisabled: boolean | undefined) => {
    try {
      await mcpToggleServer(name, !currentDisabled);
      await loadServers();
    } catch (e) {
      console.error('Failed to toggle server:', e);
      setError(e instanceof Error ? e.message : 'Failed to toggle server');
    }
  }, [loadServers]);

  // Delete server
  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`Delete MCP server "${name}"?`)) return;
    try {
      await mcpRemoveServer(name);
      await loadServers();
    } catch (e) {
      console.error('Failed to delete server:', e);
      setError(e instanceof Error ? e.message : 'Failed to delete server');
    }
  }, [loadServers]);

  // Add from template
  const handleAddFromTemplate = useCallback(async (templateIndex: number) => {
    const template = DEFAULT_MCP_TEMPLATES[templateIndex];
    const info = TEMPLATE_INFO[templateIndex];

    try {
      await mcpAddServer({
        name: info.name,
        ...template,
      });
      setShowTemplates(false);
      await loadServers();
    } catch (e) {
      console.error('Failed to add server from template:', e);
      setError(e instanceof Error ? e.message : 'Failed to add server');
    }
  }, [loadServers]);

  // Add new server from form
  const handleAddServer = useCallback(async () => {
    if (!newServer.name.trim()) return;

    try {
      const config: AddMcpServerRequest = {
        name: newServer.name.trim(),
        transport: newServer.transport,
      };

      if (newServer.transport === 'stdio') {
        if (newServer.command.trim()) {
          config.command = newServer.command.trim();
        }
        if (newServer.args.trim()) {
          config.args = newServer.args.split('\n').filter(Boolean);
        }
      } else {
        if (newServer.url.trim()) {
          config.url = newServer.url.trim();
        }
      }

      // Parse environment variables
      if (newServer.env.trim()) {
        const env: Record<string, string> = {};
        newServer.env.split('\n').forEach(line => {
          const [key, ...rest] = line.split('=');
          if (key?.trim()) {
            env[key.trim()] = rest.join('=');
          }
        });
        if (Object.keys(env).length > 0) {
          config.env = env;
        }
      }

      await mcpAddServer(config);
      setShowAddForm(false);
      setNewServer({
        name: '',
        transport: 'stdio',
        command: '',
        args: '',
        url: '',
        env: '',
      });
      await loadServers();
    } catch (e) {
      console.error('Failed to add server:', e);
      setError(e instanceof Error ? e.message : 'Failed to add server');
    }
  }, [newServer, loadServers]);

  // Update server inline
  const handleUpdateServer = useCallback(async (name: string, updates: Partial<AddMcpServerRequest>) => {
    const server = servers.find(s => s.name === name);
    if (!server) return;

    try {
      const config: AddMcpServerRequest = {
        name: server.name,
        transport: updates.transport || server.transport,
        command: updates.command !== undefined ? updates.command : server.command,
        args: updates.args !== undefined ? updates.args : server.args,
        env: updates.env !== undefined ? updates.env : server.env,
        url: updates.url !== undefined ? updates.url : server.url,
      };

      await mcpUpdateServer(name, config);
      await loadServers();
    } catch (e) {
      console.error('Failed to update server:', e);
      setError(e instanceof Error ? e.message : 'Failed to update server');
    }
  }, [servers, loadServers]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">MCP Servers</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Configure Model Context Protocol servers in ~/.claude.json
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={loadServers}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Templates
            <ChevronDown size={12} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Templates Dropdown */}
      {showTemplates && (
        <div className="grid grid-cols-1 gap-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Quick Start Templates</p>
          {TEMPLATE_INFO.map((info, i) => (
            <button
              key={i}
              onClick={() => handleAddFromTemplate(i)}
              className="flex items-center gap-3 px-3 py-2 text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
            >
              <Server size={18} className="text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {info.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {info.description}
                </div>
              </div>
              <Plus size={16} className="text-gray-400" />
            </button>
          ))}
        </div>
      )}

      {/* Server List */}
      <div className="space-y-3">
        {loading && servers.length === 0 ? (
          <div className="text-center py-8">
            <RefreshCw size={24} className="animate-spin text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading servers...</p>
          </div>
        ) : servers.length === 0 && !showAddForm ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <Server size={24} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">No MCP servers configured</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Config file: ~/.claude.json
            </p>
            <button
              onClick={() => setShowTemplates(true)}
              className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Browse templates to get started
            </button>
          </div>
        ) : (
          servers.map((server) => {
            const TransportIcon = TRANSPORT_ICONS[server.transport as TransportType] || Terminal;
            const isExpanded = expandedName === server.name;
            const isDisabled = server.disabled === true;

            return (
              <div
                key={server.name}
                className={`rounded-xl border transition-colors ${
                  isDisabled
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                    : 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10'
                }`}
              >
                {/* Server Header */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => setExpandedName(isExpanded ? null : server.name)}
                    className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <TransportIcon size={16} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {server.name}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDisabled ? 'bg-gray-400' : 'bg-green-500'}`} />
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {server.transport}
                      </span>
                    </div>
                    {server.command && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate block font-mono">
                        {server.command} {server.args?.join(' ')}
                      </span>
                    )}
                    {server.url && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate block font-mono">
                        {server.url}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(server.name, server.disabled)}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                        isDisabled
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      }`}
                    >
                      {isDisabled ? 'Disabled' : 'Enabled'}
                    </button>
                    <button
                      onClick={() => handleDelete(server.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded Section */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
                    {/* Configuration */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Transport */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Transport
                        </label>
                        <select
                          value={server.transport}
                          onChange={(e) => handleUpdateServer(server.name, { transport: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="stdio">stdio (subprocess)</option>
                          <option value="http">HTTP</option>
                        </select>
                      </div>

                      {/* Command (for stdio) */}
                      {server.transport === 'stdio' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Command
                          </label>
                          <input
                            type="text"
                            value={server.command || ''}
                            onChange={(e) => handleUpdateServer(server.name, { command: e.target.value })}
                            placeholder="npx"
                            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      )}

                      {/* URL (for http) */}
                      {server.transport === 'http' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            URL
                          </label>
                          <input
                            type="text"
                            value={server.url || ''}
                            onChange={(e) => handleUpdateServer(server.name, { url: e.target.value })}
                            placeholder="http://localhost:3000"
                            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      )}
                    </div>

                    {/* Arguments (for stdio) */}
                    {server.transport === 'stdio' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Arguments (one per line)
                        </label>
                        <textarea
                          value={(server.args || []).join('\n')}
                          onChange={(e) => handleUpdateServer(server.name, { args: e.target.value.split('\n').filter(Boolean) })}
                          placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/dir"
                          rows={3}
                          className="w-full px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    )}

                    {/* Environment Variables */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Environment Variables (KEY=value, one per line)
                      </label>
                      <textarea
                        value={Object.entries(server.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                        onChange={(e) => {
                          const env: Record<string, string> = {};
                          e.target.value.split('\n').forEach(line => {
                            const [key, ...rest] = line.split('=');
                            if (key?.trim()) env[key.trim()] = rest.join('=');
                          });
                          handleUpdateServer(server.name, { env });
                        }}
                        placeholder="GITHUB_TOKEN=ghp_xxx&#10;API_KEY=xxx"
                        rows={2}
                        className="w-full px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add New Server Form */}
      {showAddForm && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 p-3 space-y-3">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Add New MCP Server</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Server Name
              </label>
              <input
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="My MCP Server"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Transport
              </label>
              <select
                value={newServer.transport}
                onChange={(e) => setNewServer({ ...newServer, transport: e.target.value as TransportType })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="stdio">stdio (subprocess)</option>
                <option value="http">HTTP</option>
              </select>
            </div>
          </div>

          {newServer.transport === 'stdio' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Command
                </label>
                <input
                  type="text"
                  value={newServer.command}
                  onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                  placeholder="npx"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Arguments (one per line)
                </label>
                <textarea
                  value={newServer.args}
                  onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                  placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/dir"
                  rows={3}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL
              </label>
              <input
                type="text"
                value={newServer.url}
                onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                placeholder="http://localhost:3000"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Environment Variables (KEY=value, one per line)
            </label>
            <textarea
              value={newServer.env}
              onChange={(e) => setNewServer({ ...newServer, env: e.target.value })}
              placeholder="GITHUB_TOKEN=ghp_xxx&#10;API_KEY=xxx"
              rows={2}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewServer({
                  name: '',
                  transport: 'stdio',
                  command: '',
                  args: '',
                  url: '',
                  env: '',
                });
              }}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddServer}
              disabled={!newServer.name.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Server
            </button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <FileJson size={16} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          MCP server configurations are stored in <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800/50 rounded">~/.claude.json</code> and automatically loaded by Claude Code CLI.
        </p>
      </div>
    </div>
  );
};

export default McpManager;
