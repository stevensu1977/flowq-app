use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use claude_agent_sdk_rs::{
    query_stream, ClaudeAgentOptions, ContentBlock, Message as ClaudeMessage,
    PermissionMode, McpServers,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

mod browser;
mod chat;
mod db;
mod mcp;
mod memory_index;
mod memory_tool;
mod rss;
mod rss_db;
mod skill;

use chat::{ApiConfig, ChatClient, ChatMessage as SimpleChatMessage, ChatRequest, ChatResponse};
use db::{ChatDatabase, DbSession, DbMessage};
use mcp::{McpManager, McpServerInfo, AddMcpServerRequest};
use skill::{SkillManager, SkillInfo, SkillMetadata, FileItem, SearchSkill};
use memory_index::{MemoryIndex, SearchResult as MemorySearchResult, SyncResult as MemorySyncResult, MemoryStats};
use memory_tool::{MemoryTool, MemoryToolCommand, MemoryToolResult};

// ============ Types ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_processing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String, // "user" | "assistant"
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEvent {
    pub event_type: String, // "text_delta" | "complete" | "error"
    pub session_id: String,
    pub data: serde_json::Value,
}

// ============ State ============

pub struct AppState {
    sessions: Mutex<HashMap<String, Session>>,
    messages: Mutex<HashMap<String, Vec<Message>>>,
    workspace: Mutex<Option<String>>,
    db: Arc<ChatDatabase>,
}

impl AppState {
    pub fn new(db: ChatDatabase) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            messages: Mutex::new(HashMap::new()),
            workspace: Mutex::new(None),
            db: Arc::new(db),
        }
    }
}

// ============ File Commands ============

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    dirs::data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine data directory".to_string())
}

#[tauri::command]
fn get_config_dir() -> Result<String, String> {
    dirs::config_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine config directory".to_string())
}

#[tauri::command]
async fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut files = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            // Only return the file/directory name, not the full path
            if let Some(name) = entry.file_name().to_str() {
                files.push(name.to_string());
            }
        }
    }
    Ok(files)
}

#[tauri::command]
async fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
async fn remove_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| format!("Failed to remove file: {}", e))
}

#[tauri::command]
async fn remove_dir(path: String) -> Result<(), String> {
    fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove directory: {}", e))
}

// ============ Session Commands ============

#[tauri::command]
fn get_sessions(state: State<AppState>) -> Vec<Session> {
    let sessions = state.sessions.lock().unwrap();
    sessions.values().cloned().collect()
}

#[tauri::command]
fn create_session(state: State<AppState>, title: Option<String>) -> Session {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let session = Session {
        id: id.clone(),
        title: title.unwrap_or_else(|| "New Chat".to_string()),
        created_at: now.clone(),
        updated_at: now,
        is_processing: false,
    };

    let mut sessions = state.sessions.lock().unwrap();
    sessions.insert(id.clone(), session.clone());

    let mut messages = state.messages.lock().unwrap();
    messages.insert(id, Vec::new());

    session
}

#[tauri::command]
fn delete_session(state: State<AppState>, session_id: String) -> bool {
    let mut sessions = state.sessions.lock().unwrap();
    let mut messages = state.messages.lock().unwrap();
    sessions.remove(&session_id);
    messages.remove(&session_id);
    true
}

#[tauri::command]
fn get_session_messages(state: State<AppState>, session_id: String) -> Vec<Message> {
    let messages = state.messages.lock().unwrap();
    messages.get(&session_id).cloned().unwrap_or_default()
}

// ============ Workspace Commands ============

#[tauri::command]
fn set_workspace(state: State<AppState>, path: String) -> Result<(), String> {
    // Verify the path exists
    if !PathBuf::from(&path).exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    let mut workspace = state.workspace.lock().unwrap();
    *workspace = Some(path.clone());
    log::info!("Workspace set to: {}", path);
    Ok(())
}

#[tauri::command]
fn get_workspace(state: State<AppState>) -> Option<String> {
    let workspace = state.workspace.lock().unwrap();
    workspace.clone()
}

// ============ Database Commands ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionWithMessages {
    pub session: DbSession,
    pub messages: Vec<DbMessage>,
}

#[tauri::command]
fn db_create_session(
    state: State<AppState>,
    workspace_path: Option<String>,
    title: String,
) -> Result<DbSession, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let session = DbSession {
        id: Uuid::new_v4().to_string(),
        workspace_path,
        title,
        created_at: now.clone(),
        updated_at: now,
        summary: None,
        is_flagged: Some(false),
        status: Some("todo".to_string()),
        has_unread: Some(false),
    };

    state.db.create_session(&session)
        .map_err(|e| format!("Failed to create session: {}", e))?;

    Ok(session)
}

#[tauri::command]
fn db_get_sessions(
    state: State<AppState>,
    workspace_path: Option<String>,
) -> Result<Vec<DbSession>, String> {
    state.db.get_sessions_by_workspace(workspace_path.as_deref())
        .map_err(|e| format!("Failed to get sessions: {}", e))
}

#[tauri::command]
fn db_get_session(
    state: State<AppState>,
    session_id: String,
) -> Result<Option<DbSession>, String> {
    state.db.get_session(&session_id)
        .map_err(|e| format!("Failed to get session: {}", e))
}

#[tauri::command]
fn db_update_session(
    state: State<AppState>,
    session: DbSession,
) -> Result<(), String> {
    state.db.update_session(&session)
        .map_err(|e| format!("Failed to update session: {}", e))
}

