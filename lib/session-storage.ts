/**
 * Session Storage - JSONL-based file storage
 *
 * Storage structure:
 * {workspace}/.flowq/sessions/{sessionId}/session.jsonl
 *
 * JSONL format:
 * - Line 1: SessionHeader (metadata + pre-computed fields)
 * - Lines 2+: StoredMessage (one per line)
 */

import { invoke } from '@tauri-apps/api/core';
import { ChatSession, ChatMessage, SessionStatus } from '../types';

// ============ Types ============

export interface SessionHeader {
  id: string;
  workspacePath: string | null;
  title: string;
  createdAt: number;  // Unix timestamp ms
  updatedAt: number;
  isFlagged?: boolean;
  status?: SessionStatus;
  hasUnread?: boolean;
  messageCount: number;
  lastMessageRole?: 'user' | 'agent';
  preview?: string;  // First user message preview
  labels?: string[];  // Session labels/tags
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;  // Unix timestamp ms
  steps?: Array<{
    id: string;
    label: string;
    status: 'pending' | 'thinking' | 'completed' | 'error';
    details?: string;
  }>;
}

// ============ Path Helpers ============

const CRAFT_AGENT_DIR = '.flowq';
const SESSIONS_DIR = 'sessions';
const SESSION_FILE = 'session.jsonl';

/**
 * Get the sessions directory path for a workspace
 */
export function getSessionsDir(workspacePath: string | null): string {
  if (workspacePath) {
    return `${workspacePath}/${CRAFT_AGENT_DIR}/${SESSIONS_DIR}`;
  }
  // For sessions without workspace, use home directory
  return `~/${CRAFT_AGENT_DIR}/${SESSIONS_DIR}`;
}

/**
 * Get the session directory path
 */
export function getSessionDir(workspacePath: string | null, sessionId: string): string {
  return `${getSessionsDir(workspacePath)}/${sessionId}`;
}

/**
 * Get the session.jsonl file path
 */
export function getSessionFilePath(workspacePath: string | null, sessionId: string): string {
  return `${getSessionDir(workspacePath, sessionId)}/${SESSION_FILE}`;
}

// ============ File System Helpers (via Tauri) ============

async function ensureDir(path: string): Promise<void> {
  try {
    await invoke<void>('create_dir', { path });
  } catch {
    // Directory might already exist
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  await invoke<void>('save_file', { path, content });
}

async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await invoke<string[]>('list_dir', { path });
  } catch {
    return [];
  }
}

async function removeDir(path: string): Promise<void> {
  await invoke<void>('remove_dir', { path });
}

async function getHomeDir(): Promise<string> {
  return invoke<string>('get_home_dir');
}

/**
 * Expand ~ to home directory
 */
async function expandPath(path: string): Promise<string> {
  if (path.startsWith('~/')) {
    const home = await getHomeDir();
    return home + path.slice(1);
  }
  return path;
}

// ============ JSONL Helpers ============

function toJsonLine(obj: unknown): string {
  return JSON.stringify(obj);
}

function parseJsonLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    console.warn('Failed to parse JSONL line:', line);
    return null;
  }
}

// ============ Conversion Helpers ============

function chatSessionToHeader(session: ChatSession): SessionHeader {
  const lastMessage = session.messages[session.messages.length - 1];
  const firstUserMessage = session.messages.find(m => m.role === 'user');

  return {
    id: session.id,
    workspacePath: session.workspacePath || null,
    title: session.title,
    createdAt: session.updatedAt.getTime(), // We don't have createdAt in ChatSession
    updatedAt: session.updatedAt.getTime(),
    isFlagged: session.isFlagged,
    status: session.status,
    hasUnread: session.hasUnread,
    messageCount: session.messages.length,
    lastMessageRole: lastMessage?.role,
    preview: firstUserMessage?.content.slice(0, 100),
    labels: session.labels,
  };
}

function chatMessageToStored(msg: ChatMessage): StoredMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp.getTime(),
    steps: msg.steps,
  };
}

function storedToMessage(stored: StoredMessage): ChatMessage {
  return {
    id: stored.id,
    role: stored.role,
    content: stored.content,
    timestamp: new Date(stored.timestamp),
    steps: stored.steps,
  };
}

function headerToSession(header: SessionHeader, messages: ChatMessage[] = []): ChatSession {
  return {
    id: header.id,
    title: header.title,
    messages,
    updatedAt: new Date(header.updatedAt),
    workspacePath: header.workspacePath || undefined,
    isFlagged: header.isFlagged,
    status: header.status,
    hasUnread: header.hasUnread,
    labels: header.labels,
  };
}

// ============ Session Storage API ============

/**
 * Create a new session
 */
export async function createSession(
  workspacePath: string | null,
  title: string
): Promise<ChatSession> {
  const id = crypto.randomUUID();
  const now = Date.now();

  const header: SessionHeader = {
    id,
    workspacePath,
    title,
    createdAt: now,
    updatedAt: now,
    isFlagged: false,
    status: 'todo',
    hasUnread: false,
    messageCount: 0,
  };

  // Create directory
  const sessionsDir = getSessionsDir(workspacePath);
  const expandedSessionsDir = await expandPath(sessionsDir);
  await ensureDir(expandedSessionsDir);

  const sessionDir = getSessionDir(workspacePath, id);
  const expandedSessionDir = await expandPath(sessionDir);
  await ensureDir(expandedSessionDir);

  // Write JSONL file with just header
  const filePath = getSessionFilePath(workspacePath, id);
  const expandedFilePath = await expandPath(filePath);
  await writeFile(expandedFilePath, toJsonLine(header) + '\n');

  return headerToSession(header);
}

