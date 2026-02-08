import React, { useState, useCallback } from 'react';
import { X, Copy, Check, Download, FileCode, ChevronLeft, ChevronRight } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../../context/ThemeContext';

export interface CodeFile {
  filename: string;
  content: string;
  language?: string;
}

interface CodePreviewOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  files: CodeFile[];
  initialFileIndex?: number;
  title?: string;
}

// Detect language from filename extension
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'py': 'python',
    'rb': 'ruby',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'sql': 'sql',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'md': 'markdown',
    'toml': 'toml',
    'ini': 'ini',
    'dockerfile': 'dockerfile',
  };
  return languageMap[ext] || 'text';
}

const CodePreviewOverlay: React.FC<CodePreviewOverlayProps> = ({
  isOpen,
  onClose,
  files,
  initialFileIndex = 0,
  title,
}) => {
  const [currentFileIndex, setCurrentFileIndex] = useState(initialFileIndex);
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const { resolvedTheme } = useTheme();

  const currentFile = files[currentFileIndex];
  const language = currentFile?.language || detectLanguage(currentFile?.filename || '');
  const syntaxTheme = resolvedTheme === 'dark' ? oneDark : oneLight;

  const handleCopy = useCallback(async () => {
    if (!currentFile) return;
    try {
      await navigator.clipboard.writeText(currentFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [currentFile]);

  const handleDownload = useCallback(() => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentFile]);

  const goToPrevFile = useCallback(() => {
    setCurrentFileIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1));
  }, [files.length]);

  const goToNextFile = useCallback(() => {
    setCurrentFileIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0));
  }, [files.length]);

  // Handle keyboard shortcuts
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && files.length > 1) {
        goToPrevFile();
      } else if (e.key === 'ArrowRight' && files.length > 1) {
        goToNextFile();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goToPrevFile, goToNextFile, files.length]);

  if (!isOpen || !currentFile) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="bg-white dark:bg-gray-800 w-[90vw] h-[90vh] max-w-6xl rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center gap-3">
            <FileCode size={20} className="text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                {title || currentFile.filename}
              </h2>
              {files.length > 1 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  File {currentFileIndex + 1} of {files.length}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* File navigation */}
            {files.length > 1 && (
              <div className="flex items-center gap-1 mr-4">
                <button
                  onClick={goToPrevFile}
                  className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  title="Previous file (Left arrow)"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={goToNextFile}
                  className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  title="Next file (Right arrow)"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            {/* Toggle line numbers */}
            <button
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showLineNumbers
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              Line #
            </button>

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

        {/* File tabs (if multiple files) */}
        {files.length > 1 && (
          <div className="flex items-center gap-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 overflow-x-auto">
            {files.map((file, index) => (
              <button
                key={index}
                onClick={() => setCurrentFileIndex(index)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  index === currentFileIndex
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {file.filename}
              </button>
            ))}
          </div>
        )}

        {/* Code content */}
        <div className="flex-1 overflow-auto">
          <SyntaxHighlighter
            language={language}
            style={syntaxTheme}
            showLineNumbers={showLineNumbers}
            wrapLines
            customStyle={{
              margin: 0,
              padding: '1rem',
              background: resolvedTheme === 'dark' ? '#1f2937' : 'white',
              fontSize: '13px',
              lineHeight: '1.5',
              minHeight: '100%',
            }}
            lineNumberStyle={{
              minWidth: '3em',
              paddingRight: '1em',
              color: resolvedTheme === 'dark' ? '#6b7280' : '#9ca3af',
              userSelect: 'none',
            }}
          >
            {currentFile.content}
          </SyntaxHighlighter>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>{currentFile.content.split('\n').length} lines</span>
            <span>{currentFile.content.length} characters</span>
            <span className="uppercase">{language}</span>
          </div>
          <div>
            <span>Press Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodePreviewOverlay;
