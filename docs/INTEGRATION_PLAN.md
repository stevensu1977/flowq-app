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

### Phase 6: Polish & More Integrations (Ongoing)

- [ ] Add Linear integration
- [ ] Add Slack integration
- [ ] Add Logseq integration (similar to Obsidian)
- [ ] Add Bear integration
- [ ] Improve search across all integrations
- [ ] Add integration status indicators in sidebar
- [ ] Create unified "Sources" browser

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
│   └── local/              # Local app integrations (filesystem)
│       ├── obsidian/
│       │   ├── vault.ts    # Vault reader
│       │   ├── parser.ts   # Markdown + frontmatter
│       │   └── search.ts   # Full-text search
│       ├── craft/
│       │   ├── urlscheme.ts  # URL scheme handler
│       │   └── database.ts   # SQLite reader (if possible)
│       ├── logseq/
│       │   └── index.ts
│       └── bear/
│           └── index.ts

components/
├── integrations/
│   ├── IntegrationCard.tsx       # Generic integration card
│   ├── CloudIntegrations/
│   │   ├── NotionIntegration.tsx
│   │   ├── GitHubIntegration.tsx
│   │   └── GoogleDriveIntegration.tsx
│   └── LocalApps/
│       ├── ObsidianIntegration.tsx
│       ├── CraftIntegration.tsx
│       └── LocalAppPicker.tsx    # Folder/vault selector

types/
├── integrations/
│   ├── base.ts             # Base integration interface
│   ├── cloud/
│   │   ├── notion.ts
│   │   ├── github.ts
│   │   └── google-drive.ts
│   └── local/
│       ├── obsidian.ts
│       ├── craft.ts
│       └── common.ts       # Shared local app types
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

### Recommended Implementation Order

1. **Obsidian** - Best ROI: large user base, simple implementation
2. **Notion** - Popular cloud PKM, establishes OAuth patterns
3. **GitHub** - Developer audience, code context
4. **Craft** - macOS users, demonstrates URL scheme integration
5. **Others** - Based on user demand