#[tauri::command]
fn db_delete_session(
    state: State<AppState>,
    session_id: String,
) -> Result<(), String> {
    state.db.delete_session(&session_id)
        .map_err(|e| format!("Failed to delete session: {}", e))
}

#[tauri::command]
fn db_append_message(
    state: State<AppState>,
    message: DbMessage,
) -> Result<(), String> {
    state.db.append_message(&message)
        .map_err(|e| format!("Failed to append message: {}", e))
}

#[tauri::command]
fn db_get_messages(
    state: State<AppState>,
    session_id: String,
) -> Result<Vec<DbMessage>, String> {
    state.db.get_messages(&session_id)
        .map_err(|e| format!("Failed to get messages: {}", e))
}

#[tauri::command]
fn db_get_recent_messages(
    state: State<AppState>,
    session_id: String,
    limit: u32,
) -> Result<Vec<DbMessage>, String> {
    state.db.get_recent_messages(&session_id, limit)
        .map_err(|e| format!("Failed to get recent messages: {}", e))
}

#[tauri::command]
fn db_update_message_metadata(
    state: State<AppState>,
    message_id: String,
    metadata: String,
) -> Result<(), String> {
    state.db.update_message_metadata(&message_id, &metadata)
        .map_err(|e| format!("Failed to update message metadata: {}", e))
}

