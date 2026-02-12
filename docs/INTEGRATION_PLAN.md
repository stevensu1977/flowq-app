# FlowQ Integration Plan

## Overview

This document outlines the integration strategy for FlowQ, enabling users to connect external services as context sources for AI conversations. The goal is to provide seamless access to user's data across various platforms while maintaining FlowQ's local-first privacy principles.

---

## Architecture

### Integration Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                        FlowQ App                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Chat Window │  │  Sidebar    │  │  Settings Panel     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                    ┌─────▼─────┐                             │
│                    │Integration│                             │
│                    │  Manager  │                             │
│                    └─────┬─────┘                             │
│                          │                                   │
│    ┌─────────────────────┼─────────────────────┐            │
│    │                     │                     │            │
│    ▼                     ▼                     ▼            │
│ ┌──────┐           ┌──────────┐          ┌─────────┐        │
│ │Notion│           │ Linear   │          │ GitHub  │        │
│ │Plugin│           │ Plugin   │          │ Plugin  │        │
│ └──┬───┘           └────┬─────┘          └────┬────┘        │
│    │                    │                     │             │
└────┼────────────────────┼─────────────────────┼─────────────┘
     │                    │                     │
     ▼                    ▼                     ▼
┌─────────┐        ┌──────────┐          ┌─────────┐
│Notion   │        │ Linear   │          │ GitHub  │
│   API   │        │   API    │          │   API   │
└─────────┘        └──────────┘          └─────────┘
```

### Core Components

1. **Integration Manager** (`lib/integrations/manager.ts`)
   - Central registry for all integrations
   - Handles OAuth flows and token management
   - Provides unified API for fetching data

2. **Plugin Interface** (`types/integration.ts`)
   - Standardized interface all integrations must implement
   - Defines capabilities: read, search, write

3. **Token Store** (Tauri secure storage)
   - Encrypted storage for OAuth tokens
   - Automatic token refresh handling

---

## Recommended Integrations

### Tier 1: High Priority (MVP)

| Integration | Use Case | Auth Type | Complexity |
|------------|----------|-----------|------------|
| **Notion** | Knowledge base, docs, wikis | OAuth 2.0 | Medium |
| **GitHub** | Code repos, issues, PRs | OAuth 2.0 | Medium |
| **Google Drive** | Documents, sheets, files | OAuth 2.0 | High |

### Tier 2: Medium Priority

| Integration | Use Case | Auth Type | Complexity |
|------------|----------|-----------|------------|
| **Linear** | Project management, issues | OAuth 2.0 | Low |
| **Slack** | Team conversations | OAuth 2.0 | Medium |
| **Confluence** | Enterprise wikis | OAuth 2.0 | Medium |
| **Jira** | Issue tracking | OAuth 2.0 | Medium |

### Tier 3: Future Consideration

| Integration | Use Case | Auth Type | Complexity |
|------------|----------|-----------|------------|
| **Figma** | Design files | OAuth 2.0 | Medium |
| **Airtable** | Databases | OAuth 2.0 | Low |
| **Dropbox** | File storage | OAuth 2.0 | Medium |

### Local Note Apps (Special Category)

| App | Use Case | Access Method | Complexity |
|-----|----------|---------------|------------|
| **Obsidian** | Markdown notes, PKM | Local filesystem | Low |
| **Craft** | Rich documents, notes | URL scheme + SQLite | Medium |
| **Apple Notes** | Quick notes | AppleScript/Shortcuts | High |
| **Bear** | Markdown notes | URL scheme + SQLite | Medium |
| **Logseq** | Outliner, PKM | Local filesystem | Low |

### Information Sources (Special Category)

| Source | Use Case | Access Method | Complexity |
|--------|----------|---------------|------------|
| **RSS Feeds** | News, blogs, podcasts | HTTP fetch + local cache | Low |
| **Hacker News** | Tech news | Public API | Low |
| **Reddit** | Community discussions | Public API | Medium |

---

## Local Note Apps Integration (Detailed)

Local note-taking apps are different from cloud services—they store data locally, which aligns perfectly with FlowQ's local-first philosophy. No OAuth needed, just filesystem access.

### Obsidian Integration

#### Why Obsidian?

1. **100% Local** - All data stored as plain markdown files
2. **No API needed** - Direct filesystem access
3. **Rich ecosystem** - Links, tags, frontmatter metadata
4. **Popular PKM tool** - Large user base among knowledge workers

#### Data Model

```typescript
// types/integrations/obsidian.ts

interface ObsidianIntegration {
  id: 'obsidian';
  name: 'Obsidian';
  type: 'local-app';
  status: 'connected' | 'disconnected';

  // Vault configuration
  vaultPath: string;           // e.g., ~/Documents/MyVault
  vaultName: string;

  // Indexing state
  lastIndexedAt?: Date;
  noteCount?: number;

  // Options
  includeAttachments: boolean;
  watchForChanges: boolean;
}

interface ObsidianNote {
  path: string;                // Relative path in vault
  title: string;               // Filename without .md
  content: string;             // Raw markdown
  frontmatter?: Record<string, any>;  // YAML frontmatter

  // Obsidian-specific
  tags: string[];              // #tag references
  links: string[];             // [[wiki-links]]
  backlinks: string[];         // Notes linking to this

  // Metadata
  created: Date;
  modified: Date;
  size: number;
}

interface ObsidianSearchResult {
  notes: ObsidianNote[];
  totalCount: number;
  searchTime: number;
}
```

#### Implementation

```typescript
// lib/integrations/obsidian/index.ts

import { invoke } from '@tauri-apps/api/core';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import matter from 'gray-matter';

export class ObsidianVault {
  private vaultPath: string;
  private noteIndex: Map<string, ObsidianNote> = new Map();

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * Index all markdown files in the vault
   */
  async buildIndex(): Promise<void> {
    const files = await this.walkDirectory(this.vaultPath);

    for (const file of files) {
      if (file.endsWith('.md')) {
        const note = await this.parseNote(file);
        this.noteIndex.set(note.path, note);
      }
    }
  }

  /**
   * Parse a single markdown note
   */
  async parseNote(filePath: string): Promise<ObsidianNote> {
    const content = await readTextFile(filePath);
    const { data: frontmatter, content: body } = matter(content);

    // Extract Obsidian-specific elements
    const tags = this.extractTags(body);
    const links = this.extractWikiLinks(body);

    const relativePath = filePath.replace(this.vaultPath + '/', '');

    return {
      path: relativePath,
      title: this.getTitle(relativePath, frontmatter),
      content: body,
      frontmatter,
      tags,
      links,
      backlinks: [], // Computed after full index
      created: new Date(), // From file stats
      modified: new Date(),
      size: content.length,
    };
  }

