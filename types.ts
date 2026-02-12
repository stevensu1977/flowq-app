/**
 * Token usage statistics for a message or session
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Session token usage statistics
 */
export interface SessionTokenUsage {
  /** Total tokens used in the session */
  total: TokenUsage;
  /** Estimated cost in USD */
  estimatedCost?: number;
  /** Model used */
  model?: string;
}

export interface ToolOutput {
  type: 'code' | 'terminal' | 'text';
  content: string;
  filename?: string;
  language?: string;
  exitCode?: number;
  cwd?: string;
}

export interface Step {
  id: string;
  label: string;
  status: 'pending' | 'thinking' | 'completed' | 'error';
  details?: string;
  output?: ToolOutput;
}

export interface DiagramNode {
  name: string;
  children?: DiagramNode[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  steps?: Step[];
  diagram?: DiagramNode;
  /** Token usage for this message */
  tokenUsage?: TokenUsage;
}

/**
 * Session status values
 * - todo: New session, not yet started
 * - in-progress: Currently working on
 * - needs-review: Needs attention/review
 * - done: Completed
 * - cancelled: Cancelled/abandoned
 */
export type SessionStatus = 'todo' | 'in-progress' | 'needs-review' | 'done' | 'cancelled';

/**
 * Session status configuration for display
 */
export interface SessionStatusConfig {
  id: SessionStatus;
  label: string;
  color: string;
  icon: string; // lucide icon name
}

/**
 * Default status configurations
 */
export const SESSION_STATUS_CONFIG: SessionStatusConfig[] = [
  { id: 'todo', label: 'To Do', color: '#6b7280', icon: 'Circle' },
  { id: 'in-progress', label: 'In Progress', color: '#3b82f6', icon: 'CircleDot' },
  { id: 'needs-review', label: 'Needs Review', color: '#f59e0b', icon: 'CircleAlert' },
  { id: 'done', label: 'Done', color: '#22c55e', icon: 'CircleCheck' },
  { id: 'cancelled', label: 'Cancelled', color: '#ef4444', icon: 'CircleX' },
];

/**
 * Session label for categorization
 */
export interface SessionLabel {
  id: string;
  name: string;
  color: string;
}

/**
 * Default labels for sessions
 */
export const DEFAULT_SESSION_LABELS: SessionLabel[] = [
  { id: 'bug', name: 'Bug', color: '#ef4444' },
  { id: 'feature', name: 'Feature', color: '#22c55e' },
  { id: 'refactor', name: 'Refactor', color: '#8b5cf6' },
  { id: 'docs', name: 'Docs', color: '#3b82f6' },
  { id: 'research', name: 'Research', color: '#f59e0b' },
  { id: 'urgent', name: 'Urgent', color: '#dc2626' },
];

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: Date;
  workspacePath?: string;  // 关联的 workspace 路径
  /** Whether this session is flagged */
  isFlagged?: boolean;
  /** Session status for workflow tracking */
  status?: SessionStatus;
  /** Whether session has unread messages */
  hasUnread?: boolean;
  /** Whether the agent is currently processing this session */
  isProcessing?: boolean;
  /** Total token usage for the session */
  tokenUsage?: SessionTokenUsage;
  /** Labels/tags for categorization */
  labels?: string[];
}

// ============ Chat Mode Types ============

/**
 * Chat mode - agent uses Claude Code with tools, chat is direct API call
 */
export type ChatMode = 'agent' | 'chat';

/**
 * Chat mode configuration for display
 */
export interface ChatModeConfig {
  id: ChatMode;
  label: string;
  description: string;
  icon: string;
}

/**
 * Available chat modes
 */
export const CHAT_MODE_CONFIG: ChatModeConfig[] = [
  {
    id: 'agent',
    label: 'Agent',
    description: 'Claude Code with tools (file editing, terminal, etc.)',
    icon: 'Bot'
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Direct conversation without tools',
    icon: 'MessageSquare'
  },
];

// ============ API Provider Types ============

/**
 * Supported API provider types
 */
export type ApiProviderType = 'anthropic' | 'openai' | 'azure' | 'custom';

/**
 * API Provider configuration
 */
