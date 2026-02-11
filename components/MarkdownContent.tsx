import React, { useState, useCallback, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import MermaidDiagram from './MermaidDiagram';
import DiffBlock from './DiffBlock';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

// remark-math options - only parse $$ blocks, not single $ for inline math
// This prevents currency amounts like $100 from being interpreted as math
const remarkMathOptions = {
  singleDollarTextMath: false,
};

// KaTeX options for more lenient rendering
const katexOptions = {
  // Don't throw on errors, just render the raw text instead
  throwOnError: false,
  // Use 'ignore' mode to suppress warnings about Unicode characters
  strict: 'ignore' as const,
  // Output both HTML and MathML for accessibility
  output: 'htmlAndMathml' as const,
  // Trust HTML in LaTeX (needed for some Unicode characters)
  trust: true,
};

interface MarkdownContentProps {
  content: string;
}

// Separate component for code block with copy functionality, line numbers, and collapsible support
interface CodeBlockWithCopyProps {
  codeContent: string;
  language?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapseThreshold?: number; // Number of lines above which to auto-collapse
}

const COLLAPSE_THRESHOLD = 15; // Auto-collapse code blocks with more than 15 lines

const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({
  codeContent,
  language,
  collapsible = true,
  defaultCollapsed,
  collapseThreshold = COLLAPSE_THRESHOLD
}) => {
  const [copied, setCopied] = useState(false);

  // Split code into lines for line number display
  const lines = codeContent.split('\n');
  // Remove trailing empty line if exists
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  // Determine if we should show collapsed by default
  const shouldAutoCollapse = collapsible && lines.length > collapseThreshold;
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed ?? shouldAutoCollapse);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [codeContent]);

  // Lines to display when collapsed (first 5 lines)
  const collapsedPreviewLines = 5;
  const displayLines = isCollapsed ? lines.slice(0, collapsedPreviewLines) : lines;
  const hiddenLinesCount = lines.length - collapsedPreviewLines;

  return (
    <div className="relative group mb-3">
      {/* Header with language label, line count, and actions */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 dark:bg-gray-700 rounded-t-lg border-b border-gray-700 dark:border-gray-600">
        <div className="flex items-center gap-2">
          {/* Collapse toggle button */}
          {collapsible && lines.length > collapsedPreviewLines && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-0.5 text-gray-400 hover:text-white transition-colors"
              title={isCollapsed ? 'Expand code' : 'Collapse code'}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <span className="text-xs text-gray-400 font-mono">
            {language || 'code'}
          </span>
          <span className="text-xs text-gray-500">
            {lines.length} lines
          </span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-all
            ${copied
              ? 'text-green-400 bg-green-400/10'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          title={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      {/* Code content with line numbers */}
      <div className={`overflow-x-auto bg-gray-900 dark:bg-gray-800 ${isCollapsed ? '' : 'rounded-b-lg'}`}>
        <table className="w-full text-xs font-mono">
          <tbody>
            {displayLines.map((line, index) => (
              <tr key={index} className="hover:bg-gray-800/50 dark:hover:bg-gray-700/50">
                <td className="w-10 px-3 py-0.5 text-right text-gray-500 select-none border-r border-gray-700 dark:border-gray-600">
                  {index + 1}
                </td>
                <td className="px-3 py-0.5 text-gray-100 whitespace-pre">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Collapsed indicator */}
      {isCollapsed && hiddenLinesCount > 0 && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full px-3 py-2 bg-gray-800/80 dark:bg-gray-700/80 rounded-b-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2 border-t border-gray-700 dark:border-gray-600"
        >
          <ChevronDown size={14} />
          <span>Show {hiddenLinesCount} more lines</span>
        </button>
      )}
    </div>
  );
};

// Helper to extract text content from React children
const extractTextContent = (children: ReactNode): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children.map(extractTextContent).join('');
  }
  if (React.isValidElement(children) && children.props?.children) {
    return extractTextContent(children.props.children);
  }
  return '';
};

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, remarkMathOptions]]}
        rehypePlugins={[[rehypeKatex, katexOptions]]}
        components={{
          // 标题样式 - using display font (Lora)
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-4 mb-2 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mt-4 mb-2 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">{children}</h3>
          ),
          // 段落 - Medium style with better line-height
          p: ({ children }) => (
            <p className="text-base text-gray-700 dark:text-gray-300 mb-4 last:mb-0">{children}</p>
          ),
          // 列表
          ul: ({ children }) => (
            <ul className="list-disc list-inside text-base text-gray-700 dark:text-gray-300 mb-4 space-y-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside text-base text-gray-700 dark:text-gray-300 mb-4 space-y-1.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-base text-gray-700 dark:text-gray-300">{children}</li>
          ),
        // 代码块 - 支持 mermaid
        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          const codeString = String(children).replace(/\n$/, '');

          // 检测 mermaid 代码块
          if (language === 'mermaid') {
            return <MermaidDiagram chart={codeString} />;
          }

          // 检测 diff 代码块
          if (language === 'diff') {
            return <DiffBlock content={codeString} />;
          }

          // 行内代码
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-gray-100 dark:bg-gray-700 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                {children}
              </code>
            );
          }

          // 块级代码 - 传递语言信息给 pre 处理
          return (
            <code data-language={language} data-code={codeString}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => {
          // 检查是否是 mermaid 或 diff，如果是则不包裹 pre
          const child = React.Children.toArray(children)[0];
          if (React.isValidElement(child) && (child.type === MermaidDiagram || child.type === DiffBlock)) {
            return <>{children}</>;
          }

          // 从 code 元素提取语言和代码内容
          let language: string | undefined;
          let codeContent = '';

          if (React.isValidElement(child)) {
            const props = child.props as { 'data-language'?: string; 'data-code'?: string };
            language = props['data-language'];
            codeContent = props['data-code'] || extractTextContent(children).replace(/\n$/, '');
          } else {
            codeContent = extractTextContent(children).replace(/\n$/, '');
          }

          return (
            <CodeBlockWithCopy codeContent={codeContent} language={language} />
          );
        },
        // 表格
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3">
            <table className="min-w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50 dark:bg-gray-700">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border border-gray-200 dark:border-gray-600 px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-200 dark:border-gray-600 px-3 py-2 text-gray-600 dark:text-gray-300">{children}</td>
        ),
        // 引用
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 mb-3">{children}</blockquote>
        ),
        // 链接
        a: ({ href, children }) => (
          <a href={href} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        // 粗体和斜体
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        // 分隔线
        hr: () => (
          <hr className="border-gray-200 dark:border-gray-700 my-4" />
        ),
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