#[tauri::command]
fn db_get_session_with_messages(
    state: State<AppState>,
    session_id: String,
) -> Result<Option<SessionWithMessages>, String> {
    let session = state.db.get_session(&session_id)
        .map_err(|e| format!("Failed to get session: {}", e))?;

    if let Some(session) = session {
        let messages = state.db.get_messages(&session_id)
            .map_err(|e| format!("Failed to get messages: {}", e))?;
        Ok(Some(SessionWithMessages { session, messages }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn db_update_session_flag(
    state: State<AppState>,
    session_id: String,
    is_flagged: bool,
) -> Result<(), String> {
    state.db.update_session_flag(&session_id, is_flagged)
        .map_err(|e| format!("Failed to update session flag: {}", e))
}

#[tauri::command]
fn db_update_session_status(
    state: State<AppState>,
    session_id: String,
    status: String,
) -> Result<(), String> {
    state.db.update_session_status(&session_id, &status)
        .map_err(|e| format!("Failed to update session status: {}", e))
}

#[tauri::command]
fn db_update_session_unread(
    state: State<AppState>,
    session_id: String,
    has_unread: bool,
) -> Result<(), String> {
    state.db.update_session_unread(&session_id, has_unread)
        .map_err(|e| format!("Failed to update session unread: {}", e))
}

#[tauri::command]
fn db_get_flagged_sessions(
    state: State<AppState>,
    workspace_path: Option<String>,
) -> Result<Vec<DbSession>, String> {
    state.db.get_flagged_sessions(workspace_path.as_deref())
        .map_err(|e| format!("Failed to get flagged sessions: {}", e))
}

#[tauri::command]
fn db_get_sessions_by_status(
    state: State<AppState>,
    workspace_path: Option<String>,
    status: String,
) -> Result<Vec<DbSession>, String> {
    state.db.get_sessions_by_status(workspace_path.as_deref(), &status)
        .map_err(|e| format!("Failed to get sessions by status: {}", e))
}

// ============ MCP Commands ============

#[tauri::command]
fn mcp_list_servers() -> Result<Vec<McpServerInfo>, String> {
    McpManager::list().map_err(|e| e.to_string())
}

#[tauri::command]
fn mcp_add_server(config: AddMcpServerRequest) -> Result<(), String> {
    McpManager::add(config).map_err(|e| e.to_string())
}

#[tauri::command]
fn mcp_remove_server(name: String) -> Result<(), String> {
    McpManager::remove(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn mcp_toggle_server(name: String, disabled: bool) -> Result<(), String> {
    McpManager::toggle(&name, disabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn mcp_update_server(name: String, config: AddMcpServerRequest) -> Result<(), String> {
    McpManager::update(&name, config).map_err(|e| e.to_string())
}

#[tauri::command]
fn mcp_get_server(name: String) -> Result<Option<McpServerInfo>, String> {
    McpManager::get(&name).map_err(|e| e.to_string())
}

// ============ Skills Commands ============

#[tauri::command]
fn skill_list() -> Result<Vec<SkillInfo>, String> {
    SkillManager::list().map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_get_content(name: String) -> Result<String, String> {
    SkillManager::get_content(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_get_metadata(name: String) -> Result<Option<SkillMetadata>, String> {
    SkillManager::get_metadata(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_list_files(name: String, subpath: Option<String>) -> Result<Vec<FileItem>, String> {
    SkillManager::list_files(&name, subpath.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_read_file(name: String, file_path: String) -> Result<String, String> {
    SkillManager::read_file(&name, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_install_from_content(content: String, filename: String) -> Result<String, String> {
    SkillManager::install_from_content(&content, &filename).map_err(|e| e.to_string())
}

#[tauri::command]
async fn skill_install_from_url(url: String) -> Result<String, String> {
    SkillManager::install_from_url(&url).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_install_from_zip(zip_base64: String, source: String) -> Result<String, String> {
    SkillManager::install_from_zip(&zip_base64, &source).map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_delete(name: String) -> Result<(), String> {
    SkillManager::delete(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn skill_open_folder(name: String) -> Result<(), String> {
    SkillManager::open_folder(&name).map_err(|e| e.to_string())
}

/// Open a directory in the system file manager
#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn skill_search(query: String) -> Result<Vec<SearchSkill>, String> {
    SkillManager::search(&query).await.map_err(|e| e.to_string())
}

// ============ Memory Commands ============

#[tauri::command]
async fn memory_sync(workspace: String) -> Result<MemorySyncResult, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let index = MemoryIndex::open(&workspace_path)
        .map_err(|e| format!("Failed to open memory index: {}", e))?;

    index.sync()
        .map_err(|e| format!("Failed to sync memory: {}", e))
}

#[tauri::command]
async fn memory_search(
    workspace: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<MemorySearchResult>, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let index = MemoryIndex::open(&workspace_path)
        .map_err(|e| format!("Failed to open memory index: {}", e))?;

    let limit = max_results.unwrap_or(10);
    index.search(&query, limit)
        .map_err(|e| format!("Failed to search memory: {}", e))
}

#[tauri::command]
async fn memory_get_context(workspace: String) -> Result<String, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let index = MemoryIndex::open(&workspace_path)
        .map_err(|e| format!("Failed to open memory index: {}", e))?;

    index.get_context()
        .map_err(|e| format!("Failed to get memory context: {}", e))
}

#[tauri::command]
async fn memory_get_stats(workspace: String) -> Result<MemoryStats, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let index = MemoryIndex::open(&workspace_path)
        .map_err(|e| format!("Failed to open memory index: {}", e))?;

    index.get_stats()
        .map_err(|e| format!("Failed to get memory stats: {}", e))
}

// ============ Workspace File Search ============

/// File search result for @file mention
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFile {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

/// Search files in workspace directory
#[tauri::command]
async fn search_workspace_files(
    workspace: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<WorkspaceFile>, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let limit = max_results.unwrap_or(20);
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    // Recursively search files
    fn search_dir(
        dir: &PathBuf,
        base: &PathBuf,
        query: &str,
        results: &mut Vec<WorkspaceFile>,
        limit: usize,
        depth: usize,
    ) {
        if results.len() >= limit || depth > 5 {
            return;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if results.len() >= limit {
                    break;
                }

                let path = entry.path();
                let name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                // Skip hidden files and common ignored directories
                if name.starts_with('.') ||
                   name == "node_modules" ||
                   name == "target" ||
                   name == "dist" ||
                   name == "build" ||
                   name == "__pycache__" {
                    continue;
                }

                let relative_path = path.strip_prefix(base)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();

                // Match against name or path
                if name.to_lowercase().contains(query) ||
                   relative_path.to_lowercase().contains(query) {
                    let metadata = fs::metadata(&path).ok();
                    results.push(WorkspaceFile {
                        name: name.clone(),
                        path: path.to_string_lossy().to_string(),
                        relative_path,
                        is_dir: path.is_dir(),
                        size: metadata.map(|m| m.len()),
                    });
                }

                // Recurse into directories
                if path.is_dir() && results.len() < limit {
                    search_dir(&path, base, query, results, limit, depth + 1);
                }
            }
        }
    }

    search_dir(&workspace_path, &workspace_path, &query_lower, &mut results, limit, 0);

    // Sort: directories first, then by name
    results.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(results)
}

/// Read file content for @file mention injection
#[tauri::command]
async fn read_file_for_mention(
    path: String,
    max_lines: Option<usize>,
) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    if file_path.is_dir() {
        // For directories, return file listing
        let mut listing = format!("Directory: {}\n\n", path);
        if let Ok(entries) = fs::read_dir(&file_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let is_dir = entry.path().is_dir();
                listing.push_str(&format!("{}{}\n", if is_dir { "📁 " } else { "📄 " }, name));
            }
        }
        return Ok(listing);
    }

    // Read file content
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Optionally limit lines
    if let Some(limit) = max_lines {
        let lines: Vec<&str> = content.lines().take(limit).collect();
        let truncated = lines.len() < content.lines().count();
        let mut result = lines.join("\n");
        if truncated {
            result.push_str(&format!("\n\n... (truncated, showing first {} lines)", limit));
        }
        Ok(result)
    } else {
        Ok(content)
    }
}

/// Fetch URL content for @url mention
#[tauri::command]
async fn fetch_url_for_mention(url: String) -> Result<String, String> {
    // Basic URL validation
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL: must start with http:// or https://".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let content_type = response.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // Only process text content
    if !content_type.contains("text") && !content_type.contains("json") && !content_type.contains("xml") {
        return Err(format!("Unsupported content type: {}", content_type));
    }

    let text = response.text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Limit content size (max 50KB)
    if text.len() > 50 * 1024 {
        Ok(format!("{}\n\n... (content truncated, showing first 50KB)", &text[..50 * 1024]))
    } else {
        Ok(text)
    }
}

// ============ Memory Tool Commands ============

#[tauri::command]
async fn memory_tool_view(
    workspace: String,
    path: String,
    view_range: Option<(u32, u32)>,
) -> Result<MemoryToolResult, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let tool = MemoryTool::new(&workspace_path);
    Ok(tool.execute(MemoryToolCommand::View { path, view_range }))
}

#[tauri::command]
async fn memory_tool_create(
    workspace: String,
    path: String,
    file_text: String,
) -> Result<MemoryToolResult, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let tool = MemoryTool::new(&workspace_path);
    Ok(tool.execute(MemoryToolCommand::Create { path, file_text }))
}

#[tauri::command]
async fn memory_tool_str_replace(
    workspace: String,
    path: String,
    old_str: String,
    new_str: String,
) -> Result<MemoryToolResult, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let tool = MemoryTool::new(&workspace_path);
    Ok(tool.execute(MemoryToolCommand::StrReplace { path, old_str, new_str }))
}

#[tauri::command]
async fn memory_tool_insert(
    workspace: String,
    path: String,
    insert_line: u32,
    new_str: String,
) -> Result<MemoryToolResult, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let tool = MemoryTool::new(&workspace_path);
    Ok(tool.execute(MemoryToolCommand::Insert { path, insert_line, new_str }))
}

#[tauri::command]
async fn memory_tool_delete(
    workspace: String,
    path: String,
) -> Result<MemoryToolResult, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let tool = MemoryTool::new(&workspace_path);
    Ok(tool.execute(MemoryToolCommand::Delete { path }))
}

#[tauri::command]
async fn memory_tool_rename(
    workspace: String,
    old_path: String,
    new_path: String,
) -> Result<MemoryToolResult, String> {
    let workspace_path = PathBuf::from(&workspace);
    if !workspace_path.exists() {
        return Err(format!("Workspace does not exist: {}", workspace));
    }

    let tool = MemoryTool::new(&workspace_path);
    Ok(tool.execute(MemoryToolCommand::Rename { old_path, new_path }))
}

// ============ API Settings ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiSettings {
    pub provider: String,  // "anthropic" | "bedrock"
    // Anthropic settings
    pub anthropic_api_key: Option<String>,
    pub anthropic_base_url: Option<String>,
    pub anthropic_model: Option<String>,
    // Bedrock settings
    pub bedrock_region: Option<String>,
    pub bedrock_auth_method: Option<String>,  // "profile" | "access_key"
    pub bedrock_profile: Option<String>,
    pub bedrock_access_key_id: Option<String>,
    pub bedrock_secret_access_key: Option<String>,
    pub bedrock_model: Option<String>,
}

// ============ Simple Chat Commands ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleChatRequest {
    pub messages: Vec<SimpleChatMessage>,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub region: Option<String>,
    pub aws_profile: Option<String>,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    /// Workspace path for memory context injection
    pub workspace: Option<String>,
}

#[tauri::command]
async fn chat_send(request: SimpleChatRequest) -> Result<ChatResponse, String> {
    log::info!("chat_send called with provider: {}", request.provider);

    // Build system prompt with memory context if workspace is provided
    let system_prompt = if let Some(ref workspace) = request.workspace {
        let workspace_path = PathBuf::from(workspace);
        if workspace_path.exists() {
            // Try to get memory context
            let memory_context = MemoryIndex::open(&workspace_path)
                .ok()
                .and_then(|index| index.get_context().ok())
                .unwrap_or_default();

            // Memory tool instructions - passive approach, only use when needed
            let memory_instructions = r#"# Memory System

You have a `memory` tool for persistent storage. Use it ONLY when the user explicitly asks you to remember/save something.

## Guidelines
- **DO NOT** proactively mention or reference your stored memories unless directly relevant to user's question
- **DO NOT** mention the memory system exists unless user asks about it
- **ONLY** use the memory tool when user explicitly asks: "记住"/"remember"/"save this"/"记一下"

## Tool Commands (use only when needed)
- `view`: Read files
- `create`: Create new file (path: "filename.md", file_text: "content")
- `str_replace`: Update text (path, old_str, new_str)
- `insert`: Insert at line (path, insert_line, new_str)
- `delete`: Delete file

## Important
- When asked "who are you" or general questions, respond normally without mentioning memory
- Only reference stored information if user's question specifically relates to it
"#;
            // Combine memory context with instructions and user's system prompt
            let base_prompt = request.system_prompt.unwrap_or_default();
            let memory_context_section = if !memory_context.is_empty() {
                format!("## Stored Information (DO NOT mention unless user asks about this specific topic)\n\n{}\n\n---\n\n", memory_context.trim())
            } else {
                String::new()
            };

            if base_prompt.is_empty() {
                Some(format!("{}{}", memory_instructions, memory_context_section))
            } else {
                Some(format!("{}{}{}", memory_instructions, memory_context_section, base_prompt))
            }
        } else {
            request.system_prompt
        }
    } else {
        request.system_prompt
    };

    let client = ChatClient::new();
    let chat_request = ChatRequest {
        messages: request.messages,
        config: ApiConfig {
            provider: request.provider,
            api_key: request.api_key,
            base_url: request.base_url,
            model: request.model,
            region: request.region,
            aws_profile: request.aws_profile,
        },
        system_prompt,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        workspace: request.workspace,
    };

    client.send(chat_request).await
}

// ============ Claude Agent Commands ============

#[tauri::command]
async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    content: String,
    system_prompt: Option<String>,
    api_settings: Option<ApiSettings>,
) -> Result<String, String> {
    // Create user message
    let user_msg_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let user_message = Message {
        id: user_msg_id.clone(),
        session_id: session_id.clone(),
        role: "user".to_string(),
        content: content.clone(),
        timestamp: now.clone(),
    };

    // Check if this is a continuation of an existing conversation
    let has_history = {
        let messages = state.messages.lock().unwrap();
        messages.get(&session_id).map(|m| !m.is_empty()).unwrap_or(false)
    };

    // Add user message
    {
        let mut messages = state.messages.lock().unwrap();
        if let Some(session_messages) = messages.get_mut(&session_id) {
            session_messages.push(user_message);
        }
    }

    // Mark session as processing
    {
        let mut sessions = state.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&session_id) {
            session.is_processing = true;
        }
    }

    // Get current workspace
    let workspace_path = {
        let workspace = state.workspace.lock().unwrap();
        workspace.clone()
    };

    // Build options with conversation continuation
    // Collect all optional values first, then construct options using struct initialization

    // Set working directory if workspace is set
    let cwd_path: Option<PathBuf> = workspace_path.as_ref().map(|ws| {
        log::info!("Using workspace directory: {}", ws);
        PathBuf::from(ws)
    });

    // If this is a continuation, use --continue flag to maintain conversation state
    let (continue_conversation, resume_session) = if has_history {
        log::info!("Continuing conversation for session: {}", session_id);
        (true, Some(session_id.clone()))
    } else {
        (false, None)
    };

    // Build system prompt with memory context and workspace instruction
    let enhanced_system_prompt = if let Some(ref ws_path) = workspace_path {
        let workspace_dir = PathBuf::from(ws_path);
        // Try to get memory context
        let memory_context = MemoryIndex::open(&workspace_dir)
            .ok()
            .and_then(|index| index.get_context().ok())
            .unwrap_or_default();

        // Workspace instruction: always save files to workspace directory
        let workspace_instruction = format!(
            "# Workspace Directory\n\n\
            Your current working directory is: {}\n\
            IMPORTANT: When creating or saving any files (documents, code, artifacts, etc.), \
            ALWAYS save them to the current working directory or its subdirectories. \
            NEVER use /tmp or other temporary directories. Use relative paths from the workspace root.\n\n---\n\n",
            ws_path
        );

        let base_prompt = system_prompt.unwrap_or_default();

        if !memory_context.is_empty() {
            // Memory context instruction: only reference when relevant, don't proactively mention
            let memory_header = "# Background Information (Reference ONLY when relevant to user's question - DO NOT proactively mention)\n\n";
            Some(format!(
                "{}{}{}\n\n---\n\n{}",
                workspace_instruction,
                memory_header,
                memory_context.trim(),
                base_prompt
            ))
        } else if !base_prompt.is_empty() {
            Some(format!("{}{}", workspace_instruction, base_prompt))
        } else {
            Some(workspace_instruction)
        }
    } else {
        system_prompt
    };

    // Load skills and add to system prompt
    // Skills are loaded from: ~/.claude/skills/ and {workspace}/.claude/skills/
    let skills_prompt = {
        let mut skills_content = String::new();
        let ws_path = workspace_path.as_deref();
        if let Ok(skills) = SkillManager::list_all(ws_path) {
            if !skills.is_empty() {
                skills_content.push_str("\n\n# Available Skills\n\n");
                skills_content.push_str("The following skills are installed and available. Use them when relevant:\n\n");
                for skill in &skills {
                    // Use the full path stored in SkillInfo
                    if let Ok(content) = SkillManager::get_content_from_path(&skill.path) {
                        skills_content.push_str(&format!("## Skill: {}\n\n", skill.name));
                        skills_content.push_str(&content);
                        skills_content.push_str("\n\n---\n\n");
                    }
                }
                log::info!("Loaded {} skills into system prompt from global and workspace directories", skills.len());
            }
        }
        skills_content
    };

    // Combine system prompt with skills
    let final_system_prompt = match enhanced_system_prompt {
        Some(prompt) if !skills_prompt.is_empty() => Some(format!("{}{}", prompt, skills_prompt)),
        Some(prompt) => Some(prompt),
        None if !skills_prompt.is_empty() => Some(skills_prompt),
        None => None,
    };

    // Convert final_system_prompt to SystemPrompt type
    let system_prompt_option = final_system_prompt.map(claude_agent_sdk_rs::SystemPrompt::from);

    // Load MCP servers from ~/.claude.json
    let mcp_servers = dirs::home_dir()
        .map(|home| home.join(".claude.json"))
        .filter(|p| {
            if p.exists() {
                log::info!("Loading MCP config from: {:?}", p);
                true
            } else {
                false
            }
        })
        .map(McpServers::Path)
        .unwrap_or_default();

    // Build environment variables and model
    let mut env_vars: HashMap<String, String> = HashMap::new();
    let mut model_option: Option<String> = None;

    // Apply API settings (provider, model, credentials)
    if let Some(ref settings) = api_settings {
        log::info!("Applying API settings: provider={}", settings.provider);

        if settings.provider == "bedrock" {
            // For Bedrock, set model and AWS credentials via environment variables
            if let Some(ref model) = settings.bedrock_model {
                model_option = Some(model.clone());
            }
            if let Some(ref region) = settings.bedrock_region {
                env_vars.insert("AWS_REGION".to_string(), region.clone());
                env_vars.insert("AWS_DEFAULT_REGION".to_string(), region.clone());
            }
            // Set AWS credentials based on auth method
            if settings.bedrock_auth_method.as_deref() == Some("access_key") {
                if let Some(ref access_key) = settings.bedrock_access_key_id {
                    env_vars.insert("AWS_ACCESS_KEY_ID".to_string(), access_key.clone());
                }
                if let Some(ref secret_key) = settings.bedrock_secret_access_key {
                    env_vars.insert("AWS_SECRET_ACCESS_KEY".to_string(), secret_key.clone());
                }
            } else if let Some(ref profile) = settings.bedrock_profile {
                // Use AWS profile
                env_vars.insert("AWS_PROFILE".to_string(), profile.clone());
            }
            // Tell Claude Code to use Bedrock provider
            env_vars.insert("CLAUDE_CODE_USE_BEDROCK".to_string(), "1".to_string());
        } else {
            // For Anthropic direct API
            if let Some(ref model) = settings.anthropic_model {
                model_option = Some(model.clone());
            }
            if let Some(ref api_key) = settings.anthropic_api_key {
                env_vars.insert("ANTHROPIC_API_KEY".to_string(), api_key.clone());
            }
            if let Some(ref base_url) = settings.anthropic_base_url {
                env_vars.insert("ANTHROPIC_BASE_URL".to_string(), base_url.clone());
            }
        }
    }

    // Build options using struct initialization
    let options = ClaudeAgentOptions {
        permission_mode: Some(PermissionMode::BypassPermissions),
        continue_conversation,
        resume: resume_session,
        cwd: cwd_path,
        system_prompt: system_prompt_option,
        mcp_servers,
        model: model_option,
        env: env_vars,
        ..Default::default()
    };

    // Query Claude using streaming - let CLI handle conversation history
    log::info!("Querying Claude, has_history: {}", has_history);
    let mut stream = query_stream(&content, Some(options))
        .await
        .map_err(|e| {
            log::error!("Failed to query Claude: {}", e);
            format!("Failed to query Claude: {}", e)
        })?;

    let mut assistant_content = String::new();
    let assistant_msg_id = Uuid::new_v4().to_string();

    log::info!("Starting to process stream...");

    // Process stream
    while let Some(message) = stream.next().await {
        log::info!("Received message: {:?}", message);
        match message {
            Ok(ClaudeMessage::Assistant(msg)) => {
                log::info!("Assistant message received with {} content blocks", msg.message.content.len());
                for block in &msg.message.content {
                    match block {
                        ContentBlock::Text(text_block) => {
                            log::info!("Text block: {}", text_block.text);
                            assistant_content.push_str(&text_block.text);
                            // Emit text delta event to main window
                            log::info!("Emitting text_delta event for session: {}", session_id);
                            let event_data = SessionEvent {
                                event_type: "text_delta".to_string(),
                                session_id: session_id.clone(),
                                data: serde_json::json!({
                                    "text": assistant_content,
                                    "message_id": assistant_msg_id
                                }),
                            };
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("session-event", &event_data);
                            } else {
                                let _ = app.emit("session-event", &event_data);
                            }
                        }
                        ContentBlock::ToolUse(tool_use) => {
                            log::info!("Tool use: {} ({}) - input: {:?}", tool_use.name, tool_use.id, tool_use.input);
                            // Emit tool_use event so UI can show progress
                            let tool_event = SessionEvent {
                                event_type: "tool_use".to_string(),
                                session_id: session_id.clone(),
                                data: serde_json::json!({
                                    "tool_id": tool_use.id,
                                    "tool_name": tool_use.name,
                                    "tool_input": tool_use.input,
                                    "message_id": assistant_msg_id
                                }),
                            };
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("session-event", &tool_event);
                            } else {
                                let _ = app.emit("session-event", &tool_event);
                            }
                        }
                        _ => {
                            log::info!("Other content block type");
                        }
                    }
                }
            }
            Ok(ClaudeMessage::Result(result)) => {
                log::info!("Result received: cost={:?}, turns={:?}", result.total_cost_usd, result.num_turns);
                // Emit complete event to main window
                let complete_event = SessionEvent {
                    event_type: "complete".to_string(),
                    session_id: session_id.clone(),
                    data: serde_json::json!({
                        "message_id": assistant_msg_id,
                        "content": assistant_content,  // Include final content
                        "cost": result.total_cost_usd,
                        "turns": result.num_turns
                    }),
                };
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("session-event", &complete_event);
                } else {
                    let _ = app.emit("session-event", &complete_event);
                }
                break;
            }
            Err(e) => {
                log::error!("Error in stream: {}", e);
                // Emit error event to main window
                let error_event = SessionEvent {
                    event_type: "error".to_string(),
                    session_id: session_id.clone(),
                    data: serde_json::json!({
                        "error": e.to_string()
                    }),
                };
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("session-event", &error_event);
                } else {
                    let _ = app.emit("session-event", &error_event);
                }
                break;
            }
            other => {
                log::info!("Other message type: {:?}", other);
            }
        }
    }
    log::info!("Stream processing complete");

    // Save assistant message
    let assistant_message = Message {
        id: assistant_msg_id.clone(),
        session_id: session_id.clone(),
        role: "assistant".to_string(),
        content: assistant_content,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };

    {
        let mut messages = state.messages.lock().unwrap();
        if let Some(session_messages) = messages.get_mut(&session_id) {
            session_messages.push(assistant_message);
        }
    }

    // Mark session as not processing
    {
        let mut sessions = state.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&session_id) {
            session.is_processing = false;
            session.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    Ok(assistant_msg_id)
}

// ============ Claude Code CLI Commands ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeCodeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

/// Check if Claude Code CLI is installed
#[tauri::command]
async fn check_claude_code() -> Result<ClaudeCodeStatus, String> {
    use std::process::Command;

    // Try to find claude in PATH
    let output = Command::new("which")
        .arg("claude")
        .output();

    match output {
        Ok(result) if result.status.success() => {
            let path = String::from_utf8_lossy(&result.stdout).trim().to_string();

            // Try to get version
            let version_output = Command::new("claude")
                .arg("--version")
                .output();

            let version = version_output.ok().and_then(|v| {
                if v.status.success() {
                    Some(String::from_utf8_lossy(&v.stdout).trim().to_string())
                } else {
                    None
                }
            });

            Ok(ClaudeCodeStatus {
                installed: true,
                version,
                path: Some(path),
            })
        }
        _ => {
            Ok(ClaudeCodeStatus {
                installed: false,
                version: None,
                path: None,
            })
        }
    }
}

/// Install Claude Code CLI using official script
#[tauri::command]
async fn install_claude_code(app: AppHandle) -> Result<String, String> {
    use std::process::Command;

    // Run the official install script
    let output = Command::new("bash")
        .arg("-c")
        .arg("curl -fsSL https://claude.ai/install.sh | bash")
        .output()
        .map_err(|e| format!("Failed to run install script: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(format!("Claude Code installed successfully!\n{}", stdout))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Installation failed: {}", stderr))
    }
}

/// Get the install command for manual installation
#[tauri::command]
fn get_claude_code_install_command() -> String {
    "curl -fsSL https://claude.ai/install.sh | bash".to_string()
}

// ============ Environment Check Commands ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStatus {
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentStatus {
    pub node: ToolStatus,
    pub npx: ToolStatus,
    pub uvx: ToolStatus,
    pub uv: ToolStatus,
    pub python: ToolStatus,
}

/// Check a single tool's status
fn check_tool(name: &str, version_arg: &str) -> ToolStatus {
    use std::process::Command;

    let which_output = Command::new("which")
        .arg(name)
        .output();

    match which_output {
        Ok(result) if result.status.success() => {
            let path = String::from_utf8_lossy(&result.stdout).trim().to_string();

            // Try to get version
            let version_output = Command::new(name)
                .arg(version_arg)
                .output();

            let version = version_output.ok().and_then(|v| {
                if v.status.success() {
                    let output = String::from_utf8_lossy(&v.stdout).trim().to_string();
                    // Extract version number from output
                    Some(output.lines().next().unwrap_or(&output).to_string())
                } else {
                    None
                }
            });

            ToolStatus {
                name: name.to_string(),
                installed: true,
                version,
                path: Some(path),
            }
        }
        _ => {
            ToolStatus {
                name: name.to_string(),
                installed: false,
                version: None,
                path: None,
            }
        }
    }
}

/// Check all MCP-related environment tools
#[tauri::command]
async fn check_environment() -> Result<EnvironmentStatus, String> {
    Ok(EnvironmentStatus {
        node: check_tool("node", "--version"),
        npx: check_tool("npx", "--version"),
        uvx: check_tool("uvx", "--version"),
        uv: check_tool("uv", "--version"),
        python: check_tool("python3", "--version"),
    })
}

/// Check a single tool
#[tauri::command]
async fn check_tool_status(name: String) -> Result<ToolStatus, String> {
    let version_arg = match name.as_str() {
        "node" | "npx" | "uv" | "uvx" => "--version",
        "python" | "python3" => "--version",
        _ => "--version",
    };
    Ok(check_tool(&name, version_arg))
}

// ============ Browser Relay Commands ============

/// Start the browser relay WebSocket server and HTTP API
#[tauri::command]
async fn browser_relay_start() -> Result<(), String> {
    let server = browser::get_browser_relay();
    server.start().await?;

    // Also start HTTP API for agentic browser control
    let http_api = browser::get_browser_http_api();
    http_api.start(server).await?;

    Ok(())
}

/// Stop the browser relay WebSocket server and HTTP API
#[tauri::command]
async fn browser_relay_stop() -> Result<(), String> {
    let http_api = browser::get_browser_http_api();
    http_api.stop().await;

    let server = browser::get_browser_relay();
    server.stop().await;
    Ok(())
}

/// Get browser relay connection status
#[tauri::command]
async fn browser_relay_status() -> Result<browser::BrowserRelayStatus, String> {
    let server = browser::get_browser_relay();
    Ok(server.get_status().await)
}

/// List all open browser tabs
#[tauri::command]
async fn browser_list_tabs() -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::ListTabs).await
}

