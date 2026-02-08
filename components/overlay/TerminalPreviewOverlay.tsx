import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Copy, Check, Download, Terminal, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';

export interface TerminalOutput {
  command?: string;
  output: string;
  exitCode?: number;
  cwd?: string;
  timestamp?: Date;
}

interface TerminalPreviewOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  outputs: TerminalOutput[];
  initialOutputIndex?: number;
  title?: string;
}

// ANSI color code to CSS class mapping
const ansiToClass: Record<string, string> = {
  '30': 'text-gray-900',
  '31': 'text-red-500',
  '32': 'text-green-500',
  '33': 'text-yellow-500',
  '34': 'text-blue-500',
  '35': 'text-purple-500',
  '36': 'text-cyan-500',
  '37': 'text-gray-300',
  '90': 'text-gray-500',
  '91': 'text-red-400',
  '92': 'text-green-400',
  '93': 'text-yellow-400',
  '94': 'text-blue-400',
  '95': 'text-purple-400',
  '96': 'text-cyan-400',
  '97': 'text-white',
};

// Parse ANSI escape codes and convert to styled spans
function parseAnsiOutput(text: string): React.ReactNode[] {
  // Simple ANSI parsing - handle basic color codes
  const ansiRegex = /\x1b\[([0-9;]+)m/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let currentClass = '';
  let match;
  let keyIndex = 0;

  // Replace common escape sequences
  const cleanText = text
    .replace(/\x1b\[K/g, '') // Clear line
    .replace(/\x1b\[2J/g, '') // Clear screen
    .replace(/\x1b\[\?25[lh]/g, '') // Show/hide cursor
    .replace(/\x1b\[H/g, ''); // Move cursor home

  while ((match = ansiRegex.exec(cleanText)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textContent = cleanText.slice(lastIndex, match.index);
      if (textContent) {
        parts.push(
          <span key={keyIndex++} className={currentClass}>
            {textContent}
          </span>
        );
      }
    }

    // Parse the ANSI code
    const codes = match[1].split(';');
    for (const code of codes) {
      if (code === '0') {
        currentClass = ''; // Reset
      } else if (code === '1') {
        currentClass += ' font-bold';
      } else if (ansiToClass[code]) {
        currentClass = ansiToClass[code] + (currentClass.includes('font-bold') ? ' font-bold' : '');
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < cleanText.length) {
    parts.push(
      <span key={keyIndex++} className={currentClass}>
        {cleanText.slice(lastIndex)}
      </span>
    );
  }

  return parts.length > 0 ? parts : [cleanText];
}

const TerminalPreviewOverlay: React.FC<TerminalPreviewOverlayProps> = ({
  isOpen,
  onClose,
  outputs,
  initialOutputIndex = 0,
  title,
}) => {
  const [currentOutputIndex, setCurrentOutputIndex] = useState(initialOutputIndex);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const currentOutput = outputs[currentOutputIndex];

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [currentOutputIndex, currentOutput?.output]);

  const handleCopy = useCallback(async () => {
    if (!currentOutput) return;
    try {
      const textToCopy = currentOutput.command
        ? `$ ${currentOutput.command}\n${currentOutput.output}`
        : currentOutput.output;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [currentOutput]);

  const handleDownload = useCallback(() => {
    if (!currentOutput) return;
    const content = currentOutput.command
      ? `$ ${currentOutput.command}\n${currentOutput.output}`
      : currentOutput.output;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-output-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentOutput]);

  const goToPrevOutput = useCallback(() => {
    setCurrentOutputIndex((prev) => (prev > 0 ? prev - 1 : outputs.length - 1));
  }, [outputs.length]);

  const goToNextOutput = useCallback(() => {
    setCurrentOutputIndex((prev) => (prev < outputs.length - 1 ? prev + 1 : 0));
  }, [outputs.length]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && outputs.length > 1) {
        goToPrevOutput();
      } else if (e.key === 'ArrowRight' && outputs.length > 1) {
        goToNextOutput();
      } else if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsFullscreen(!isFullscreen);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goToPrevOutput, goToNextOutput, outputs.length, isFullscreen]);

  if (!isOpen || !currentOutput) return null;

  const lineCount = currentOutput.output.split('\n').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-[90vw] h-[85vh] max-w-5xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-3">
            {/* Traffic lights decoration */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                title="Close"
              />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              />
            </div>

            <Terminal size={16} className="text-gray-400 ml-2" />
            <div>
              <h2 className="text-sm font-medium text-gray-200">
                {title || 'Terminal Output'}
              </h2>
              {outputs.length > 1 && (
                <p className="text-xs text-gray-500">
                  Output {currentOutputIndex + 1} of {outputs.length}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Output navigation */}
            {outputs.length > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={goToPrevOutput}
                  className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Previous output (Left arrow)"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={goToNextOutput}
                  className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Next output (Right arrow)"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit fullscreen (Cmd+F)' : 'Fullscreen (Cmd+F)'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                copied
                  ? 'bg-green-900/50 text-green-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* Download button */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Download size={14} />
              Download
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Output tabs (if multiple outputs) */}
        {outputs.length > 1 && (
          <div className="flex items-center gap-1 px-4 py-2 bg-gray-800/50 border-b border-gray-700 overflow-x-auto">
            {outputs.map((output, index) => (
              <button
                key={index}
                onClick={() => setCurrentOutputIndex(index)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
                  index === currentOutputIndex
                    ? 'bg-gray-700 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {output.command ? (
                  <span className="font-mono truncate max-w-[150px]">
                    $ {output.command}
                  </span>
                ) : (
                  <span>Output {index + 1}</span>
                )}
                {output.exitCode !== undefined && output.exitCode !== 0 && (
                  <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 text-[10px] rounded">
                    {output.exitCode}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Command line (if present) */}
        {currentOutput.command && (
          <div className="px-4 py-2 bg-gray-800/30 border-b border-gray-700/50 font-mono text-sm">
            {currentOutput.cwd && (
              <span className="text-blue-400">{currentOutput.cwd}</span>
            )}
            <span className="text-green-400 ml-1">$</span>
            <span className="text-gray-200 ml-2">{currentOutput.command}</span>
          </div>
        )}

        {/* Terminal content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed text-gray-300"
        >
          <pre className="whitespace-pre-wrap break-words">
            {parseAnsiOutput(currentOutput.output)}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700 bg-gray-800 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>{lineCount} lines</span>
            <span>{currentOutput.output.length} characters</span>
            {currentOutput.exitCode !== undefined && (
              <span className={currentOutput.exitCode === 0 ? 'text-green-500' : 'text-red-500'}>
                Exit: {currentOutput.exitCode}
              </span>
            )}
            {currentOutput.timestamp && (
              <span>
                {currentOutput.timestamp.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div>
            <span className="text-gray-600">Press Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerminalPreviewOverlay;