export interface ApiProvider {
  id: string;
  name: string;
  type: ApiProviderType;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default API provider configurations
 */
export const DEFAULT_API_PROVIDERS: Omit<ApiProvider, 'id' | 'apiKey' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com', enabled: false },
  { name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com', enabled: false },
  { name: 'Azure OpenAI', type: 'azure', enabled: false },
];

// ============ MCP Server Types ============

/**
 * MCP Server transport type
 */
export type McpTransportType = 'stdio' | 'sse' | 'websocket';

/**
 * MCP Server configuration
 */
export interface McpServer {
  id: string;
  name: string;
  description?: string;
  transport: McpTransportType;
  /** Command to run for stdio transport */
  command?: string;
  /** Arguments for the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** URL for SSE/WebSocket transport */
  url?: string;
  /** Whether this server is enabled */
  enabled: boolean;
  /** Available tools from this server */
  tools?: McpTool[];
  /** Connection status */
  status?: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Last error message */
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Default MCP server templates
 */
export const DEFAULT_MCP_TEMPLATES: Omit<McpServer, 'id' | 'createdAt' | 'updatedAt' | 'status'>[] = [
  {
    name: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
    enabled: false,
  },
  {
    name: 'GitHub',
    description: 'Interact with GitHub repositories',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: '' },
    enabled: false,
  },
  {
    name: 'Brave Search',
    description: 'Search the web using Brave Search API',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    enabled: false,
  },
];

// ============ Skills Types ============

/**
 * Skill trigger type
 */
export type SkillTriggerType = 'slash-command' | 'keyword' | 'manual';

/**
 * Skill definition
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Trigger command (e.g., "/commit", "/review") */
  trigger: string;
  triggerType: SkillTriggerType;
  /** System prompt or instructions for the skill */
  prompt: string;
  /** Icon name from lucide */
  icon?: string;
  /** Whether this skill is enabled */
  enabled: boolean;
  /** Whether this is a built-in skill */
  isBuiltIn?: boolean;
  /** Required MCP servers for this skill */
  requiredMcpServers?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default built-in skills
 */
export const DEFAULT_SKILLS: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Commit',
    description: 'Create a well-formatted git commit with conventional commit messages',
    trigger: '/commit',
    triggerType: 'slash-command',
    prompt: 'Help me create a git commit. Analyze the staged changes, suggest a conventional commit message, and execute the commit.',
    icon: 'GitCommit',
    enabled: true,
    isBuiltIn: true,
  },
  {
    name: 'Review PR',
    description: 'Review a pull request and provide feedback',
    trigger: '/review-pr',
    triggerType: 'slash-command',
    prompt: 'Review the specified pull request. Analyze the changes, identify potential issues, and provide constructive feedback.',
    icon: 'GitPullRequest',
    enabled: true,
    isBuiltIn: true,
  },
  {
    name: 'Explain Code',
    description: 'Explain the selected code in detail',
    trigger: '/explain',
    triggerType: 'slash-command',
    prompt: 'Explain the following code in detail. Cover what it does, how it works, and any important patterns or concepts used.',
    icon: 'BookOpen',
    enabled: true,
    isBuiltIn: true,
  },
  {
    name: 'Refactor',
    description: 'Suggest refactoring improvements for the code',
    trigger: '/refactor',
    triggerType: 'slash-command',
    prompt: 'Analyze the code and suggest refactoring improvements. Focus on readability, maintainability, and best practices.',
    icon: 'Wand2',
    enabled: true,
    isBuiltIn: true,
  },
  {
    name: 'Write Tests',
    description: 'Generate unit tests for the code',
    trigger: '/test',
    triggerType: 'slash-command',
    prompt: 'Generate comprehensive unit tests for the provided code. Include edge cases and ensure good coverage.',
    icon: 'TestTube2',
    enabled: true,
    isBuiltIn: true,
  },
];

// ============ RSS Integration Types ============

/**
 * RSS feed status
 */
export type RSSFeedStatus = 'active' | 'paused' | 'error';

/**
 * RSS category for organizing feeds
 */
export interface RSSCategory {
  id: string;
  name: string;
  color?: string;
  feedCount: number;
  createdAt: Date;
}

/**
 * RSS feed configuration
 */
export interface RSSFeed {
  id: string;
  url: string;
  title: string;
  description?: string;
  siteUrl?: string;
  iconUrl?: string;

  // Organization
  categoryId?: string;
  tags: string[];

  // State
  status: RSSFeedStatus;
  errorMessage?: string;
  lastFetchedAt?: Date;
  articleCount: number;
  unreadCount: number;

  // Cache headers
  etag?: string;
  lastModified?: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * RSS enclosure (for podcasts, videos)
 */
export interface RSSEnclosure {
  url: string;
  type: string;   // audio/mpeg, video/mp4, etc.
  length?: number;
}

/**
 * RSS article/item
 */
export interface RSSArticle {
  id: string;
  feedId: string;

  // Content
  title: string;
  link: string;
  content: string;       // Full content or description
  summary?: string;      // AI-generated summary
  author?: string;

  // Media
  imageUrl?: string;
  enclosures?: RSSEnclosure[];

  // Metadata
  publishedAt: Date;
  fetchedAt: Date;

  // State
  isRead: boolean;
  isStarred: boolean;

  // AI enrichment
  extractedTopics?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

/**
 * RSS integration settings
 */
export interface RSSIntegration {
  id: 'rss';
  name: 'RSS Feeds';
  type: 'information-source';
  status: 'active' | 'inactive';

  // Feed management
  feeds: RSSFeed[];
  categories: RSSCategory[];

  // Sync settings
  refreshInterval: number;  // minutes, default 30
  lastSyncAt?: Date;

  // Storage settings
  retentionDays: number;    // how long to keep articles, default 30
  maxArticlesPerFeed: number; // default 100
}

/**
 * Default RSS integration settings
 */
export const DEFAULT_RSS_INTEGRATION: RSSIntegration = {
  id: 'rss',
  name: 'RSS Feeds',
  type: 'information-source',
  status: 'inactive',
  feeds: [],
  categories: [],
  refreshInterval: 30,
  retentionDays: 30,
  maxArticlesPerFeed: 100,
};

/**
 * Suggested RSS feeds by category
 */
export const SUGGESTED_RSS_FEEDS = {
  'Tech News': [
    { url: 'https://hnrss.org/frontpage', name: 'Hacker News' },
    { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' },
    { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
    { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' },
  ],
  'AI & ML': [
    { url: 'https://openai.com/blog/rss/', name: 'OpenAI Blog' },
    { url: 'https://blog.google/technology/ai/rss/', name: 'Google AI Blog' },
    { url: 'https://www.anthropic.com/rss.xml', name: 'Anthropic' },
    { url: 'https://huggingface.co/blog/feed.xml', name: 'Hugging Face' },
  ],
  'Development': [
    { url: 'https://github.blog/feed/', name: 'GitHub Blog' },
    { url: 'https://blog.rust-lang.org/feed.xml', name: 'Rust Blog' },
    { url: 'https://overreacted.io/rss.xml', name: 'Overreacted (Dan Abramov)' },
  ],
};
