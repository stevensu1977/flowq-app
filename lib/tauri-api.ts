/**
 * Tauri API Adapter
 *
 * Provides a unified API for the frontend to interact with Tauri backend.
 * Uses native Rust Claude Agent SDK - no sidecar needed.
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { open as openShell } from '@tauri-apps/plugin-shell'

// ============ Types ============

export interface Session {
  id: string
  title: string
  created_at: string
  updated_at: string
  is_processing: boolean
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface SessionEvent {
  event_type: 'text_delta' | 'complete' | 'error'
  session_id: string
  data: Record<string, unknown>
}

// ============ Session API (via Rust) ============

export async function getSessions(): Promise<Session[]> {
  return invoke<Session[]>('get_sessions')
}

export async function createSession(title?: string): Promise<Session> {
  return invoke<Session>('create_session', { title })
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  return invoke<boolean>('delete_session', { sessionId })
}

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  return invoke<Message[]>('get_session_messages', { sessionId })
}

// Convert ApiSettings to Rust format (snake_case)
function apiSettingsToRust(settings: ApiSettings | undefined) {
  if (!settings) return undefined
  return {
    provider: settings.provider,
    anthropic_api_key: settings.anthropicApiKey,
    anthropic_base_url: settings.anthropicBaseUrl,
    anthropic_model: settings.anthropicModel,
    bedrock_region: settings.bedrockRegion,
    bedrock_auth_method: settings.bedrockAuthMethod,
    bedrock_profile: settings.bedrockProfile,
    bedrock_access_key_id: settings.bedrockAccessKeyId,
    bedrock_secret_access_key: settings.bedrockSecretAccessKey,
    bedrock_model: settings.bedrockModel,
  }
}

export async function sendMessage(
  sessionId: string,
  content: string,
  systemPrompt?: string,
  apiSettings?: ApiSettings
): Promise<string> {
  return invoke<string>('send_message', {
    sessionId,
    content,
    systemPrompt,
    apiSettings: apiSettingsToRust(apiSettings),
  })
}

// Event subscription for streaming responses
export function onSessionEvent(callback: (event: SessionEvent) => void): Promise<UnlistenFn> {
  return listen<SessionEvent>('session-event', (e) => callback(e.payload));
}

// ============ File System API (via Rust) ============

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path })
}

export async function saveFile(path: string, content: string): Promise<void> {
  return invoke<void>('save_file', { path, content })
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path })
}

export async function listDir(path: string): Promise<string[]> {
  return invoke<string[]>('list_dir', { path })
}

export async function createDir(path: string): Promise<void> {
  return invoke<void>('create_dir', { path })
}

export async function removeFile(path: string): Promise<void> {
  return invoke<void>('remove_file', { path })
}

export async function removeDir(path: string): Promise<void> {
  return invoke<void>('remove_dir', { path })
}

// ============ System API (via Rust) ============

export async function getHomeDir(): Promise<string> {
  return invoke<string>('get_home_dir')
}

export async function getDataDir(): Promise<string> {
  return invoke<string>('get_data_dir')
}

export async function getConfigDir(): Promise<string> {
  return invoke<string>('get_config_dir')
}

// ============ Dialog API (via Plugin) ============

export async function openFileDialog(options?: {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  multiple?: boolean
}): Promise<string | string[] | null> {
  return openDialog({
    title: options?.title,
    filters: options?.filters,
    multiple: options?.multiple,
  })
}

export async function openDirectoryDialog(options?: {
  title?: string
  defaultPath?: string
}): Promise<string | null> {
  return openDialog({
    title: options?.title || '选择工作目录',
    defaultPath: options?.defaultPath,
    directory: true,
    multiple: false,
  }) as Promise<string | null>
}

export async function saveFileDialog(options?: {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}): Promise<string | null> {
  return saveDialog({
    title: options?.title,
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  })
}

// ============ Shell API (via Plugin) ============

export async function openUrl(url: string): Promise<void> {
  await openShell(url)
}

export async function openPath(path: string): Promise<void> {
  await openShell(path)
}

/** Open a directory in the system file manager */
export async function openDirectory(path: string): Promise<void> {
  return invoke<void>('open_directory', { path })
}

// ============ Mention APIs (@file, @url) ============

