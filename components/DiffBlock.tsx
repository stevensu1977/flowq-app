import React, { useState, useCallback } from 'react';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface DiffBlockProps {
  content: string;
  filename?: string;
  defaultExpanded?: boolean;
}

interface DiffLine {
  type: 'addition' | 'deletion' | 'context' | 'header' | 'meta';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

// Parse diff content into structured lines
function parseDiff(content: string): DiffLine[] {
  const lines = content.split('\n');
  const result: DiffLine[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // File header lines
    if (line.startsWith('diff --git') || line.startsWith('index ') ||
        line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', content: line });
      continue;
    }

    // Hunk header @@ -x,y +a,b @@
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      result.push({ type: 'meta', content: line });
      continue;
    }

    // Addition
    if (line.startsWith('+')) {
      result.push({
        type: 'addition',
        content: line.slice(1),
        newLineNum: newLineNum++,
      });
      continue;
    }

    // Deletion
    if (line.startsWith('-')) {
      result.push({
        type: 'deletion',
        content: line.slice(1),
        oldLineNum: oldLineNum++,
      });
      continue;
    }

    // Context line (starts with space or empty)
    if (line.startsWith(' ') || line === '') {
      result.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
    }
  }

  return result;
}

// Get stats from diff lines
function getDiffStats(lines: DiffLine[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.type === 'addition') additions++;
    if (line.type === 'deletion') deletions++;
  }

  return { additions, deletions };
}

const DiffBlock: React.FC<DiffBlockProps> = ({
  content,
  filename,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const lines = parseDiff(content);
  const stats = getDiffStats(lines);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  const getLineClass = (type: DiffLine['type']): string => {
    switch (type) {
      case 'addition':
        return 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300';
      case 'deletion':
        return 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300';
      case 'header':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-semibold';
      case 'meta':
        return 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-700 dark:text-gray-300';
    }
  };

  const getLinePrefix = (type: DiffLine['type']): string => {
    switch (type) {
      case 'addition':
        return '+';
      case 'deletion':
        return '-';
      default:
        return ' ';
    }
  };

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {filename && (
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono">
              {filename}
            </span>
          )}
          <div className="flex items-center gap-2 text-xs">
            {stats.additions > 0 && (
              <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
            )}
            {stats.deletions > 0 && (
              <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
            )}
          </div>
        </div>

        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            copied
              ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Diff content */}
      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className={getLineClass(line.type)}>
                  {/* Line numbers */}
                  <td className="w-10 px-2 py-0.5 text-right text-gray-400 dark:text-gray-500 select-none border-r border-gray-200 dark:border-gray-700">
                    {line.oldLineNum ?? ''}
                  </td>
                  <td className="w-10 px-2 py-0.5 text-right text-gray-400 dark:text-gray-500 select-none border-r border-gray-200 dark:border-gray-700">
                    {line.newLineNum ?? ''}
                  </td>
                  {/* Prefix */}
                  <td className="w-4 px-1 py-0.5 text-center select-none">
                    {line.type !== 'header' && line.type !== 'meta' && (
                      <span className={
                        line.type === 'addition'
                          ? 'text-green-600 dark:text-green-400'
                          : line.type === 'deletion'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-400'
                      }>
                        {getLinePrefix(line.type)}
                      </span>
                    )}
                  </td>
                  {/* Content */}
                  <td className="px-2 py-0.5 whitespace-pre">
                    {line.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DiffBlock;