/// Open a URL in the browser
#[tauri::command]
async fn browser_open_tab(url: String) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Open { url }).await
}

/// Close a browser tab
#[tauri::command]
async fn browser_close_tab(tab_id: u32) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Close { tab_id }).await
}

/// Attach debugger to a tab
#[tauri::command]
async fn browser_attach_tab(tab_id: u32) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Attach { tab_id }).await
}

/// Detach from a tab
#[tauri::command]
async fn browser_detach_tab(tab_id: u32) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Detach { tab_id }).await
}

/// Get page snapshot (accessibility tree)
#[tauri::command]
async fn browser_snapshot(tab_id: u32) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Snapshot { tab_id }).await
}

/// Execute JavaScript in a tab
#[tauri::command]
async fn browser_evaluate(tab_id: u32, expression: String) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Evaluate { tab_id, expression }).await
}

/// Click an element
#[tauri::command]
async fn browser_click(tab_id: u32, selector: String) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Click { tab_id, selector }).await
}

/// Type text into an element
#[tauri::command]
async fn browser_type(tab_id: u32, selector: String, text: String) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Type { tab_id, selector, text }).await
}

/// Scroll the page
#[tauri::command]
async fn browser_scroll(tab_id: u32, direction: String) -> Result<serde_json::Value, String> {
    let dir = match direction.to_lowercase().as_str() {
        "up" => browser::ScrollDirection::Up,
        "down" => browser::ScrollDirection::Down,
        "left" => browser::ScrollDirection::Left,
        "right" => browser::ScrollDirection::Right,
        _ => return Err(format!("Invalid direction: {}", direction)),
    };
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Scroll { tab_id, direction: dir }).await
}