/** File search result for @file mention */
export interface WorkspaceFile {
  name: string
  path: string
  relative_path: string
  is_dir: boolean
  size?: number
}

/** Search files in workspace directory */
export async function searchWorkspaceFiles(
  workspace: string,
  query: string,
  maxResults?: number
): Promise<WorkspaceFile[]> {
  return invoke<WorkspaceFile[]>('search_workspace_files', {
    workspace,
    query,
    max_results: maxResults,
  })
}

/** Read file content for @file mention injection */
export async function readFileForMention(
  path: string,
  maxLines?: number
): Promise<string> {
  return invoke<string>('read_file_for_mention', {
    path,
    max_lines: maxLines,
  })
}

/** Fetch URL content for @url mention */
export async function fetchUrlForMention(url: string): Promise<string> {
  return invoke<string>('fetch_url_for_mention', { url })
}

// ============ Event API (via Tauri) ============

export { listen, emit }

// ============ Workspace Backend API ============

export async function setWorkspaceBackend(path: string): Promise<void> {
  return invoke<void>('set_workspace', { path })
}

export async function getWorkspaceBackend(): Promise<string | null> {
  return invoke<string | null>('get_workspace')
}

// ============ Workspace API ============

export interface Workspace {
  path: string
  name: string
  lastUsed: string
}

const WORKSPACE_STORAGE_KEY = 'workspaces'
const CURRENT_WORKSPACE_KEY = 'current_workspace'

export async function getWorkspaces(): Promise<Workspace[]> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true })
    const workspaces = await store.get<Workspace[]>(WORKSPACE_STORAGE_KEY)
    return workspaces || []
  } catch (e) {
    console.error('Failed to get workspaces:', e)
    return []
  }
}

export async function saveWorkspaces(workspaces: Workspace[]): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true })
    await store.set(WORKSPACE_STORAGE_KEY, workspaces)
    await store.save()
  } catch (e) {
    console.error('Failed to save workspaces:', e)
  }
}

export async function getCurrentWorkspace(): Promise<string | null> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true })
    return await store.get<string>(CURRENT_WORKSPACE_KEY)
  } catch (e) {
    console.error('Failed to get current workspace:', e)
    return null
  }
}

export async function setCurrentWorkspace(path: string): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true })
    await store.set(CURRENT_WORKSPACE_KEY, path)
    await store.save()
  } catch (e) {
    console.error('Failed to set current workspace:', e)
  }
}

export async function addWorkspace(path: string): Promise<Workspace> {
  const name = path.split('/').pop() || path
  const workspace: Workspace = {
    path,
    name,
    lastUsed: new Date().toISOString(),
  }

  const workspaces = await getWorkspaces()
  // Remove if already exists, then add to front
  const filtered = workspaces.filter(w => w.path !== path)
  const updated = [workspace, ...filtered].slice(0, 10) // Keep max 10 workspaces
  await saveWorkspaces(updated)
  await setCurrentWorkspace(path)

  return workspace
}

export async function removeWorkspace(path: string): Promise<void> {
  const workspaces = await getWorkspaces()
  const filtered = workspaces.filter(w => w.path !== path)
  await saveWorkspaces(filtered)

  // If removing current workspace, clear it
  const current = await getCurrentWorkspace()
  if (current === path) {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true })
    await store.delete(CURRENT_WORKSPACE_KEY)
    await store.save()
  }
}

// ============ Session Storage API ============

import type { ChatSession } from '../types'

const SESSIONS_STORAGE_KEY = 'chat_sessions'

// 序列化 session 以存储（Date 转换为 string）
interface StoredChatSession {
  id: string
  title: string
  messages: Array<{
    id: string
    role: 'user' | 'agent'
    content: string
    timestamp: string
    steps?: Array<{
      id: string
      label: string
      status: 'pending' | 'thinking' | 'completed' | 'error'
      details?: string
    }>
  }>
  updatedAt: string
  workspacePath?: string
}

export async function getAllSessions(): Promise<ChatSession[]> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('sessions.json', { autoSave: true })
    const sessions = await store.get<StoredChatSession[]>(SESSIONS_STORAGE_KEY)
    if (!sessions) return []

    // Convert string dates back to Date objects
    return sessions.map(s => ({
      ...s,
      updatedAt: new Date(s.updatedAt),
      messages: s.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }))
    }))
  } catch (e) {
    console.error('Failed to get sessions:', e)
    return []
  }
}