  /**
   * Search notes by query
   */
  async search(query: string, options?: {
    tags?: string[];
    folder?: string;
    limit?: number;
  }): Promise<ObsidianSearchResult> {
    const results: ObsidianNote[] = [];
    const queryLower = query.toLowerCase();

    for (const note of this.noteIndex.values()) {
      // Filter by folder
      if (options?.folder && !note.path.startsWith(options.folder)) {
        continue;
      }

      // Filter by tags
      if (options?.tags?.length) {
        const hasAllTags = options.tags.every(t => note.tags.includes(t));
        if (!hasAllTags) continue;
      }

      // Search in title and content
      if (
        note.title.toLowerCase().includes(queryLower) ||
        note.content.toLowerCase().includes(queryLower)
      ) {
        results.push(note);
      }
    }

    return {
      notes: results.slice(0, options?.limit || 20),
      totalCount: results.length,
      searchTime: 0,
    };
  }

  /**
   * Get note by path
   */
  async getNote(path: string): Promise<ObsidianNote | null> {
    return this.noteIndex.get(path) || null;
  }

  /**
   * Get daily note for today
   */
  async getDailyNote(date?: Date): Promise<ObsidianNote | null> {
    const d = date || new Date();
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

    // Common daily note patterns
    const patterns = [
      `Daily Notes/${dateStr}.md`,
      `daily/${dateStr}.md`,
      `${dateStr}.md`,
    ];

    for (const pattern of patterns) {
      const note = this.noteIndex.get(pattern);
      if (note) return note;
    }

    return null;
  }

  // Helper methods
  private extractTags(content: string): string[] {
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    const matches = content.match(tagRegex) || [];
    return [...new Set(matches.map(t => t.slice(1)))];
  }

  private extractWikiLinks(content: string): string[] {
    const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const matches = [...content.matchAll(linkRegex)];
    return matches.map(m => m[1]);
  }

  private getTitle(path: string, frontmatter: any): string {
    if (frontmatter?.title) return frontmatter.title;
    return path.split('/').pop()?.replace('.md', '') || 'Untitled';
  }

