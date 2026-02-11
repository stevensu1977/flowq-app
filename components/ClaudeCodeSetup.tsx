import React, { useState, useEffect, useCallback } from 'react';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  Download,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { checkClaudeCode, installClaudeCode, getClaudeCodeInstallCommand, type ClaudeCodeStatus } from '../lib/tauri-api';

interface ClaudeCodeSetupProps {
  onStatusChange?: (installed: boolean) => void;
  compact?: boolean;
}

const ClaudeCodeSetup: React.FC<ClaudeCodeSetupProps> = ({
  onStatusChange,
  compact = false,
}) => {
  const [status, setStatus] = useState<ClaudeCodeStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await checkClaudeCode();
      setStatus(result);
      onStatusChange?.(result.installed);
    } catch (error) {
      console.error('Failed to check Claude Code status:', error);
      setStatus({ installed: false, version: null, path: null });
      onStatusChange?.(false);
    } finally {
      setIsChecking(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallOutput(null);
    setInstallError(null);

    try {
      const output = await installClaudeCode();
      setInstallOutput(output);
      // Re-check status after installation
      await checkStatus();
    } catch (error) {
      setInstallError(error as string);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyCommand = async () => {
    try {
      const command = await getClaudeCodeInstallCommand();
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy command:', error);
    }
  };

  if (compact && status?.installed) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <CheckCircle2 size={16} />
        <span>Claude Code CLI ready</span>
        {status.version && (
          <span className="text-xs text-gray-400">({status.version})</span>
        )}
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
          <span className="text-sm font-medium text-foreground">Claude Code CLI</span>
          {isChecking ? (
            <RefreshCw size={14} className="animate-spin text-gray-400" />
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              status?.installed
                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
            }`}>
              {status?.installed ? (status.version ? `v${status.version}` : 'Installed') : 'Not Installed'}
            </span>
          )}
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
          {/* Preferences Section (shown when installed) */}
          {status?.installed && (
            <div className="space-y-3">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Version</div>
                  <div className="text-sm font-medium text-foreground">
                    {status.version || 'Unknown'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Location</div>
                  <div className="text-sm font-mono text-foreground truncate" title={status.path || ''}>
                    {status.path || 'Unknown'}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                <a
                  href="https://docs.anthropic.com/en/docs/claude-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-foreground rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <ExternalLink size={14} />
                  <span>Documentation</span>
                </a>
                <button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-foreground rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  title="Reinstall or update Claude Code"
                >
                  {isInstalling ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>Update</span>
                </button>
              </div>

              {/* Config File Info */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <Terminal size={14} className="text-blue-500 mt-0.5" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <span className="font-medium">MCP servers</span> configured in FlowQ are stored in{' '}
                    <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded">~/.claude.json</code>{' '}
                    and automatically loaded by Claude Code CLI.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Installation Section (shown when not installed) */}
          {!status?.installed && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle size={14} />
                <span>Agent mode requires Claude Code CLI to be installed</span>
              </div>

              {/* Auto Install Button */}
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isInstalling ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Installing...</span>
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    <span>Install Claude Code CLI</span>
                  </>
                )}
              </button>

              {/* Manual Install Option */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or install manually</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg font-mono overflow-x-auto">
                  curl -fsSL https://claude.ai/install.sh | bash
                </code>
                <button
                  onClick={handleCopyCommand}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Copy command"
                >
                  {copied ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} className="text-gray-400" />
                  )}
                </button>
              </div>

              <a
                href="https://docs.anthropic.com/en/docs/claude-code"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink size={14} />
                <span>View installation docs</span>
              </a>
            </div>
          )}

          {/* Installation Output */}
          {installOutput && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium mb-1">
                <CheckCircle2 size={14} />
                <span>Installation successful!</span>
              </div>
              <pre className="text-xs text-green-600 dark:text-green-500 overflow-x-auto whitespace-pre-wrap">
                {installOutput}
              </pre>
            </div>
          )}

          {/* Installation Error */}
          {installError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium mb-1">
                <XCircle size={14} />
                <span>Installation failed</span>
              </div>
              <pre className="text-xs text-red-600 dark:text-red-500 overflow-x-auto whitespace-pre-wrap">
                {installError}
              </pre>
              <p className="text-xs text-red-500 mt-2">
                Try running the command manually in your terminal.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClaudeCodeSetup;