export async function saveSessions(sessions: ChatSession[]): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('sessions.json', { autoSave: true })

    // Convert Date objects to strings for storage
    const storedSessions: StoredChatSession[] = sessions.map(s => ({
      ...s,
      updatedAt: s.updatedAt.toISOString(),
      messages: s.messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString()
      }))
    }))

    await store.set(SESSIONS_STORAGE_KEY, storedSessions)
    await store.save()
  } catch (e) {
    console.error('Failed to save sessions:', e)
  }
}

export async function getSessionsForWorkspace(workspacePath: string | null): Promise<ChatSession[]> {
  const allSessions = await getAllSessions()
  if (!workspacePath) {
    // 返回没有 workspace 关联的 sessions
    return allSessions.filter(s => !s.workspacePath)
  }
  return allSessions.filter(s => s.workspacePath === workspacePath)
}

// ============ SQLite Database API ============

export interface DbSession {
  id: string
  workspace_path: string | null
  title: string
  created_at: string
  updated_at: string
  summary: string | null
  is_flagged: boolean | null
  status: string | null  // 'todo' | 'in-progress' | 'needs-review' | 'done' | 'cancelled'
  has_unread: boolean | null
}

export interface DbMessage {
  id: string
  session_id: string
  role: string  // 'user' | 'assistant'
  content: string
  timestamp: string
  metadata: string | null  // JSON string for tool_calls, steps, cost, etc.
}

export interface DbSessionWithMessages {
  session: DbSession
  messages: DbMessage[]
}

// Session CRUD
export async function dbCreateSession(
  workspacePath: string | null,
  title: string
): Promise<DbSession> {
  return invoke<DbSession>('db_create_session', { workspacePath, title })
}

export async function dbGetSessions(workspacePath: string | null): Promise<DbSession[]> {
  return invoke<DbSession[]>('db_get_sessions', { workspacePath })
}

export async function dbGetSession(sessionId: string): Promise<DbSession | null> {
  return invoke<DbSession | null>('db_get_session', { sessionId })
}

export async function dbUpdateSession(session: DbSession): Promise<void> {
  return invoke<void>('db_update_session', { session })
}

export async function dbDeleteSession(sessionId: string): Promise<void> {
  return invoke<void>('db_delete_session', { sessionId })
}

// Message CRUD
export async function dbAppendMessage(message: DbMessage): Promise<void> {
  return invoke<void>('db_append_message', { message })
}

export async function dbGetMessages(sessionId: string): Promise<DbMessage[]> {
  return invoke<DbMessage[]>('db_get_messages', { sessionId })
}

export async function dbGetRecentMessages(sessionId: string, limit: number): Promise<DbMessage[]> {
  return invoke<DbMessage[]>('db_get_recent_messages', { sessionId, limit })
}

export async function dbUpdateMessageMetadata(messageId: string, metadata: string): Promise<void> {
  return invoke<void>('db_update_message_metadata', { messageId, metadata })
}

// Combined queries
export async function dbGetSessionWithMessages(sessionId: string): Promise<DbSessionWithMessages | null> {
  return invoke<DbSessionWithMessages | null>('db_get_session_with_messages', { sessionId })
}

// Session Flag/Status operations
export async function dbUpdateSessionFlag(sessionId: string, isFlagged: boolean): Promise<void> {
  return invoke<void>('db_update_session_flag', { sessionId, isFlagged })
}

export async function dbUpdateSessionStatus(sessionId: string, status: string): Promise<void> {
  return invoke<void>('db_update_session_status', { sessionId, status })
}

export async function dbUpdateSessionUnread(sessionId: string, hasUnread: boolean): Promise<void> {
  return invoke<void>('db_update_session_unread', { sessionId, hasUnread })
}

export async function dbGetFlaggedSessions(workspacePath: string | null): Promise<DbSession[]> {
  return invoke<DbSession[]>('db_get_flagged_sessions', { workspacePath })
}