  private async walkDirectory(dir: string): Promise<string[]> {
    const entries = await readDir(dir);
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        // Skip hidden folders and .obsidian config
        if (!entry.name.startsWith('.')) {
          files.push(...await this.walkDirectory(fullPath));
        }
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}
```

#### UI Component

```tsx
// components/integrations/ObsidianIntegration.tsx

const ObsidianIntegration: React.FC<{
  integration: ObsidianIntegration | null;
  onSelectVault: () => void;
  onDisconnect: () => void;
}> = ({ integration, onSelectVault, onDisconnect }) => {
  const isConnected = integration?.status === 'connected';

  return (
    <div className="p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center gap-3">
        {/* Obsidian Logo */}
        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <span className="text-xl">💎</span>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Obsidian</h3>
          <p className="text-sm text-muted-foreground">
            {isConnected
              ? `${integration.vaultName} (${integration.noteCount} notes)`
              : 'Connect your Obsidian vault'}
          </p>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onSelectVault}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Change
            </button>
            <button
              onClick={onDisconnect}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            onClick={onSelectVault}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Select Vault
          </button>
        )}
      </div>

      {isConnected && (
        <div className="mt-4 pt-4 border-t border-border space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-4 h-4 rounded bg-purple-500/20 flex items-center justify-center text-xs">📁</span>
            <span className="font-mono text-xs truncate">{integration.vaultPath}</span>
          </div>
          {integration.lastIndexedAt && (
            <div className="text-xs text-muted-foreground">
              Indexed: {formatRelativeTime(integration.lastIndexedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

---

### Craft Integration

#### Why Craft?

1. **Beautiful documents** - Rich text, code blocks, cards
2. **macOS native** - Deep system integration
3. **URL scheme** - `craftdocs://` for opening/linking
4. **Local + Cloud** - Can work fully offline

#### Challenges

- **No public API** - Craft doesn't expose a REST API
- **SQLite storage** - Data stored in encrypted SQLite
- **URL scheme only** - Limited to opening documents

#### Implementation Approach

```typescript
// types/integrations/craft.ts

interface CraftIntegration {
  id: 'craft';
  name: 'Craft';
  type: 'local-app';
  status: 'connected' | 'disconnected' | 'limited';

  // Craft stores data in ~/Library/Group Containers/
  dataPath?: string;

  // Available capabilities
  capabilities: {
    openDocument: boolean;   // Always available via URL scheme
    readContent: boolean;    // Requires DB access
    search: boolean;         // Requires DB access
  };
}

interface CraftDocument {
  id: string;
  title: string;
  spaceId: string;
  spaceName: string;
  content?: string;          // Extracted text
  deeplink: string;          // craftdocs://open?...
  created: Date;
  modified: Date;
}
```

#### URL Scheme Operations

```typescript
// lib/integrations/craft/index.ts

import { open } from '@tauri-apps/plugin-shell';

export class CraftIntegration {
  /**
   * Open a document in Craft
   */
  async openDocument(documentId: string, spaceId: string): Promise<void> {
    const url = `craftdocs://open?blockId=${documentId}&spaceId=${spaceId}`;
    await open(url);
  }

  /**
   * Create a new document (opens Craft with new doc)
   */
  async createDocument(spaceId: string): Promise<void> {
    const url = `craftdocs://createdocument?spaceId=${spaceId}`;
    await open(url);
  }

  /**
   * Open search in Craft
   */
  async openSearch(query: string): Promise<void> {
    const url = `craftdocs://search?query=${encodeURIComponent(query)}`;
    await open(url);
  }

  /**
   * Attempt to read from Craft's local database
   * Note: This may not work if database is encrypted
   */
  async tryReadDatabase(): Promise<CraftDocument[] | null> {
    // Craft stores data in:
    // ~/Library/Group Containers/XXXXXXXXXX.craft/Data/...

    // This is complex and may require reverse engineering
    // For now, return null to indicate limited capability
    return null;
  }
}
```

#### Craft UI Component

```tsx
// components/integrations/CraftIntegration.tsx

const CraftIntegration: React.FC<{
  integration: CraftIntegration | null;
  onConnect: () => void;
}> = ({ integration, onConnect }) => {
  const isConnected = integration?.status === 'connected';
  const isLimited = integration?.status === 'limited';

  return (
    <div className="p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center gap-3">
        {/* Craft Logo */}
        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <span className="text-xl">📝</span>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Craft</h3>
          <p className="text-sm text-muted-foreground">
            {isConnected
              ? 'Connected'
              : isLimited
                ? 'Limited access (URL scheme only)'
                : 'Connect Craft documents'}
          </p>
        </div>

        <button
          onClick={onConnect}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {isConnected ? 'Configure' : 'Connect'}
        </button>
      </div>

      {(isConnected || isLimited) && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span className="text-muted-foreground">Open documents in Craft</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span className="text-muted-foreground">Create new documents</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={integration?.capabilities.readContent ? 'text-green-500' : 'text-yellow-500'}>
                {integration?.capabilities.readContent ? '✓' : '⚠'}
              </span>
              <span className="text-muted-foreground">
                Read document content
                {!integration?.capabilities.readContent && ' (limited)'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

---

### Using Local Notes in Chat

#### Slash Commands

```typescript
// Built-in commands for local note apps

const LOCAL_NOTE_COMMANDS: Skill[] = [
  {
    id: 'obsidian-search',
    name: '/obsidian',
    description: 'Search Obsidian vault',
    prompt: 'Search my Obsidian notes for: {{query}}',
    enabled: true,
    builtin: true,
  },
  {
    id: 'obsidian-daily',
    name: '/daily',
    description: 'Get today\'s daily note',
    prompt: 'Show me my daily note for today',
    enabled: true,
    builtin: true,
  },
  {
    id: 'craft-open',
    name: '/craft',
    description: 'Open Craft document',
    prompt: 'Open Craft document: {{name}}',
    enabled: true,
    builtin: true,
  },
];
```

#### Context Injection

```typescript
// Detect @obsidian mentions and inject note content

async function processObsidianMentions(
  message: string,
  vault: ObsidianVault
): Promise<string> {
  // Match @obsidian:note-name or @obs:note-name
  const obsidianRegex = /@(?:obsidian|obs):([^\s]+)/g;
  const matches = [...message.matchAll(obsidianRegex)];

  if (matches.length === 0) return message;

  let enrichedMessage = message;

  for (const match of matches) {
    const noteName = match[1];
    const note = await vault.search(noteName, { limit: 1 });

    if (note.notes.length > 0) {
      const noteContent = note.notes[0].content;
      enrichedMessage += `\n\n---\n**Obsidian Note: ${note.notes[0].title}**\n\n${noteContent}\n---`;
    }
  }

  return enrichedMessage;
}
```

---

## RSS Integration (Detailed)

### Why RSS?

1. **No authentication** - Just provide a feed URL
2. **Standard format** - Well-defined XML/JSON structure
3. **Broad coverage** - News, blogs, podcasts, YouTube channels, newsletters
4. **Local-first friendly** - Fetch once, cache locally
5. **Privacy respecting** - No tracking, no accounts

### Use Cases

- **Stay informed** - Track industry news, tech blogs
- **Research** - Aggregate sources for a topic
- **Content curation** - Build personal knowledge streams
- **AI summarization** - Let Claude summarize your feeds

### Data Model

```typescript
// types/integrations/rss.ts

interface RSSIntegration {
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

interface RSSFeed {
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
  status: 'active' | 'paused' | 'error';
  errorMessage?: string;
  lastFetchedAt?: Date;
  articleCount: number;
  unreadCount: number;
}

interface RSSCategory {
  id: string;
  name: string;
  color?: string;
  feedCount: number;
}

interface RSSArticle {
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
  enclosures?: RSSEnclosure[];  // Podcasts, videos

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

interface RSSEnclosure {
  url: string;
  type: string;   // audio/mpeg, video/mp4, etc.
  length?: number;
}
```

### Implementation

```typescript
// lib/integrations/rss/index.ts

import { invoke } from '@tauri-apps/api/core';

export class RSSManager {
  private feeds: Map<string, RSSFeed> = new Map();
  private articles: Map<string, RSSArticle[]> = new Map();

  /**
   * Add a new RSS feed
   */
  async addFeed(url: string, options?: {
    categoryId?: string;
    tags?: string[];
  }): Promise<RSSFeed> {
    // Validate and fetch feed info
    const feedInfo = await this.fetchFeedInfo(url);

    const feed: RSSFeed = {
      id: generateId(),
      url,
      title: feedInfo.title,
      description: feedInfo.description,
      siteUrl: feedInfo.link,
      iconUrl: feedInfo.icon,
      categoryId: options?.categoryId,
      tags: options?.tags || [],
      status: 'active',
      lastFetchedAt: new Date(),
      articleCount: 0,
      unreadCount: 0,
    };

    // Store feed
    this.feeds.set(feed.id, feed);
    await this.saveFeed(feed);

    // Initial fetch
    await this.refreshFeed(feed.id);

    return feed;
  }

  /**
   * Refresh a single feed
   */
  async refreshFeed(feedId: string): Promise<RSSArticle[]> {
    const feed = this.feeds.get(feedId);
    if (!feed) throw new Error('Feed not found');

    try {
      // Fetch and parse RSS
      const response = await invoke<string>('fetch_rss', { url: feed.url });
      const parsed = this.parseRSS(response);

      // Convert to articles
      const newArticles = parsed.items.map(item => this.itemToArticle(item, feedId));

      // Deduplicate and merge
      const existingArticles = this.articles.get(feedId) || [];
      const merged = this.mergeArticles(existingArticles, newArticles);

      // Update state
      this.articles.set(feedId, merged);
      feed.lastFetchedAt = new Date();
      feed.articleCount = merged.length;
      feed.unreadCount = merged.filter(a => !a.isRead).length;
      feed.status = 'active';
      feed.errorMessage = undefined;

      await this.saveFeed(feed);
      await this.saveArticles(feedId, merged);

      return newArticles;
    } catch (error) {
      feed.status = 'error';
      feed.errorMessage = error.message;
      await this.saveFeed(feed);
      throw error;
    }
  }

  /**
   * Refresh all active feeds
   */
  async refreshAllFeeds(): Promise<void> {
    const activeFeeds = [...this.feeds.values()].filter(f => f.status !== 'paused');

    await Promise.allSettled(
      activeFeeds.map(feed => this.refreshFeed(feed.id))
    );
  }

  /**
   * Search articles across all feeds
   */
  async searchArticles(query: string, options?: {
    feedIds?: string[];
    categoryId?: string;
    tags?: string[];
    unreadOnly?: boolean;
    starredOnly?: boolean;
    dateRange?: { start: Date; end: Date };
    limit?: number;
  }): Promise<RSSArticle[]> {
    const queryLower = query.toLowerCase();
    const results: RSSArticle[] = [];

    for (const [feedId, articles] of this.articles) {
      // Filter by feed/category
      if (options?.feedIds && !options.feedIds.includes(feedId)) continue;

      const feed = this.feeds.get(feedId);
      if (options?.categoryId && feed?.categoryId !== options.categoryId) continue;

      for (const article of articles) {
        // Apply filters
        if (options?.unreadOnly && article.isRead) continue;
        if (options?.starredOnly && !article.isStarred) continue;
        if (options?.dateRange) {
          if (article.publishedAt < options.dateRange.start) continue;
          if (article.publishedAt > options.dateRange.end) continue;
        }

        // Search in title and content
        if (
          article.title.toLowerCase().includes(queryLower) ||
          article.content.toLowerCase().includes(queryLower)
        ) {
          results.push(article);
        }

        if (options?.limit && results.length >= options.limit) break;
      }
    }

    // Sort by date descending
    return results.sort((a, b) =>
      b.publishedAt.getTime() - a.publishedAt.getTime()
    );
  }

  /**
   * Get recent articles for AI context
   */
  async getRecentArticles(options?: {
    hours?: number;
    limit?: number;
    feedIds?: string[];
  }): Promise<RSSArticle[]> {
    const hours = options?.hours || 24;
    const limit = options?.limit || 50;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const allArticles: RSSArticle[] = [];

    for (const [feedId, articles] of this.articles) {
      if (options?.feedIds && !options.feedIds.includes(feedId)) continue;

      for (const article of articles) {
        if (article.publishedAt >= cutoff) {
          allArticles.push(article);
        }
      }
    }

    return allArticles
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get article by ID
   */
  async getArticle(feedId: string, articleId: string): Promise<RSSArticle | null> {
    const articles = this.articles.get(feedId);
    return articles?.find(a => a.id === articleId) || null;
  }

  /**
   * Mark article as read
   */
  async markAsRead(feedId: string, articleId: string): Promise<void> {
    const article = await this.getArticle(feedId, articleId);
    if (article && !article.isRead) {
      article.isRead = true;
      const feed = this.feeds.get(feedId);
      if (feed) feed.unreadCount--;
      await this.saveArticles(feedId, this.articles.get(feedId) || []);
    }
  }

  /**
   * Star/unstar article
   */
  async toggleStar(feedId: string, articleId: string): Promise<boolean> {
    const article = await this.getArticle(feedId, articleId);
    if (article) {
      article.isStarred = !article.isStarred;
      await this.saveArticles(feedId, this.articles.get(feedId) || []);
      return article.isStarred;
    }
    return false;
  }

  // Helper methods
  private parseRSS(xml: string): ParsedFeed {
    // Use DOMParser or a library like rss-parser
    // Support both RSS 2.0 and Atom formats
    // ...implementation
  }

  private itemToArticle(item: ParsedItem, feedId: string): RSSArticle {
    return {
      id: item.guid || item.link || generateId(),
      feedId,
      title: item.title || 'Untitled',
      link: item.link || '',
      content: item.content || item.description || '',
      author: item.author,
      imageUrl: this.extractImage(item),
      enclosures: item.enclosures,
      publishedAt: new Date(item.pubDate || Date.now()),
      fetchedAt: new Date(),
      isRead: false,
      isStarred: false,
    };
  }

  private async fetchFeedInfo(url: string): Promise<{
    title: string;
    description?: string;
    link?: string;
    icon?: string;
  }> {
    const response = await invoke<string>('fetch_rss', { url });
    const parsed = this.parseRSS(response);
    return {
      title: parsed.title || new URL(url).hostname,
      description: parsed.description,
      link: parsed.link,
      icon: parsed.icon || `${new URL(url).origin}/favicon.ico`,
    };
  }
}
```

### Rust Backend for Feed Fetching

```rust
// src-tauri/src/rss.rs

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedResult {
    pub content: String,
    pub content_type: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

/// Fetch RSS feed with proper headers and caching support
#[tauri::command]
pub async fn fetch_rss(
    url: String,
    etag: Option<String>,
    last_modified: Option<String>,
) -> Result<FeedResult, String> {
    let client = Client::builder()
        .user_agent("FlowQ/1.0 RSS Reader")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(&url);

    // Add conditional headers for caching
    if let Some(etag) = etag {
        request = request.header("If-None-Match", etag);
    }
    if let Some(lm) = last_modified {
        request = request.header("If-Modified-Since", lm);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    // Handle 304 Not Modified
    if response.status() == 304 {
        return Err("Not Modified".to_string());
    }

    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status(), response.status().as_str()));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/xml")
        .to_string();

    let etag = response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let last_modified = response
        .headers()
        .get("last-modified")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let content = response.text().await.map_err(|e| e.to_string())?;

    Ok(FeedResult {
        content,
        content_type,
        etag,
        last_modified,
    })
}
```

### SQLite Storage for Articles

```rust
// src-tauri/src/rss_db.rs

/// Initialize RSS tables
pub fn init_rss_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS rss_feeds (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT,
            site_url TEXT,
            icon_url TEXT,
            category_id TEXT,
            tags TEXT,  -- JSON array
            status TEXT DEFAULT 'active',
            error_message TEXT,
            last_fetched_at INTEGER,
            etag TEXT,
            last_modified TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS rss_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS rss_articles (
            id TEXT PRIMARY KEY,
            feed_id TEXT NOT NULL,
            title TEXT NOT NULL,
            link TEXT NOT NULL,
            content TEXT,
            summary TEXT,
            author TEXT,
            image_url TEXT,
            enclosures TEXT,  -- JSON array
            published_at INTEGER NOT NULL,
            fetched_at INTEGER NOT NULL,
            is_read INTEGER DEFAULT 0,
            is_starred INTEGER DEFAULT 0,
            topics TEXT,  -- JSON array
            FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_articles_feed ON rss_articles(feed_id);
        CREATE INDEX IF NOT EXISTS idx_articles_published ON rss_articles(published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_articles_unread ON rss_articles(feed_id, is_read);

        -- Full-text search for articles
        CREATE VIRTUAL TABLE IF NOT EXISTS rss_articles_fts USING fts5(
            title, content, feed_id,
            content='rss_articles',
            content_rowid='rowid'
        );
    "#)?;

    Ok(())
}
```

### UI Component

```tsx
// components/integrations/RSSIntegration.tsx

interface RSSIntegrationProps {
  integration: RSSIntegration;
  onAddFeed: (url: string) => void;
  onRefresh: () => void;
  onManageFeeds: () => void;
}

const RSSIntegration: React.FC<RSSIntegrationProps> = ({
  integration,
  onAddFeed,
  onRefresh,
  onManageFeeds,
}) => {
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddFeed = async () => {
    if (!newFeedUrl.trim()) return;
    setIsAdding(true);
    try {
      await onAddFeed(newFeedUrl);
      setNewFeedUrl('');
    } finally {
      setIsAdding(false);
    }
  };

  const totalUnread = integration.feeds.reduce((sum, f) => sum + f.unreadCount, 0);

  return (
    <div className="p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center gap-3">
        {/* RSS Icon */}
        <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <span className="text-xl">📡</span>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-foreground">RSS Feeds</h3>
          <p className="text-sm text-muted-foreground">
            {integration.feeds.length} feeds · {totalUnread} unread
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          title="Refresh all feeds"
        >
          <RefreshCw size={16} />
        </button>

        <button
          onClick={onManageFeeds}
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        >
          Manage
        </button>
      </div>

      {/* Quick add feed */}
      <div className="mt-4 flex gap-2">
        <input
          type="url"
          value={newFeedUrl}
          onChange={(e) => setNewFeedUrl(e.target.value)}
          placeholder="Enter RSS feed URL..."
          className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          onKeyDown={(e) => e.key === 'Enter' && handleAddFeed()}
        />
        <button
          onClick={handleAddFeed}
          disabled={isAdding || !newFeedUrl.trim()}
          className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          {isAdding ? 'Adding...' : 'Add Feed'}
        </button>
      </div>

      {/* Feed list preview */}
      {integration.feeds.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border space-y-2 max-h-48 overflow-y-auto">
          {integration.feeds.slice(0, 5).map(feed => (
            <div key={feed.id} className="flex items-center gap-2 text-sm">
              {feed.iconUrl && (
                <img src={feed.iconUrl} className="w-4 h-4 rounded" alt="" />
              )}
              <span className="flex-1 truncate text-foreground">{feed.title}</span>
              {feed.unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-full">
                  {feed.unreadCount}
                </span>
              )}
              {feed.status === 'error' && (
                <span className="text-red-500" title={feed.errorMessage}>⚠</span>
              )}
            </div>
          ))}
          {integration.feeds.length > 5 && (
            <div className="text-xs text-muted-foreground">
              +{integration.feeds.length - 5} more feeds
            </div>
          )}
        </div>
      )}

      {integration.lastSyncAt && (
        <div className="mt-3 text-xs text-muted-foreground">
          Last synced: {formatRelativeTime(integration.lastSyncAt)}
        </div>
      )}
    </div>
  );
};
```

### Slash Commands for RSS

```typescript
// Built-in RSS commands

const RSS_COMMANDS: Skill[] = [
  {
    id: 'rss-news',
    name: '/news',
    description: 'Get recent news from RSS feeds',
    prompt: `Summarize the latest news from my RSS feeds. Focus on the most important stories from the past {{hours || 24}} hours.`,
    enabled: true,
    builtin: true,
  },
  {
    id: 'rss-search',
    name: '/rss',
    description: 'Search RSS articles',
    prompt: 'Search my RSS feeds for articles about: {{query}}',
    enabled: true,
    builtin: true,
  },
  {
    id: 'rss-digest',
    name: '/digest',
    description: 'Generate daily digest from RSS',
    prompt: `Create a daily digest from my RSS feeds. Group articles by topic and highlight the most important ones.`,
    enabled: true,
    builtin: true,
  },
  {
    id: 'rss-topic',
    name: '/topic',
    description: 'Deep dive into a topic from RSS',
    prompt: `Find all articles about "{{topic}}" from my RSS feeds and provide a comprehensive summary with key insights.`,
    enabled: true,
    builtin: true,
  },
];
```

### @rss Mention System

The `@rss` mention works like `@#` for browser tabs - it pulls context from **all managed feeds** in your Integrations settings.

#### How It Works

```
User types: @rss 最近有什么AI新闻？
            ↓
FlowQ detects @rss mention
            ↓
Fetches recent articles from ALL feeds added in Integrations
            ↓
Injects article context into the message
            ↓
Claude analyzes and responds with relevant information
```

#### Mention Variants

| Mention | Description | Context Injected |
|---------|-------------|------------------|
| `@rss` | All managed feeds | Recent articles from all feeds (24h) |
| `@rss:tech` | Category filter | Articles from "tech" category only |
| `@feed:hackernews` | Specific feed | Articles from Hacker News feed only |
| `@news` | Alias for @rss | Same as @rss |

#### Implementation

```typescript
// lib/mentions/rss.ts

import { RSSManager } from '../integrations/feeds/rss/manager';

interface RSSMentionContext {
  articles: RSSArticle[];
  feedCount: number;
  unreadCount: number;
  timeRange: { start: Date; end: Date };
}

/**
 * Process @rss mentions and inject article context
 * Only pulls from feeds added in Integrations settings
 */
export async function processRSSMention(
  message: string,
  rssManager: RSSManager
): Promise<{ enrichedMessage: string; context: RSSMentionContext | null }> {
  // Match mention patterns
  const mentionPatterns = [
    /@rss(?::(\w+))?/g,           // @rss or @rss:category
    /@feed:([^\s]+)/g,            // @feed:feedname
    /@news/g,                     // @news alias
  ];

  let hasRSSMention = false;
  let categoryFilter: string | null = null;
  let feedFilter: string | null = null;

  for (const pattern of mentionPatterns) {
    const matches = [...message.matchAll(pattern)];
    if (matches.length > 0) {
      hasRSSMention = true;
      // Extract filters from match groups
      for (const match of matches) {
        if (match[0].startsWith('@rss:')) {
          categoryFilter = match[1];
        } else if (match[0].startsWith('@feed:')) {
          feedFilter = match[1];
        }
      }
    }
  }

  if (!hasRSSMention) {
    return { enrichedMessage: message, context: null };
  }

  // Get managed feeds from integration settings
  const managedFeeds = await rssManager.getManagedFeeds();

  if (managedFeeds.length === 0) {
    return {
      enrichedMessage: message + '\n\n> ⚠️ No RSS feeds configured. Add feeds in Settings > Integrations > RSS.',
      context: null,
    };
  }

  // Apply filters
  let feedIds: string[] | undefined;
  if (feedFilter) {
    const feed = managedFeeds.find(f =>
      f.title.toLowerCase().includes(feedFilter!.toLowerCase()) ||
      f.id === feedFilter
    );
    if (feed) feedIds = [feed.id];
  } else if (categoryFilter) {
    const categoryFeeds = managedFeeds.filter(f => f.categoryId === categoryFilter);
    feedIds = categoryFeeds.map(f => f.id);
  }

  // Fetch recent articles
  const timeRange = {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
    end: new Date(),
  };

  const articles = await rssManager.getRecentArticles({
    hours: 24,
    limit: 30,
    feedIds,
  });

  if (articles.length === 0) {
    return {
      enrichedMessage: message + '\n\n> ℹ️ No recent articles found in your RSS feeds.',
      context: null,
    };
  }

  // Format articles for context
  const formattedArticles = articles.map(article => {
    const feed = managedFeeds.find(f => f.id === article.feedId);
    const publishedTime = formatRelativeTime(article.publishedAt);

    return `### ${article.title}
**Source:** ${feed?.title || 'Unknown'} · ${publishedTime}
**Link:** ${article.link}

${article.content.slice(0, 500)}${article.content.length > 500 ? '...' : ''}
`;
  }).join('\n---\n');

  const contextHeader = `
---
## 📡 RSS Feed Context

**Feeds:** ${managedFeeds.length} configured · **Articles:** ${articles.length} from past 24 hours
${categoryFilter ? `**Category:** ${categoryFilter}` : ''}
${feedFilter ? `**Feed:** ${feedFilter}` : ''}

${formattedArticles}
---
`;

  return {
    enrichedMessage: message + contextHeader,
    context: {
      articles,
      feedCount: managedFeeds.length,
      unreadCount: articles.filter(a => !a.isRead).length,
      timeRange,
    },
  };
}
```

#### Integration with ChatWindow

```typescript
// In ChatWindow.tsx - handleSendMessage

async function handleSendMessage(content: string, attachments: Attachment[]) {
  let enrichedContent = content;
  const contexts: MessageContext[] = [];

  // Process @# browser mentions (existing)
  if (content.includes('@#')) {
    const browserResult = await processBrowserMention(content);
    enrichedContent = browserResult.enrichedMessage;
    if (browserResult.context) {
      contexts.push({ type: 'browser', ...browserResult.context });
    }
  }

  // Process @rss mentions (new)
  if (content.match(/@(rss|news|feed:)/)) {
    const rssResult = await processRSSMention(enrichedContent, rssManager);
    enrichedContent = rssResult.enrichedMessage;
    if (rssResult.context) {
      contexts.push({ type: 'rss', ...rssResult.context });
    }
  }

  // Send message with enriched content
  await sendMessage({
    content: enrichedContent,
    contexts,
    attachments,
  });
}
```

### RSS Management in Integrations Settings

The RSS integration appears in the **Integrations** tab of Settings, allowing users to manage their feed subscriptions.

#### Settings UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                              [X]  │
├─────────────────────────────────────────────────────────────┤
│  [AI] [MCP] [Skills] [Integrations] [General]              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Cloud Services ─────────────────────────────────────┐  │
│  │  📋 Notion          Not connected         [Connect]  │  │
│  │  🐙 GitHub          Connected             [Manage]   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Information Sources ────────────────────────────────┐  │
│  │  📡 RSS Feeds                                        │  │
│  │     12 feeds · 47 unread · Last sync: 5 min ago      │  │
│  │                                                       │  │
│  │     [Add Feed URL...                    ] [+ Add]    │  │
│  │                                                       │  │
│  │     ┌─ Tech News ────────────────────────────────┐   │  │
│  │     │  🟠 Hacker News           23 unread        │   │  │
│  │     │  🔵 The Verge             8 unread         │   │  │
│  │     │  🟣 TechCrunch            5 unread         │   │  │
│  │     └────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │     ┌─ AI & ML ──────────────────────────────────┐   │  │
│  │     │  🟢 OpenAI Blog           3 unread         │   │  │
│  │     │  🔴 Anthropic             2 unread         │   │  │
│  │     └────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │     [Manage Feeds] [Import OPML] [🔄 Refresh All]    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Local Apps ─────────────────────────────────────────┐  │
│  │  💎 Obsidian        ~/Documents/Notes     [Change]   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Feed Management Modal

```tsx
// components/integrations/Feeds/FeedManagerModal.tsx

const FeedManagerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  rssManager: RSSManager;
}> = ({ isOpen, onClose, rssManager }) => {
  const [feeds, setFeeds] = useState<RSSFeed[]>([]);
  const [categories, setCategories] = useState<RSSCategory[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<RSSFeed | null>(null);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage RSS Feeds">
      <div className="flex h-[500px]">
        {/* Sidebar: Categories & Feeds */}
        <div className="w-64 border-r border-border p-4 overflow-y-auto">
          <div className="space-y-4">
            {/* All Feeds */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                All Feeds ({feeds.length})
              </h3>
              {feeds.filter(f => !f.categoryId).map(feed => (
                <FeedItem
                  key={feed.id}
                  feed={feed}
                  isSelected={selectedFeed?.id === feed.id}
                  onClick={() => setSelectedFeed(feed)}
                />
              ))}
            </div>

            {/* Categories */}
            {categories.map(category => (
              <div key={category.id}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  {category.name} ({category.feedCount})
                </h3>
                {feeds.filter(f => f.categoryId === category.id).map(feed => (
                  <FeedItem
                    key={feed.id}
                    feed={feed}
                    isSelected={selectedFeed?.id === feed.id}
                    onClick={() => setSelectedFeed(feed)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Add Category */}
          <button className="mt-4 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg">
            + New Category
          </button>
        </div>

        {/* Main: Feed Details / Add Feed */}
        <div className="flex-1 p-4">
          {selectedFeed ? (
            <FeedDetails
              feed={selectedFeed}
              onUpdate={(updated) => {
                setFeeds(feeds.map(f => f.id === updated.id ? updated : f));
              }}
              onDelete={() => {
                setFeeds(feeds.filter(f => f.id !== selectedFeed.id));
                setSelectedFeed(null);
              }}
            />
          ) : (
            <AddFeedPanel
              onAdd={(newFeed) => {
                setFeeds([...feeds, newFeed]);
                setSelectedFeed(newFeed);
              }}
              categories={categories}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center p-4 border-t border-border">
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Import OPML
          </button>
          <button className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Export OPML
          </button>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg"
        >
          Done
        </button>
      </div>
    </Modal>
  );
};
```

### Mention Autocomplete

When user types `@rss`, show autocomplete with feed options:

```tsx
// In ChatInput mention autocomplete

const rssMentionOptions = [
  { label: '@rss', description: 'All your RSS feeds', icon: '📡' },
  { label: '@news', description: 'Alias for @rss', icon: '📰' },
  // Dynamic: categories from user's feeds
  ...categories.map(c => ({
    label: `@rss:${c.name.toLowerCase()}`,
    description: `${c.feedCount} feeds in ${c.name}`,
    icon: '📁',
  })),
  // Dynamic: individual feeds
  ...feeds.slice(0, 5).map(f => ({
    label: `@feed:${f.id}`,
    description: f.title,
    icon: f.iconUrl || '🔗',
  })),
];
```

### Popular RSS Feeds Suggestions

```typescript
// Suggested feeds by category

const SUGGESTED_FEEDS = {
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
  'Newsletters': [
    { url: 'https://www.tldrnewsletter.com/api/rss/tldr', name: 'TLDR' },
    { url: 'https://weekly.statuscode.com/rss', name: 'JavaScript Weekly' },
  ],
};
```

---

## Notion Integration (Detailed)

### Why Notion First?

1. **Popular knowledge base** - Many users store documentation in Notion
2. **Well-documented API** - Stable, comprehensive API
3. **Rich content types** - Pages, databases, blocks
4. **OAuth support** - Secure authentication

### Data Model

```typescript
// types/integrations/notion.ts

interface NotionIntegration {
  id: 'notion';
  name: 'Notion';
  icon: 'notion-icon';
  status: 'connected' | 'disconnected' | 'error';

  // OAuth credentials
  accessToken?: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaceIcon?: string;

  // Connection metadata
  connectedAt?: Date;
  lastSyncAt?: Date;

  // Permissions granted
  capabilities: {
    readContent: boolean;
    readComments: boolean;
    insertContent: boolean;
  };
}

interface NotionPage {
  id: string;
  title: string;
  url: string;
  icon?: string | { emoji: string };
  cover?: string;
  parentId?: string;
  parentType: 'workspace' | 'page' | 'database';
  lastEditedTime: Date;
  createdTime: Date;
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, NotionProperty>;
}

interface NotionSearchResult {
  pages: NotionPage[];
  databases: NotionDatabase[];
  totalCount: number;
}
```

### OAuth Flow

```typescript
// lib/integrations/notion/auth.ts

const NOTION_CONFIG = {
  clientId: process.env.NOTION_CLIENT_ID,
  clientSecret: process.env.NOTION_CLIENT_SECRET,
  redirectUri: 'flowq://oauth/notion/callback',
  authUrl: 'https://api.notion.com/v1/oauth/authorize',
  tokenUrl: 'https://api.notion.com/v1/oauth/token',
  scopes: ['read_content', 'read_user'],
};

export async function initiateNotionOAuth(): Promise<void> {
  const state = generateSecureState();
  await saveOAuthState('notion', state);

  const authUrl = new URL(NOTION_CONFIG.authUrl);
  authUrl.searchParams.set('client_id', NOTION_CONFIG.clientId);
  authUrl.searchParams.set('redirect_uri', NOTION_CONFIG.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('owner', 'user');

  // Open in system browser
  await open(authUrl.toString());
}

export async function handleNotionCallback(
  code: string,
  state: string
): Promise<NotionIntegration> {
  // Verify state
  const savedState = await getOAuthState('notion');
  if (state !== savedState) {
    throw new Error('Invalid OAuth state');
  }

  // Exchange code for token
  const response = await fetch(NOTION_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(`${NOTION_CONFIG.clientId}:${NOTION_CONFIG.clientSecret}`)}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: NOTION_CONFIG.redirectUri,
    }),
  });

  const data = await response.json();

  return {
    id: 'notion',
    name: 'Notion',
    status: 'connected',
    accessToken: data.access_token,
    workspaceId: data.workspace_id,
    workspaceName: data.workspace_name,
    workspaceIcon: data.workspace_icon,
    connectedAt: new Date(),
    capabilities: {
      readContent: true,
      readComments: false,
      insertContent: false,
    },
  };
}
```

### API Operations

```typescript
// lib/integrations/notion/api.ts

export class NotionAPI {
  private baseUrl = 'https://api.notion.com/v1';
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new NotionAPIError(response.status, await response.text());
    }

    return response.json();
  }

  /**
   * Search across all pages and databases
   */
  async search(query: string, options?: {
    filter?: 'page' | 'database';
    sort?: 'last_edited_time' | 'relevance';
    limit?: number;
  }): Promise<NotionSearchResult> {
    const response = await this.request<any>('/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        filter: options?.filter ? { value: options.filter, property: 'object' } : undefined,
        sort: options?.sort ? {
          direction: 'descending',
          timestamp: options.sort === 'last_edited_time' ? 'last_edited_time' : undefined,
        } : undefined,
        page_size: options?.limit || 20,
      }),
    });

    return {
      pages: response.results.filter((r: any) => r.object === 'page').map(transformPage),
      databases: response.results.filter((r: any) => r.object === 'database').map(transformDatabase),
      totalCount: response.results.length,
    };
  }

  /**
   * Get page content as markdown
   */
  async getPageContent(pageId: string): Promise<string> {
    const blocks = await this.getBlocks(pageId);
    return blocksToMarkdown(blocks);
  }

  /**
   * Get all blocks from a page
   */
  async getBlocks(blockId: string): Promise<any[]> {
    const blocks: any[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.request<any>(
        `/blocks/${blockId}/children${cursor ? `?start_cursor=${cursor}` : ''}`
      );
      blocks.push(...response.results);
      cursor = response.next_cursor;
    } while (cursor);

    return blocks;
  }

  /**
   * Query a database
   */
  async queryDatabase(
    databaseId: string,
    filter?: any,
    sorts?: any[]
  ): Promise<NotionPage[]> {
    const response = await this.request<any>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({ filter, sorts }),
    });

    return response.results.map(transformPage);
  }
}
```

### UI Component

```tsx
// components/integrations/NotionIntegration.tsx

interface NotionIntegrationProps {
  integration: NotionIntegration | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

const NotionIntegration: React.FC<NotionIntegrationProps> = ({
  integration,
  onConnect,
  onDisconnect,
}) => {
  const isConnected = integration?.status === 'connected';

  return (
    <div className="p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center gap-3">
        {/* Notion Logo */}
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24">
            {/* Notion icon SVG */}
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Notion</h3>
          <p className="text-sm text-muted-foreground">
            {isConnected
              ? `Connected to ${integration.workspaceName}`
              : 'Connect your Notion workspace'}
          </p>
        </div>

        {isConnected ? (
          <button
            onClick={onDisconnect}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
          >
            Connect
          </button>
        )}
      </div>

      {isConnected && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check size={14} className="text-green-500" />
            <span>Can read pages and databases</span>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Last synced: {formatRelativeTime(integration.lastSyncAt)}
          </div>
        </div>
      )}
    </div>
  );
};
```

---

## Using Integrations in Chat

### Context Injection

When user mentions or references integrated content:

```typescript
// In ChatWindow.tsx or message processing

async function processMessageWithIntegrations(
  message: string,
  integrations: Integration[]
): Promise<EnrichedMessage> {
  const enrichedContent: string[] = [message];

  // Detect Notion page references (e.g., "@notion:page-id" or URLs)
  const notionRefs = extractNotionReferences(message);

  if (notionRefs.length > 0 && hasIntegration('notion')) {
    const notionApi = new NotionAPI(getAccessToken('notion'));

    for (const ref of notionRefs) {
      const content = await notionApi.getPageContent(ref.pageId);
      enrichedContent.push(`\n---\nNotion Page: ${ref.title}\n${content}\n---`);
    }
  }

  return {
    originalMessage: message,
    enrichedMessage: enrichedContent.join('\n'),
    sources: notionRefs.map(r => ({ type: 'notion', ...r })),
  };
}
```

### Slash Commands for Integrations

```typescript
// Built-in integration commands

const INTEGRATION_COMMANDS: Skill[] = [
  {
    id: 'notion-search',
    name: '/notion',
    description: 'Search Notion pages',
    prompt: 'Search Notion for: {{query}}',
    enabled: true,
    builtin: true,
  },
  {
    id: 'notion-import',
    name: '/import-notion',
    description: 'Import a Notion page as context',
    prompt: 'Import Notion page: {{url}}',
    enabled: true,
    builtin: true,
  },
];
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

- [ ] Create integration types and interfaces (`types/integration.ts`)
- [ ] Implement IntegrationManager class
- [ ] Set up Tauri secure storage for tokens
- [ ] Create base UI for Integrations settings tab
- [ ] Implement deep link handler for OAuth callbacks (`flowq://oauth/*`)

### Phase 2: Notion Integration (Week 3-4)

- [ ] Implement Notion OAuth flow
- [ ] Create NotionAPI client class
- [ ] Build Notion search functionality
- [ ] Implement page content fetching
- [ ] Create NotionIntegration UI component
- [ ] Add Notion reference detection in messages
- [ ] Test end-to-end flow

### Phase 3: GitHub Integration (Week 5-6)

- [ ] Implement GitHub OAuth flow
- [ ] Create GitHubAPI client class
- [ ] Build repository browser
- [ ] Implement issue/PR fetching
- [ ] Create GitHubIntegration UI component
- [ ] Add GitHub reference detection

### Phase 4: Google Drive Integration (Week 7-8)

- [ ] Implement Google OAuth flow
- [ ] Create GoogleDriveAPI client class
- [ ] Build file browser
- [ ] Implement document content extraction
- [ ] Create GoogleDriveIntegration UI component

### Phase 5: Local Note Apps (Week 9-10)

- [ ] Implement Obsidian vault integration
  - [ ] Vault folder selection UI
  - [ ] Markdown + frontmatter parser
  - [ ] Full-text search with tags/links
  - [ ] File watcher for live updates
- [ ] Implement Craft integration
  - [ ] URL scheme handlers (open, create)
  - [ ] Explore SQLite database access
- [ ] Add `/obsidian` and `/daily` slash commands
- [ ] Create ObsidianIntegration and CraftIntegration UI components

### Phase 6: RSS Integration (Week 11-12)

- [ ] Implement RSS feed fetching (Rust backend)
  - [ ] HTTP client with caching headers (ETag, Last-Modified)
  - [ ] RSS 2.0 and Atom format parsing
  - [ ] Error handling and retry logic
- [ ] Create SQLite storage for feeds and articles
  - [ ] Full-text search with FTS5
  - [ ] Retention management (cleanup old articles)
- [ ] Build RSS management UI
  - [ ] Feed list with unread counts
  - [ ] Add feed by URL
  - [ ] Category organization
  - [ ] Feed settings (refresh interval, retention)
- [ ] Implement slash commands
  - [ ] `/news` - Recent articles summary
  - [ ] `/rss` - Search articles
  - [ ] `/digest` - Daily digest
  - [ ] `/topic` - Topic deep dive
- [ ] Add @rss mention support for chat context
- [ ] Background sync with configurable interval
- [ ] OPML import/export for feed migration

### Phase 7: Polish & More Integrations (Ongoing)

- [ ] Add Linear integration
- [ ] Add Slack integration
- [ ] Add Logseq integration (similar to Obsidian)
- [ ] Add Bear integration
- [ ] Improve search across all integrations
- [ ] Add integration status indicators in sidebar
- [ ] Create unified "Sources" browser
- [ ] Add Hacker News API integration
- [ ] Add Reddit API integration

---

## Security Considerations

### Token Storage

```rust
// src-tauri/src/secure_storage.rs

use keyring::Entry;

pub fn store_token(service: &str, token: &str) -> Result<(), Error> {
    let entry = Entry::new("flowq", service)?;
    entry.set_password(token)?;
    Ok(())
}

pub fn get_token(service: &str) -> Result<String, Error> {
    let entry = Entry::new("flowq", service)?;
    entry.get_password()
}

pub fn delete_token(service: &str) -> Result<(), Error> {
    let entry = Entry::new("flowq", service)?;
    entry.delete_password()
}
```

### Best Practices

1. **Never store tokens in localStorage** - Use Tauri's secure storage (keyring)
2. **Request minimal scopes** - Only ask for permissions actually needed
3. **Implement token refresh** - Handle expired tokens gracefully
4. **Allow revocation** - Users should be able to disconnect any integration
5. **Show data access** - Be transparent about what data is accessed
6. **Local processing** - Process integration data locally when possible

---

## File Structure

```
lib/
├── integrations/
│   ├── manager.ts          # Central integration registry
│   ├── types.ts            # Integration interfaces
│   │
│   ├── cloud/              # Cloud-based integrations (OAuth)
│   │   ├── notion/
│   │   │   ├── auth.ts     # OAuth flow
│   │   │   ├── api.ts      # API client
│   │   │   └── transform.ts
│   │   ├── github/
│   │   │   ├── auth.ts
│   │   │   ├── api.ts
│   │   │   └── transform.ts
│   │   └── google-drive/
│   │       ├── auth.ts
│   │       ├── api.ts
│   │       └── transform.ts
│   │
│   ├── local/              # Local app integrations (filesystem)
│   │   ├── obsidian/
│   │   │   ├── vault.ts    # Vault reader
│   │   │   ├── parser.ts   # Markdown + frontmatter
│   │   │   └── search.ts   # Full-text search
│   │   ├── craft/
│   │   │   ├── urlscheme.ts  # URL scheme handler
│   │   │   └── database.ts   # SQLite reader (if possible)
│   │   ├── logseq/
│   │   │   └── index.ts
│   │   └── bear/
│   │       └── index.ts
│   │
│   └── feeds/              # Information source integrations
│       ├── rss/
│       │   ├── manager.ts    # Feed management
│       │   ├── parser.ts     # RSS/Atom parsing
│       │   ├── storage.ts    # SQLite storage
│       │   └── sync.ts       # Background sync
│       ├── hackernews/
│       │   └── api.ts
│       └── reddit/
│           └── api.ts

components/
├── integrations/
│   ├── IntegrationCard.tsx       # Generic integration card
│   ├── CloudIntegrations/
│   │   ├── NotionIntegration.tsx
│   │   ├── GitHubIntegration.tsx
│   │   └── GoogleDriveIntegration.tsx
│   ├── LocalApps/
│   │   ├── ObsidianIntegration.tsx
│   │   ├── CraftIntegration.tsx
│   │   └── LocalAppPicker.tsx    # Folder/vault selector
│   └── Feeds/
│       ├── RSSIntegration.tsx    # RSS feed management
│       ├── FeedManager.tsx       # Full feed manager modal
│       ├── ArticleList.tsx       # Article list view
│       └── FeedSuggestions.tsx   # Suggested feeds by category

types/
├── integrations/
│   ├── base.ts             # Base integration interface
│   ├── cloud/
│   │   ├── notion.ts
│   │   ├── github.ts
│   │   └── google-drive.ts
│   ├── local/
│   │   ├── obsidian.ts
│   │   ├── craft.ts
│   │   └── common.ts       # Shared local app types
│   └── feeds/
│       ├── rss.ts          # RSS types
│       └── common.ts       # Shared feed types

src-tauri/src/
├── rss.rs                  # RSS fetch command
└── rss_db.rs               # RSS SQLite storage
```

---

## Summary

This integration plan provides a scalable foundation for connecting FlowQ to both cloud services and local applications while maintaining security and privacy.

### Integration Categories

| Category | Examples | Access Method | Privacy Level |
|----------|----------|---------------|---------------|
| **Cloud APIs** | Notion, GitHub, Google Drive | OAuth 2.0 | Token-based, user consent |
| **Local Note Apps** | Obsidian, Craft, Logseq | Filesystem | 100% local, no network |
| **Local Folders** | Workspace files | Direct read | 100% local |
| **Information Feeds** | RSS, Hacker News, Reddit | HTTP fetch + local cache | Fetch-only, local storage |

### Key Principles

- **Local-first**: Process data locally, don't sync to cloud
- **Privacy-focused**: Minimal scopes, secure token storage
- **User control**: Easy connect/disconnect, transparent data access
- **Extensible**: Plugin architecture for future integrations
- **Hybrid approach**: Support both cloud APIs and local apps seamlessly

### Why Local Note Apps Matter

For FlowQ's "local AI workspace" vision, local note apps like Obsidian are ideal because:

1. **Zero network dependency** - Works completely offline
2. **No authentication needed** - Just point to a folder
3. **User owns the data** - Plain markdown files
4. **Fast access** - No API latency
5. **Privacy by design** - Data never leaves the machine

### Why RSS Matters

RSS is an excellent fit for FlowQ's information-gathering capabilities:

1. **Decentralized** - No single provider, no lock-in
2. **No authentication** - Just URLs, no OAuth complexity
3. **Standard format** - Well-defined, easy to parse
4. **Local caching** - Fetch once, query locally
5. **AI-friendly** - Structured content perfect for summarization
6. **Broad coverage** - News, blogs, podcasts, newsletters, YouTube

### Recommended Implementation Order

1. **Obsidian** - Best ROI: large user base, simple implementation
2. **RSS Feeds** - No OAuth, immediate value for information gathering
3. **Notion** - Popular cloud PKM, establishes OAuth patterns
4. **GitHub** - Developer audience, code context
5. **Craft** - macOS users, demonstrates URL scheme integration
6. **Others** - Based on user demand
