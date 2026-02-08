import React, { useState, useCallback, useMemo } from 'react';
import { X, Copy, Check, Download, ChevronRight, ChevronDown, Braces } from 'lucide-react';

interface JSONPreviewOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  data: unknown;
  title?: string;
}

// JSON Tree Node Component
interface JSONNodeProps {
  keyName?: string;
  value: unknown;
  depth: number;
  defaultExpanded?: boolean;
}

const JSONNode: React.FC<JSONNodeProps> = ({ keyName, value, depth, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded && depth < 2);

  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);
  const isEmpty = isObject && Object.keys(value as object).length === 0;

  const getValueColor = (val: unknown): string => {
    if (val === null) return 'text-gray-400 dark:text-gray-500';
    if (typeof val === 'boolean') return 'text-purple-600 dark:text-purple-400';
    if (typeof val === 'number') return 'text-blue-600 dark:text-blue-400';
    if (typeof val === 'string') return 'text-green-600 dark:text-green-400';
    return 'text-gray-700 dark:text-gray-300';
  };

  const formatValue = (val: unknown): string => {
    if (val === null) return 'null';
    if (typeof val === 'string') return `"${val}"`;
    return String(val);
  };

  const renderToggle = () => {
    if (!isObject || isEmpty) return <span className="w-4" />;
    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
    );
  };

  const renderKey = () => {
    if (keyName === undefined) return null;
    return (
      <span className="text-gray-700 dark:text-gray-300">
        <span className="text-red-600 dark:text-red-400">"{keyName}"</span>
        <span className="text-gray-500">: </span>
      </span>
    );
  };

  const renderBrackets = () => {
    if (!isObject) return null;
    const openBracket = isArray ? '[' : '{';
    const closeBracket = isArray ? ']' : '}';
    const count = Object.keys(value as object).length;

    if (isEmpty) {
      return <span className="text-gray-500">{openBracket}{closeBracket}</span>;
    }

    if (!isExpanded) {
      return (
        <span className="text-gray-500">
          {openBracket}
          <span className="text-gray-400 text-xs mx-1">{count} {count === 1 ? 'item' : 'items'}</span>
          {closeBracket}
        </span>
      );
    }

    return <span className="text-gray-500">{openBracket}</span>;
  };

  if (!isObject) {
    return (
      <div className="flex items-start" style={{ paddingLeft: `${depth * 1.25}rem` }}>
        <span className="w-4" />
        {renderKey()}
        <span className={getValueColor(value)}>{formatValue(value)}</span>
      </div>
    );
  }

  const entries = Object.entries(value as object);

  return (
    <div>
      <div className="flex items-start" style={{ paddingLeft: `${depth * 1.25}rem` }}>
        {renderToggle()}
        {renderKey()}
        {renderBrackets()}
      </div>

      {isExpanded && !isEmpty && (
        <>
          {entries.map(([k, v], index) => (
            <JSONNode
              key={k}
              keyName={isArray ? undefined : k}
              value={v}
              depth={depth + 1}
              defaultExpanded={depth < 1}
            />
          ))}
          <div style={{ paddingLeft: `${depth * 1.25}rem` }} className="text-gray-500">
            <span className="w-4 inline-block" />
            {isArray ? ']' : '}'}
          </div>
        </>
      )}
    </div>
  );
};

const JSONPreviewOverlay: React.FC<JSONPreviewOverlayProps> = ({
  isOpen,
  onClose,
  data,
  title = 'JSON Preview',
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return 'Invalid JSON';
    }
  }, [data]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [jsonString]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [jsonString]);

  // Handle keyboard shortcuts
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="bg-white dark:bg-gray-800 w-[90vw] h-[90vh] max-w-4xl rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center gap-3">
            <Braces size={20} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center bg-gray-200 dark:bg-gray-600 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'tree'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Tree
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'raw'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Raw
              </button>
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                copied
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* Download button */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <Download size={14} />
              Download
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors ml-2"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-white dark:bg-gray-900">
          {viewMode === 'tree' ? (
            <div className="font-mono text-sm leading-relaxed">
              <JSONNode value={data} depth={0} defaultExpanded />
            </div>
          ) : (
            <pre className="font-mono text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {jsonString}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>{jsonString.split('\n').length} lines</span>
            <span>{jsonString.length} characters</span>
          </div>
          <div>
            <span>Press Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JSONPreviewOverlay;
