import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Package,
  Terminal,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { checkEnvironment, type EnvironmentStatus, type ToolStatus } from '../lib/tauri-api';

interface EnvironmentSetupProps {
  compact?: boolean;
}

const TOOL_INFO: Record<string, { label: string; description: string; installUrl: string; installCmd?: string }> = {
  node: {
    label: 'Node.js',
    description: 'Required for npx-based MCP servers',
    installUrl: 'https://nodejs.org/',
    installCmd: 'brew install node',
  },
  npx: {
    label: 'npx',
    description: 'Runs MCP servers like @anthropic/mcp-server-*',
    installUrl: 'https://nodejs.org/',
  },
  uvx: {
    label: 'uvx',
    description: 'Runs Python-based MCP servers',
    installUrl: 'https://docs.astral.sh/uv/',
    installCmd: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  },
  uv: {
    label: 'uv',
    description: 'Fast Python package manager',
    installUrl: 'https://docs.astral.sh/uv/',
    installCmd: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  },
  python: {
    label: 'Python',
    description: 'Required for some MCP servers',
    installUrl: 'https://www.python.org/',
    installCmd: 'brew install python3',
  },
};

const ToolStatusRow: React.FC<{ tool: ToolStatus; compact?: boolean }> = ({ tool, compact }) => {
  const info = TOOL_INFO[tool.name] || { label: tool.name, description: '', installUrl: '' };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {tool.installed ? (
          <CheckCircle2 size={14} className="text-green-500" />
        ) : (
          <XCircle size={14} className="text-gray-300" />
        )}
        <span className={`text-xs ${tool.installed ? 'text-foreground' : 'text-muted-foreground'}`}>
          {info.label}
        </span>
        {tool.installed && tool.version && (
          <span className="text-xs text-muted-foreground">
            {tool.version.replace(/^v/, '')}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${
      tool.installed
        ? 'bg-green-50 dark:bg-green-900/20'
        : 'bg-gray-50 dark:bg-gray-800/50'
    }`}>
      <div className={`p-1.5 rounded-md ${
        tool.installed
          ? 'bg-green-100 dark:bg-green-800'
          : 'bg-gray-200 dark:bg-gray-700'
      }`}>
        {tool.installed ? (
          <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />
        ) : (
          <XCircle size={14} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{info.label}</span>
          {tool.installed && tool.version && (
            <span className="text-xs text-muted-foreground bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {tool.version.replace(/^v/, '')}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {tool.installed ? (tool.path || info.description) : info.description}
        </div>
      </div>
      {!tool.installed && info.installUrl && (
        <a
          href={info.installUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title={`Install ${info.label}`}
        >
          <ExternalLink size={14} className="text-muted-foreground" />
        </a>
      )}
    </div>
  );
};

const EnvironmentSetup: React.FC<EnvironmentSetupProps> = ({ compact = false }) => {
  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await checkEnvironment();
      setStatus(result);
    } catch (error) {
      console.error('Failed to check environment:', error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw size={14} className="animate-spin" />
        <span>Checking environment...</span>
      </div>
    );
  }

  // Count installed tools
  const tools = [status.node, status.npx, status.uvx, status.uv, status.python];
  const installedCount = tools.filter(t => t.installed).length;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Package size={14} className="text-muted-foreground" />
            <span className="font-medium text-foreground">MCP Runtime</span>
            <span className="text-xs text-muted-foreground">
              {installedCount}/{tools.length} tools
            </span>
          </div>
          <button
            onClick={checkStatus}
            disabled={isChecking}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <RefreshCw size={12} className={`text-gray-400 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {tools.map(tool => (
            <ToolStatusRow key={tool.name} tool={tool} compact />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown size={16} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={16} className="text-muted-foreground" />
          )}
          <Terminal size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">MCP Runtime Environment</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            installedCount === tools.length
              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
              : installedCount > 2
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
          }`}>
            {installedCount}/{tools.length}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            checkStatus();
          }}
          disabled={isChecking}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={`text-gray-400 ${isChecking ? 'animate-spin' : ''}`} />
        </button>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="space-y-4 pl-2">
          {/* Summary */}
          <div className={`p-3 rounded-lg ${
            installedCount === tools.length
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : installedCount > 2
              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
              : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
          }`}>
            <div className="text-sm">
              {installedCount === tools.length ? (
                <span className="text-green-700 dark:text-green-300">
                  All MCP runtime tools are installed
                </span>
              ) : installedCount > 2 ? (
                <span className="text-blue-700 dark:text-blue-300">
                  {installedCount} of {tools.length} tools installed - most MCP servers will work
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">
                  {installedCount} of {tools.length} tools installed - install Node.js or uv for MCP support
                </span>
              )}
            </div>
          </div>

          {/* Tool List */}
          <div className="space-y-2">
            {/* Node.js Group */}
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
              Node.js (for npx servers)
            </div>
            <ToolStatusRow tool={status.node} />
            <ToolStatusRow tool={status.npx} />

            {/* Python/uv Group */}
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1 mt-4">
              Python/uv (for uvx servers)
            </div>
            <ToolStatusRow tool={status.python} />
            <ToolStatusRow tool={status.uv} />
            <ToolStatusRow tool={status.uvx} />
          </div>

          {/* Help Text */}
          <div className="text-xs text-muted-foreground">
            MCP servers use either <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">npx</code> (Node.js)
            or <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">uvx</code> (Python) to run.
            Install the runtime matching your MCP servers.
          </div>
        </div>
      )}
    </div>
  );
};

export default EnvironmentSetup;