export async function dbGetSessionsByStatus(workspacePath: string | null, status: string): Promise<DbSession[]> {
  return invoke<DbSession[]>('db_get_sessions_by_status', { workspacePath, status })
}

// ============ MCP Server API ============

export interface McpServerInfo {
  name: string
  transport: string  // "stdio" | "http"
  disabled?: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface AddMcpServerRequest {
  name: string
  transport: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

/**
 * List all configured MCP servers from ~/.claude.json
 */
export async function mcpListServers(): Promise<McpServerInfo[]> {
  return invoke<McpServerInfo[]>('mcp_list_servers')
}

/**
 * Add a new MCP server configuration
 */
export async function mcpAddServer(config: AddMcpServerRequest): Promise<void> {
  return invoke<void>('mcp_add_server', { config })
}

/**
 * Remove an MCP server by name
 */
export async function mcpRemoveServer(name: string): Promise<void> {
  return invoke<void>('mcp_remove_server', { name })
}

/**
 * Toggle MCP server enabled/disabled state
 */
export async function mcpToggleServer(name: string, disabled: boolean): Promise<void> {
  return invoke<void>('mcp_toggle_server', { name, disabled })
}

/**
 * Update an existing MCP server configuration
 */
export async function mcpUpdateServer(name: string, config: AddMcpServerRequest): Promise<void> {
  return invoke<void>('mcp_update_server', { name, config })
}

/**
 * Get a single MCP server by name
 */
export async function mcpGetServer(name: string): Promise<McpServerInfo | null> {
  return invoke<McpServerInfo | null>('mcp_get_server', { name })
}

// ============ Skills API ============

export interface SkillInfo {
  name: string
  path: string
  token_count: number | null
}

export interface SkillMetadata {
  name: string
  description: string | null
  source: string | null
  version: string | null
  author: string | null
  installed_at: string
  updated_at: string
}

export interface SkillFileItem {
  name: string
  path: string
  is_directory: boolean
  size: number | null
}

export interface SearchSkill {
  name: string
  slug: string
  source: string
  installs: number
}

/**
 * List all installed skills
 */
export async function skillList(): Promise<SkillInfo[]> {
  return invoke<SkillInfo[]>('skill_list')
}

/**
 * Get skill content (SKILL.md)
 */
export async function skillGetContent(name: string): Promise<string> {
  return invoke<string>('skill_get_content', { name })
}

/**
 * Get skill metadata
 */
export async function skillGetMetadata(name: string): Promise<SkillMetadata | null> {
  return invoke<SkillMetadata | null>('skill_get_metadata', { name })
}

/**
 * List files in a skill directory
 */
export async function skillListFiles(name: string, subpath?: string): Promise<SkillFileItem[]> {
  return invoke<SkillFileItem[]>('skill_list_files', { name, subpath })
}

/**
 * Read a file from a skill
 */
export async function skillReadFile(name: string, filePath: string): Promise<string> {
  return invoke<string>('skill_read_file', { name, filePath })
}

/**
 * Install skill from content (markdown file)
 */
export async function skillInstallFromContent(content: string, filename: string): Promise<string> {
  return invoke<string>('skill_install_from_content', { content, filename })
}

/**
 * Install skill from URL (GitHub directory or direct file)
 */
export async function skillInstallFromUrl(url: string): Promise<string> {
  return invoke<string>('skill_install_from_url', { url })
}

/**
 * Install skill from ZIP (base64 encoded)
 */
export async function skillInstallFromZip(zipBase64: string, source: string): Promise<string> {
  return invoke<string>('skill_install_from_zip', { zipBase64, source })
}

/**
 * Delete a skill
 */
export async function skillDelete(name: string): Promise<void> {
  return invoke<void>('skill_delete', { name })
}

/**
 * Open skill folder in file manager
 */
export async function skillOpenFolder(name: string): Promise<void> {
  return invoke<void>('skill_open_folder', { name })
}

/**
 * Search skills from skills.sh API
 */
export async function skillSearch(query: string): Promise<SearchSkill[]> {
  return invoke<SearchSkill[]>('skill_search', { query })
}

// ============ Simple Chat API ============

// Content block for multimodal messages
export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface ImageContentBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string  // 'image/png', 'image/jpeg', etc.
    data: string        // base64 encoded image data
  }
}

