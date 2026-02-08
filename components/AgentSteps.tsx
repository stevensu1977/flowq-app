
import React, { useState, useCallback } from 'react';
import { Step } from '../types';
import { ChevronDown, ChevronRight, FileCode, Terminal, Eye, Loader2 } from 'lucide-react';
import { CodePreviewOverlay, TerminalPreviewOverlay } from './overlay';

interface AgentStepsProps {
  steps: Step[];
}

// Format step label based on tool name
const formatStepLabel = (step: Step): string => {
  if (step.details) {
    // Truncate details to 50 chars for display
    const shortDetails = step.details.length > 50
      ? step.details.slice(0, 50) + '...'
      : step.details;
    return `${step.label}(${shortDetails})`;
  }
  return step.label;
};

// Get icon for step based on tool name
const getStepIcon = (toolName: string): React.ReactNode => {
  const iconMap: Record<string, React.ReactNode> = {
    'Read': <FileCode size={12} />,
    'Write': <FileCode size={12} />,
    'Edit': <FileCode size={12} />,
    'Bash': <Terminal size={12} />,
  };
  return iconMap[toolName] || null;
};

const AgentSteps: React.FC<AgentStepsProps> = ({ steps }) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [codeOverlay, setCodeOverlay] = useState<{
    isOpen: boolean;
    files: { filename: string; content: string; language?: string }[];
    title?: string;
  }>({ isOpen: false, files: [] });
  const [terminalOverlay, setTerminalOverlay] = useState<{
    isOpen: boolean;
    outputs: { command?: string; output: string; exitCode?: number; cwd?: string }[];
    title?: string;
  }>({ isOpen: false, outputs: [] });

  const toggleExpand = useCallback((stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }, []);

  const handlePreviewCode = useCallback((step: Step) => {
    if (!step.output || step.output.type !== 'code') return;
    setCodeOverlay({
      isOpen: true,
      files: [{
        filename: step.output.filename || step.details || 'file',
        content: step.output.content,
        language: step.output.language,
      }],
      title: `${step.label}: ${step.output.filename || step.details || ''}`,
    });
  }, []);

  const handlePreviewTerminal = useCallback((step: Step) => {
    if (!step.output || step.output.type !== 'terminal') return;
    setTerminalOverlay({
      isOpen: true,
      outputs: [{
        command: step.details,
        output: step.output.content,
        exitCode: step.output.exitCode,
        cwd: step.output.cwd,
      }],
      title: `Bash: ${step.details?.slice(0, 50) || 'Output'}`,
    });
  }, []);

  return (
    <>
      <div className="font-mono text-sm space-y-1">
        {steps.map((step) => {
          const isExpanded = expandedSteps.has(step.id);
          const hasOutput = !!step.output;
          const isCodeTool = ['Read', 'Write', 'Edit'].includes(step.label);
          const isTerminalTool = step.label === 'Bash';
          const hasExpandableContent = step.details && step.details.length > 50;

          return (
            <div key={step.id} className="flex flex-col">
              {/* Main row: status icon + tool name(params) */}
              <div className="flex items-start gap-2 group">
                {/* Status indicator */}
                <span className={`flex-shrink-0 mt-0.5 ${
                  step.status === 'thinking' ? 'text-indigo-500' :
                  step.status === 'completed' ? 'text-green-600' :
                  step.status === 'error' ? 'text-red-500' :
                  'text-gray-400'
                }`}>
                  {step.status === 'thinking' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : step.status === 'completed' ? (
                    '●'
                  ) : step.status === 'error' ? (
                    '✕'
                  ) : (
                    '○'
                  )}
                </span>

                {/* Expand/collapse toggle for long details */}
                {hasExpandableContent ? (
                  <button
                    onClick={() => toggleExpand(step.id)}
                    className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors -ml-1"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                ) : (
                  <span className="w-3.5" />
                )}

                {/* Tool icon */}
                <span className={`flex-shrink-0 ${
                  step.status === 'thinking' ? 'text-indigo-500' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {getStepIcon(step.label)}
                </span>

                {/* Tool name and details */}
                <span className={`break-all flex-1 ${
                  step.status === 'thinking' ? 'text-indigo-600 dark:text-indigo-400' :
                  step.status === 'error' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-700 dark:text-gray-300'
                }`}>
                  {formatStepLabel(step)}
                </span>

                {/* Preview button for completed steps with output */}
                {step.status === 'completed' && hasOutput && (
                  <button
                    onClick={() => {
                      if (isCodeTool) handlePreviewCode(step);
                      else if (isTerminalTool) handlePreviewTerminal(step);
                    }}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Preview output"
                  >
                    <Eye size={12} />
                    <span>Preview</span>
                  </button>
                )}
              </div>

              {/* Expanded details row */}
              {isExpanded && step.details && (
                <div className="flex items-start gap-2 ml-9 mt-1">
                  <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">⎿</span>
                  <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-all max-h-40 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-700 rounded p-2">
                    {step.details}
                  </pre>
                </div>
              )}

              {/* Inline preview for output (collapsed view) */}
              {step.status === 'completed' && hasOutput && step.output && (
                <div className="ml-9 mt-1">
                  <div
                    className={`text-xs rounded overflow-hidden cursor-pointer transition-colors ${
                      step.output.type === 'terminal'
                        ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                        : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                    }`}
                    onClick={() => {
                      if (isCodeTool) handlePreviewCode(step);
                      else if (isTerminalTool) handlePreviewTerminal(step);
                    }}
                  >
                    <div className={`px-2 py-1 flex items-center justify-between ${
                      step.output.type === 'terminal' ? 'bg-gray-800' : 'bg-gray-100 dark:bg-gray-600'
                    }`}>
                      <span className="font-medium flex items-center gap-1.5">
                        {step.output.type === 'terminal' ? (
                          <Terminal size={10} />
                        ) : (
                          <FileCode size={10} />
                        )}
                        {step.output.filename || (step.output.type === 'terminal' ? 'Output' : 'Result')}
                      </span>
                      <span className="text-[10px] opacity-60">
                        {step.output.content.split('\n').length} lines
                      </span>
                    </div>
                    <pre className="px-2 py-1.5 max-h-20 overflow-hidden text-[11px] leading-relaxed">
                      {step.output.content.slice(0, 300)}
                      {step.output.content.length > 300 && '...'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Code Preview Overlay */}
      <CodePreviewOverlay
        isOpen={codeOverlay.isOpen}
        onClose={() => setCodeOverlay({ isOpen: false, files: [] })}
        files={codeOverlay.files}
        title={codeOverlay.title}
      />

      {/* Terminal Preview Overlay */}
      <TerminalPreviewOverlay
        isOpen={terminalOverlay.isOpen}
        onClose={() => setTerminalOverlay({ isOpen: false, outputs: [] })}
        outputs={terminalOverlay.outputs}
        title={terminalOverlay.title}
      />
    </>
  );
};

export default AgentSteps;