/// Take a screenshot
#[tauri::command]
async fn browser_screenshot(tab_id: u32) -> Result<serde_json::Value, String> {
    let server = browser::get_browser_relay();
    server.send_command(browser::BrowserRequest::Screenshot { tab_id }).await
}

// ============ App Entry ============

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enable Bedrock for Claude Agent SDK
    // The SDK uses Claude Code CLI which checks this env var
    std::env::set_var("CLAUDE_CODE_USE_BEDROCK", "true");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Always enable logging for debugging
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Debug)
                    .build(),
            )?;

            // Initialize database
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            let db_path = app_data_dir.join("chat_history.db");
            log::info!("Initializing database at: {:?}", db_path);

            let db = ChatDatabase::open(&db_path)
                .expect("Failed to open database");

            app.manage(AppState::new(db));

            // Start browser relay server and HTTP API in background
            let browser_server = browser::get_browser_relay();
            let http_api = browser::get_browser_http_api();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = browser_server.start().await {
                    log::error!("Failed to start browser relay server: {}", e);
                } else {
                    log::info!("Browser relay server started on ws://127.0.0.1:18799");
                    // Start HTTP API after WebSocket server is ready
                    if let Err(e) = http_api.start(browser_server).await {
                        log::error!("Failed to start browser HTTP API: {}", e);
                    } else {
                        log::info!("Browser HTTP API started on http://127.0.0.1:18800");
                    }
                }
            });

            log::info!("Tauri app started with CLAUDE_CODE_USE_BEDROCK={}",
                std::env::var("CLAUDE_CODE_USE_BEDROCK").unwrap_or_default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // File commands
            read_file,
            save_file,
            get_home_dir,
            get_data_dir,
            get_config_dir,
            file_exists,
            list_dir,
            create_dir,
            remove_file,
            remove_dir,
            // Session commands (legacy in-memory)
            get_sessions,
            create_session,
            delete_session,
            get_session_messages,
            // Workspace commands
            set_workspace,
            get_workspace,
            // Database commands (SQLite)
            db_create_session,
            db_get_sessions,
            db_get_session,
            db_update_session,
            db_delete_session,
            db_append_message,
            db_get_messages,
            db_get_recent_messages,
            db_update_message_metadata,
            db_get_session_with_messages,
            db_update_session_flag,
            db_update_session_status,
            db_update_session_unread,
            db_get_flagged_sessions,
            db_get_sessions_by_status,
            // Claude commands
            send_message,
            // Simple chat commands
            chat_send,
            // MCP commands
            mcp_list_servers,
            mcp_add_server,
            mcp_remove_server,
            mcp_toggle_server,
            mcp_update_server,
            mcp_get_server,
            // Skills commands
            skill_list,
            skill_get_content,
            skill_get_metadata,
            skill_list_files,
            skill_read_file,
            skill_install_from_content,
            skill_install_from_url,
            skill_install_from_zip,
            skill_delete,
            skill_open_folder,
            skill_search,
            open_directory,
            // Memory commands
            memory_sync,
            memory_search,
            memory_get_context,
            memory_get_stats,
            // Workspace file search commands
            search_workspace_files,
            read_file_for_mention,
            fetch_url_for_mention,
            // Memory tool commands
            memory_tool_view,
            memory_tool_create,
            memory_tool_str_replace,
            memory_tool_insert,
            memory_tool_delete,
            memory_tool_rename,
            // Claude Code CLI commands
            check_claude_code,
            install_claude_code,
            get_claude_code_install_command,
            // Environment check commands
            check_environment,
            check_tool_status,
            // Browser relay commands
            browser_relay_start,
            browser_relay_stop,
            browser_relay_status,
            browser_list_tabs,
            browser_open_tab,
            browser_close_tab,
            browser_attach_tab,
            browser_detach_tab,
            browser_snapshot,
            browser_evaluate,
            browser_click,
            browser_type,
            browser_scroll,
            browser_screenshot,
            // RSS commands
            rss::rss_fetch,
            rss::rss_fetch_and_parse,
            rss::rss_parse,
            rss_db::rss_get_feeds,
            rss_db::rss_create_feed,
            rss_db::rss_update_feed,
            rss_db::rss_delete_feed,
            rss_db::rss_get_categories,
            rss_db::rss_create_category,
            rss_db::rss_delete_category,
            rss_db::rss_upsert_articles,
            rss_db::rss_get_articles,
            rss_db::rss_get_recent_articles,
            rss_db::rss_search_articles,
            rss_db::rss_mark_article_read,
            rss_db::rss_toggle_article_starred,
            rss_db::rss_get_starred_articles,
            rss_db::rss_cleanup_old_articles,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