export type ContentBlock = TextContentBlock | ImageContentBlock

export interface SimpleChatMessage {
  role: string  // 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface ChatApiConfig {
  provider: string  // 'anthropic' | 'bedrock' | 'openai' | 'azure' | 'custom'
  apiKey?: string
  baseUrl?: string
  model?: string
  region?: string  // For bedrock
  awsProfile?: string  // For bedrock
}

export interface SimpleChatRequest {
  messages: SimpleChatMessage[]
  provider: string
  apiKey?: string
  baseUrl?: string
  model?: string
  region?: string
  awsProfile?: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  /** Workspace path for memory context injection */
  workspace?: string
}

export interface ChatApiResponse {
  content: string
  model: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * Send a simple chat message (direct API call without tools)
 * Supports: Anthropic (official + third-party proxy), AWS Bedrock, OpenAI compatible
 */
export async function chatSend(request: SimpleChatRequest): Promise<ChatApiResponse> {
  return invoke<ChatApiResponse>('chat_send', { request })
}

// ============ API Settings Storage ============

export type ApiProvider = 'anthropic' | 'bedrock'

export interface ApiSettings {
  provider: ApiProvider
  // Default model selection (from preset list, only for Anthropic official mode)
  defaultModel?: string
  // Anthropic settings
  anthropicMode?: 'official' | 'custom'  // Official API or custom proxy
  anthropicApiKey?: string
  anthropicBaseUrl?: string
  anthropicModel?: string
  // Bedrock settings
  bedrockRegion?: string
  bedrockAuthMethod?: 'profile' | 'access_key'
  bedrockProfile?: string
  bedrockAccessKeyId?: string
  bedrockSecretAccessKey?: string
  bedrockModel?: string
}

const API_SETTINGS_KEY = 'api_settings'

export const DEFAULT_API_SETTINGS: ApiSettings = {
  provider: 'bedrock',
  defaultModel: 'claude-sonnet-4-5-20250514',
  anthropicMode: 'official',
  bedrockRegion: 'us-east-1',
  bedrockAuthMethod: 'profile',
  bedrockModel: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  anthropicModel: 'claude-sonnet-4-5-20250514',
}

/**
 * Get saved API settings
 */
export async function getApiSettings(): Promise<ApiSettings> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true, defaults: {} })
    const settings = await store.get<ApiSettings>(API_SETTINGS_KEY)
    return settings ? { ...DEFAULT_API_SETTINGS, ...settings } : DEFAULT_API_SETTINGS
  } catch (e) {
    console.error('Failed to get API settings:', e)
    return DEFAULT_API_SETTINGS
  }
}

/**
 * Save API settings
 */
export async function saveApiSettings(settings: ApiSettings): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true, defaults: {} })
    await store.set(API_SETTINGS_KEY, settings)
    await store.save()
  } catch (e) {
    console.error('Failed to save API settings:', e)
  }
}

// ============ Claude Code CLI API ============

export interface ClaudeCodeStatus {
  installed: boolean
  version: string | null
  path: string | null
}

/**
 * Check if Claude Code CLI is installed
 */
export async function checkClaudeCode(): Promise<ClaudeCodeStatus> {
  return invoke<ClaudeCodeStatus>('check_claude_code')
}

/**
 * Install Claude Code CLI using official script
 */
export async function installClaudeCode(): Promise<string> {
  return invoke<string>('install_claude_code')
}

/**
 * Get the install command for manual installation
 */
export async function getClaudeCodeInstallCommand(): Promise<string> {
  return invoke<string>('get_claude_code_install_command')
}

// ============ Environment Check API ============

export interface ToolStatus {
  name: string
  installed: boolean
  version: string | null
  path: string | null
}

export interface EnvironmentStatus {
  node: ToolStatus
  npx: ToolStatus
  uvx: ToolStatus
  uv: ToolStatus
  python: ToolStatus
}

/**
 * Check all MCP-related environment tools
 */
export async function checkEnvironment(): Promise<EnvironmentStatus> {
  return invoke<EnvironmentStatus>('check_environment')
}

/**
 * Check a single tool's status
 */
export async function checkToolStatus(name: string): Promise<ToolStatus> {
  return invoke<ToolStatus>('check_tool_status', { name })
}
