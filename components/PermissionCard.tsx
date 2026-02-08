import React, { useState } from 'react';
import { Shield, ShieldCheck, ShieldX, ChevronDown, ChevronRight, AlertTriangle, Terminal, FileEdit, Globe, Folder } from 'lucide-react';

export type PermissionType = 'bash' | 'file_write' | 'file_read' | 'network' | 'mcp' | 'unknown';

export interface PermissionRequest {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  permissionType: PermissionType;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

interface PermissionCardProps {
  request: PermissionRequest;
  onApprove: (id: string, remember?: boolean) => void;
  onDeny: (id: string) => void;
  isProcessing?: boolean;
}

// Get icon based on permission type
function getPermissionIcon(type: PermissionType) {
  switch (type) {
    case 'bash':
      return Terminal;
    case 'file_write':
      return FileEdit;
    case 'file_read':
      return Folder;
    case 'network':
      return Globe;
    default:
      return Shield;
  }
}

// Get risk color
function getRiskColor(level?: 'low' | 'medium' | 'high') {
  switch (level) {
    case 'high':
      return 'text-red-500 dark:text-red-400';
    case 'medium':
      return 'text-amber-500 dark:text-amber-400';
    case 'low':
    default:
      return 'text-blue-500 dark:text-blue-400';
  }
}

// Get risk background
function getRiskBg(level?: 'low' | 'medium' | 'high') {
  switch (level) {
    case 'high':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    case 'medium':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    case 'low':
    default:
      return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
  }
}

// Format tool input for display
function formatToolInput(input: Record<string, unknown>): string {
  if (input.command) {
    return String(input.command);
  }
  if (input.path) {
    return String(input.path);
  }
  if (input.file_path) {
    return String(input.file_path);
  }
  if (input.url) {
    return String(input.url);
  }
  return JSON.stringify(input, null, 2);
}

const PermissionCard: React.FC<PermissionCardProps> = ({
  request,
  onApprove,
  onDeny,
  isProcessing = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);

  const Icon = getPermissionIcon(request.permissionType);
  const riskColor = getRiskColor(request.riskLevel);
  const riskBg = getRiskBg(request.riskLevel);
  const formattedInput = formatToolInput(request.toolInput);

  return (
    <div className={`rounded-xl border ${riskBg} overflow-hidden mb-3`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${request.riskLevel === 'high' ? 'bg-red-100 dark:bg-red-900/30' : request.riskLevel === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            <Icon size={18} className={riskColor} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Permission Required
              </h4>
              {request.riskLevel === 'high' && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded">
                  <AlertTriangle size={10} />
                  HIGH RISK
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {request.description || `Allow ${request.toolName}?`}
            </p>
          </div>
        </div>

        {/* Expand/Collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Details (expanded) */}
      {isExpanded && (
        <div className="px-4 pb-3 border-t border-gray-200 dark:border-gray-700">
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16 shrink-0">Tool:</span>
              <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{request.toolName}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16 shrink-0">Input:</span>
              <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded overflow-x-auto max-w-full">
                {formattedInput}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
        {/* Remember checkbox */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">Remember for this session</span>
        </label>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDeny(request.id)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
          >
            <ShieldX size={14} />
            Deny
          </button>
          <button
            onClick={() => onApprove(request.id, rememberChoice)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <ShieldCheck size={14} />
            Allow
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionCard;