/**
 * Load a session (header + messages)
 */
export async function loadSession(
  workspacePath: string | null,
  sessionId: string
): Promise<ChatSession | null> {
  const filePath = getSessionFilePath(workspacePath, sessionId);
  const expandedFilePath = await expandPath(filePath);

  if (!await fileExists(expandedFilePath)) {
    return null;
  }

  const content = await readFile(expandedFilePath);
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    return null;
  }

  // First line is header
  const header = parseJsonLine<SessionHeader>(lines[0]);
  if (!header) {
    return null;
  }

  // Rest are messages
  const messages: ChatMessage[] = [];
  for (let i = 1; i < lines.length; i++) {
    const stored = parseJsonLine<StoredMessage>(lines[i]);
    if (stored) {
      messages.push(storedToMessage(stored));
    }
  }

  return headerToSession(header, messages);
}

/**
 * Load only session header (for fast list loading)
 */
export async function loadSessionHeader(
  workspacePath: string | null,
  sessionId: string
): Promise<SessionHeader | null> {
  const filePath = getSessionFilePath(workspacePath, sessionId);
  const expandedFilePath = await expandPath(filePath);

  if (!await fileExists(expandedFilePath)) {
    return null;
  }

  const content = await readFile(expandedFilePath);
  const firstLine = content.split('\n')[0];

  if (!firstLine) {
    return null;
  }

  return parseJsonLine<SessionHeader>(firstLine);
}

/**
 * Save a session (full rewrite)
 */
export async function saveSession(session: ChatSession): Promise<void> {
  const header = chatSessionToHeader(session);

  // Build JSONL content
  const lines: string[] = [toJsonLine(header)];
  for (const msg of session.messages) {
    lines.push(toJsonLine(chatMessageToStored(msg)));
  }

  // Ensure directory exists
  const sessionDir = getSessionDir(session.workspacePath || null, session.id);
  const expandedSessionDir = await expandPath(sessionDir);
  await ensureDir(expandedSessionDir);

  // Write file
  const filePath = getSessionFilePath(session.workspacePath || null, session.id);
  const expandedFilePath = await expandPath(filePath);
  await writeFile(expandedFilePath, lines.join('\n') + '\n');
}

/**
 * Append a message to session (incremental update)
 */
export async function appendMessage(
  workspacePath: string | null,
  sessionId: string,
  message: ChatMessage
): Promise<void> {
  const filePath = getSessionFilePath(workspacePath, sessionId);
  const expandedFilePath = await expandPath(filePath);

  // Read existing content
  let content = '';
  if (await fileExists(expandedFilePath)) {
    content = await readFile(expandedFilePath);
  }

  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    // No header, can't append
    console.error('Cannot append to session without header');
    return;
  }

  // Update header
  const header = parseJsonLine<SessionHeader>(lines[0]);
  if (header) {
    header.updatedAt = Date.now();
    header.messageCount = lines.length; // Current messages + new one
    header.lastMessageRole = message.role;
    if (!header.preview && message.role === 'user') {
      header.preview = message.content.slice(0, 100);
    }
    lines[0] = toJsonLine(header);
  }

  // Append message
  lines.push(toJsonLine(chatMessageToStored(message)));

  // Write back
  await writeFile(expandedFilePath, lines.join('\n') + '\n');
}

/**
 * Update session header (metadata only, preserves messages)
 */
export async function updateSessionHeader(
  workspacePath: string | null,
  sessionId: string,
  updates: Partial<SessionHeader>
): Promise<void> {
  const filePath = getSessionFilePath(workspacePath, sessionId);
  const expandedFilePath = await expandPath(filePath);

  if (!await fileExists(expandedFilePath)) {
    return;
  }

  const content = await readFile(expandedFilePath);
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    return;
  }

  // Update header
  const header = parseJsonLine<SessionHeader>(lines[0]);
  if (header) {
    Object.assign(header, updates, { updatedAt: Date.now() });
    lines[0] = toJsonLine(header);
    await writeFile(expandedFilePath, lines.join('\n') + '\n');
  }
}

/**
 * Delete a session
 */
export async function deleteSession(
  workspacePath: string | null,
  sessionId: string
): Promise<void> {
  const sessionDir = getSessionDir(workspacePath, sessionId);
  const expandedSessionDir = await expandPath(sessionDir);

  try {
    await removeDir(expandedSessionDir);
  } catch (e) {
    console.error('Failed to delete session:', e);
  }
}

/**
 * List all sessions for a workspace (fast, header-only)
 */
export async function listSessions(
  workspacePath: string | null
): Promise<ChatSession[]> {
  const sessionsDir = getSessionsDir(workspacePath);
  const expandedSessionsDir = await expandPath(sessionsDir);

  // Ensure directory exists
  await ensureDir(expandedSessionsDir);

  const sessionIds = await listDir(expandedSessionsDir);
  const sessions: ChatSession[] = [];

  for (const sessionId of sessionIds) {
    // Skip hidden files
    if (sessionId.startsWith('.')) continue;

    const header = await loadSessionHeader(workspacePath, sessionId);
    if (header) {
      sessions.push(headerToSession(header));
    }
  }

  // Sort by updatedAt descending
  sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return sessions;
}

/**
 * Load messages for a session (lazy load)
 */
export async function loadSessionMessages(
  workspacePath: string | null,
  sessionId: string
): Promise<ChatMessage[]> {
  const session = await loadSession(workspacePath, sessionId);
  return session?.messages || [];
}
