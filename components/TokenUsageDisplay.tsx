import React, { useState, useRef, useEffect } from 'react';
import { Coins, ChevronUp, ChevronDown, Info } from 'lucide-react';
import { TokenUsage, SessionTokenUsage } from '../types';

interface TokenUsageDisplayProps {
  usage: SessionTokenUsage;
  className?: string;
}

// Format large numbers with k/M suffix
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toLocaleString();
}

// Estimate cost based on model and token counts
// These are approximate rates as of early 2024
function estimateCost(usage: TokenUsage, model?: string): number {
  // Default to Claude Sonnet pricing
  const inputRate = 0.003; // per 1k tokens
  const outputRate = 0.015; // per 1k tokens
  const cacheReadRate = 0.0003; // per 1k tokens (90% discount)
  const cacheWriteRate = 0.00375; // per 1k tokens (25% premium)

  let cost = 0;

  // Regular tokens
  const regularInputTokens = usage.inputTokens - (usage.cacheReadTokens || 0);
  cost += (regularInputTokens / 1000) * inputRate;
  cost += (usage.outputTokens / 1000) * outputRate;

  // Cache tokens
  if (usage.cacheReadTokens) {
    cost += (usage.cacheReadTokens / 1000) * cacheReadRate;
  }
  if (usage.cacheWriteTokens) {
    cost += (usage.cacheWriteTokens / 1000) * cacheWriteRate;
  }

  return cost;
}

const TokenUsageDisplay: React.FC<TokenUsageDisplayProps> = ({
  usage,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const total = usage.total;
  const estimatedCost = usage.estimatedCost ?? estimateCost(total, usage.model);

  // Close tooltip on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTooltip]);

  return (
    <div className={`relative ${className}`}>
      {/* Compact display */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        <Coins size={12} />
        <span className="font-mono">{formatNumber(total.totalTokens)}</span>
        <span className="text-gray-400 dark:text-gray-500">tokens</span>
        {isExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50"
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Coins size={14} className="text-amber-500" />
              Token Usage
            </h4>
            {usage.model && (
              <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {usage.model}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {/* Input tokens */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">Input</span>
              <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
                {formatNumber(total.inputTokens)}
              </span>
            </div>

            {/* Cache read tokens (if any) */}
            {total.cacheReadTokens && total.cacheReadTokens > 0 && (
              <div className="flex justify-between items-center pl-3">
                <span className="text-[11px] text-green-500 dark:text-green-400">Cache read</span>
                <span className="text-[11px] font-mono text-green-600 dark:text-green-400">
                  {formatNumber(total.cacheReadTokens)}
                </span>
              </div>
            )}

            {/* Cache write tokens (if any) */}
            {total.cacheWriteTokens && total.cacheWriteTokens > 0 && (
              <div className="flex justify-between items-center pl-3">
                <span className="text-[11px] text-blue-500 dark:text-blue-400">Cache write</span>
                <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                  {formatNumber(total.cacheWriteTokens)}
                </span>
              </div>
            )}

            {/* Output tokens */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">Output</span>
              <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
                {formatNumber(total.outputTokens)}
              </span>
            </div>

            {/* Separator */}
            <div className="border-t border-gray-100 dark:border-gray-700 my-2" />

            {/* Total */}
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Total</span>
              <span className="text-xs font-mono font-medium text-gray-900 dark:text-white">
                {formatNumber(total.totalTokens)}
              </span>
            </div>

            {/* Estimated cost */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                Est. Cost
                <Info
                  size={10}
                  className="text-gray-400 cursor-help"
                  title="Estimated cost based on Claude API pricing"
                />
              </span>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                ${estimatedCost.toFixed(4)}
              </span>
            </div>
          </div>

          {/* Token progress bar */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${(total.inputTokens / total.totalTokens) * 100}%` }}
                title={`Input: ${total.inputTokens}`}
              />
              <div
                className="bg-purple-500 transition-all"
                style={{ width: `${(total.outputTokens / total.totalTokens) * 100}%` }}
                title={`Output: ${total.outputTokens}`}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-blue-500">Input</span>
              <span className="text-[10px] text-purple-500">Output</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenUsageDisplay;
