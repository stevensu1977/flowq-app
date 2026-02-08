//! SQLite Database Layer for Chat History
//!
//! Schema designed for future sqlite-vec extension support.

use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

// ============ Types ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSession {
    pub id: String,
    pub workspace_path: Option<String>,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub summary: Option<String>,           // AI 生成的摘要，未来用于上下文
    pub is_flagged: Option<bool>,          // 是否标记
    pub status: Option<String>,            // 状态: todo, in-progress, needs-review, done, cancelled
    pub has_unread: Option<bool>,          // 是否有未读消息
    // pub summary_embedding: Option<Vec<f32>>, // 未来 sqlite-vec 扩展
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,           // "user" | "assistant"
    pub content: String,
    pub timestamp: String,
    pub metadata: Option<String>, // JSON: tool_calls, steps, cost, etc.
    // pub embedding: Option<Vec<f32>>, // 未来 sqlite-vec 扩展
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbToolExecution {
    pub id: String,
    pub message_id: String,
    pub tool_name: String,
    pub tool_input: String,     // JSON
    pub tool_output: Option<String>, // JSON
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,         // "running" | "completed" | "error"
}

// ============ Database ============

pub struct ChatDatabase {
    conn: Mutex<Connection>,
}

impl ChatDatabase {
    /// Open or create database at given path
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    /// Initialize database schema
    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            -- Sessions table
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                workspace_path TEXT,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                summary TEXT,
                is_flagged INTEGER DEFAULT 0,
                status TEXT DEFAULT 'todo',
                has_unread INTEGER DEFAULT 0
                -- summary_embedding BLOB  -- 未来 sqlite-vec: F32_BLOB
            );

            -- Index for workspace queries
            CREATE INDEX IF NOT EXISTS idx_sessions_workspace
                ON sessions(workspace_path, updated_at DESC);

            -- Messages table
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                metadata TEXT
                -- embedding BLOB  -- 未来 sqlite-vec: F32_BLOB
            );

            -- Index for session messages (ordered by time)
            CREATE INDEX IF NOT EXISTS idx_messages_session
                ON messages(session_id, timestamp);

            -- Tool executions table (optional, for detailed tracking)
            CREATE TABLE IF NOT EXISTS tool_executions (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                tool_input TEXT NOT NULL,
                tool_output TEXT,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                status TEXT NOT NULL
            );

            -- Index for tool executions
            CREATE INDEX IF NOT EXISTS idx_tool_executions_message
                ON tool_executions(message_id);

            -- Future: Full-text search (FTS5)
            -- CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
            --     USING fts5(content, content=messages, content_rowid=rowid);

            -- Future: Vector search (sqlite-vec)
            -- CREATE VIRTUAL TABLE IF NOT EXISTS messages_vec
            --     USING vec0(embedding float[1536]);
            "#,
        )?;

        Ok(())
    }

    // ============ Session CRUD ============

    /// Create a new session
    pub fn create_session(&self, session: &DbSession) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                session.id,
                session.workspace_path,
                session.title,
                session.created_at,
                session.updated_at,
                session.summary,
                session.is_flagged.unwrap_or(false) as i32,
                session.status.clone().unwrap_or_else(|| "todo".to_string()),
                session.has_unread.unwrap_or(false) as i32,
            ],
        )?;
        Ok(())
    }

    /// Get session by ID
    pub fn get_session(&self, id: &str) -> Result<Option<DbSession>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread
             FROM sessions WHERE id = ?1"
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let is_flagged: i32 = row.get::<_, Option<i32>>(6)?.unwrap_or(0);
            let has_unread: i32 = row.get::<_, Option<i32>>(8)?.unwrap_or(0);
            Ok(Some(DbSession {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                summary: row.get(5)?,
                is_flagged: Some(is_flagged != 0),
                status: row.get(7)?,
                has_unread: Some(has_unread != 0),
            }))
        } else {
            Ok(None)
        }
    }

    /// Get all sessions for a workspace (ordered by updated_at DESC)
    pub fn get_sessions_by_workspace(&self, workspace_path: Option<&str>) -> Result<Vec<DbSession>> {
        let conn = self.conn.lock().unwrap();

        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<DbSession> {
            let is_flagged: i32 = row.get::<_, Option<i32>>(6)?.unwrap_or(0);
            let has_unread: i32 = row.get::<_, Option<i32>>(8)?.unwrap_or(0);
            Ok(DbSession {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                summary: row.get(5)?,
                is_flagged: Some(is_flagged != 0),
                status: row.get(7)?,
                has_unread: Some(has_unread != 0),
            })
        };

        if let Some(path) = workspace_path {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread
                 FROM sessions WHERE workspace_path = ?1
                 ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map(params![path], map_row)?;
            rows.collect()
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread
                 FROM sessions WHERE workspace_path IS NULL
                 ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map([], map_row)?;
            rows.collect()
        }
    }

    /// Update session
    pub fn update_session(&self, session: &DbSession) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET title = ?2, updated_at = ?3, summary = ?4, is_flagged = ?5, status = ?6, has_unread = ?7
             WHERE id = ?1",
            params![
                session.id,
                session.title,
                session.updated_at,
                session.summary,
                session.is_flagged.unwrap_or(false) as i32,
                session.status.clone().unwrap_or_else(|| "todo".to_string()),
                session.has_unread.unwrap_or(false) as i32,
            ],
        )?;
        Ok(())
    }

    /// Update session flag status
    pub fn update_session_flag(&self, id: &str, is_flagged: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET is_flagged = ?2 WHERE id = ?1",
            params![id, is_flagged as i32],
        )?;
        Ok(())
    }

    /// Update session status
    pub fn update_session_status(&self, id: &str, status: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET status = ?2 WHERE id = ?1",
            params![id, status],
        )?;
        Ok(())
    }

    /// Update session unread status
    pub fn update_session_unread(&self, id: &str, has_unread: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET has_unread = ?2 WHERE id = ?1",
            params![id, has_unread as i32],
        )?;
        Ok(())
    }

    /// Get flagged sessions for a workspace
    pub fn get_flagged_sessions(&self, workspace_path: Option<&str>) -> Result<Vec<DbSession>> {
        let conn = self.conn.lock().unwrap();

        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<DbSession> {
            let is_flagged: i32 = row.get::<_, Option<i32>>(6)?.unwrap_or(0);
            let has_unread: i32 = row.get::<_, Option<i32>>(8)?.unwrap_or(0);
            Ok(DbSession {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                summary: row.get(5)?,
                is_flagged: Some(is_flagged != 0),
                status: row.get(7)?,
                has_unread: Some(has_unread != 0),
            })
        };

        if let Some(path) = workspace_path {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread
                 FROM sessions WHERE workspace_path = ?1 AND is_flagged = 1
                 ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map(params![path], map_row)?;
            rows.collect()
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread
                 FROM sessions WHERE workspace_path IS NULL AND is_flagged = 1
                 ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map([], map_row)?;
            rows.collect()
        }
    }

    /// Get sessions by status for a workspace
    pub fn get_sessions_by_status(&self, workspace_path: Option<&str>, status: &str) -> Result<Vec<DbSession>> {
        let conn = self.conn.lock().unwrap();

        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<DbSession> {
            let is_flagged: i32 = row.get::<_, Option<i32>>(6)?.unwrap_or(0);
            let has_unread: i32 = row.get::<_, Option<i32>>(8)?.unwrap_or(0);
            Ok(DbSession {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                summary: row.get(5)?,
                is_flagged: Some(is_flagged != 0),
                status: row.get(7)?,
                has_unread: Some(has_unread != 0),
            })
        };

        if let Some(path) = workspace_path {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread
                 FROM sessions WHERE workspace_path = ?1 AND status = ?2
                 ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map(params![path, status], map_row)?;
            rows.collect()
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_path, title, created_at, updated_at, summary, is_flagged, status, has_unread
                 FROM sessions WHERE workspace_path IS NULL AND status = ?1
                 ORDER BY updated_at DESC"
            )?;
            let rows = stmt.query_map(params![status], map_row)?;
            rows.collect()
        }
    }

    /// Delete session and its messages
    pub fn delete_session(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        // Delete messages first
        conn.execute("DELETE FROM messages WHERE session_id = ?1", params![id])?;
        // Delete tool executions
        conn.execute(
            "DELETE FROM tool_executions WHERE message_id IN
             (SELECT id FROM messages WHERE session_id = ?1)",
            params![id],
        )?;
        // Delete session
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ============ Message CRUD ============

    /// Append a message to a session
    pub fn append_message(&self, message: &DbMessage) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, timestamp, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                message.id,
                message.session_id,
                message.role,
                message.content,
                message.timestamp,
                message.metadata,
            ],
        )?;
        Ok(())
    }

    /// Get all messages for a session (ordered by timestamp)
    pub fn get_messages(&self, session_id: &str) -> Result<Vec<DbMessage>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, timestamp, metadata
             FROM messages WHERE session_id = ?1
             ORDER BY timestamp ASC"
        )?;

        let rows = stmt.query_map(params![session_id], |row| {
            Ok(DbMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                metadata: row.get(5)?,
            })
        })?;

        rows.collect()
    }

    /// Get recent messages (for context window)
    pub fn get_recent_messages(&self, session_id: &str, limit: u32) -> Result<Vec<DbMessage>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, role, content, timestamp, metadata
             FROM messages WHERE session_id = ?1
             ORDER BY timestamp DESC
             LIMIT ?2"
        )?;

        let rows = stmt.query_map(params![session_id, limit], |row| {
            Ok(DbMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                metadata: row.get(5)?,
            })
        })?;

        // Reverse to get chronological order
        let mut messages: Vec<DbMessage> = rows.collect::<Result<Vec<_>>>()?;
        messages.reverse();
        Ok(messages)
    }

    /// Update message metadata
    pub fn update_message_metadata(&self, id: &str, metadata: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE messages SET metadata = ?2 WHERE id = ?1",
            params![id, metadata],
        )?;
        Ok(())
    }

    // ============ Tool Execution CRUD ============

    /// Record tool execution
    pub fn add_tool_execution(&self, exec: &DbToolExecution) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO tool_executions
             (id, message_id, tool_name, tool_input, tool_output, started_at, finished_at, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                exec.id,
                exec.message_id,
                exec.tool_name,
                exec.tool_input,
                exec.tool_output,
                exec.started_at,
                exec.finished_at,
                exec.status,
            ],
        )?;
        Ok(())
    }

    /// Update tool execution result
    pub fn update_tool_execution(&self, id: &str, output: &str, finished_at: &str, status: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tool_executions
             SET tool_output = ?2, finished_at = ?3, status = ?4
             WHERE id = ?1",
            params![id, output, finished_at, status],
        )?;
        Ok(())
    }

    /// Get tool executions for a message
    pub fn get_tool_executions(&self, message_id: &str) -> Result<Vec<DbToolExecution>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, message_id, tool_name, tool_input, tool_output, started_at, finished_at, status
             FROM tool_executions WHERE message_id = ?1
             ORDER BY started_at ASC"
        )?;

        let rows = stmt.query_map(params![message_id], |row| {
            Ok(DbToolExecution {
                id: row.get(0)?,
                message_id: row.get(1)?,
                tool_name: row.get(2)?,
                tool_input: row.get(3)?,
                tool_output: row.get(4)?,
                started_at: row.get(5)?,
                finished_at: row.get(6)?,
                status: row.get(7)?,
            })
        })?;

        rows.collect()
    }

    // ============ Statistics ============

    /// Get session message count
    pub fn get_message_count(&self, session_id: &str) -> Result<u32> {
        let conn = self.conn.lock().unwrap();
        let count: u32 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get total sessions count for workspace
    pub fn get_session_count(&self, workspace_path: Option<&str>) -> Result<u32> {
        let conn = self.conn.lock().unwrap();
        let count: u32 = if let Some(path) = workspace_path {
            conn.query_row(
                "SELECT COUNT(*) FROM sessions WHERE workspace_path = ?1",
                params![path],
                |row| row.get(0),
            )?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM sessions WHERE workspace_path IS NULL",
                [],
                |row| row.get(0),
            )?
        };
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_create_and_get_session() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = ChatDatabase::open(&db_path).unwrap();

        let session = DbSession {
            id: "test_session".to_string(),
            workspace_path: Some("/test/path".to_string()),
            title: "Test Session".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            summary: None,
            is_flagged: Some(false),
            status: Some("todo".to_string()),
            has_unread: Some(false),
        };

        db.create_session(&session).unwrap();
        let retrieved = db.get_session("test_session").unwrap().unwrap();

        assert_eq!(retrieved.id, session.id);
        assert_eq!(retrieved.title, session.title);
        assert_eq!(retrieved.is_flagged, Some(false));
        assert_eq!(retrieved.status, Some("todo".to_string()));
    }

    #[test]
    fn test_append_and_get_messages() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = ChatDatabase::open(&db_path).unwrap();

        // Create session first
        let session = DbSession {
            id: "test_session".to_string(),
            workspace_path: None,
            title: "Test".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            summary: None,
            is_flagged: None,
            status: None,
            has_unread: None,
        };
        db.create_session(&session).unwrap();

        // Append messages
        let msg1 = DbMessage {
            id: "msg1".to_string(),
            session_id: "test_session".to_string(),
            role: "user".to_string(),
            content: "Hello".to_string(),
            timestamp: "2024-01-01T00:00:01Z".to_string(),
            metadata: None,
        };
        let msg2 = DbMessage {
            id: "msg2".to_string(),
            session_id: "test_session".to_string(),
            role: "assistant".to_string(),
            content: "Hi there!".to_string(),
            timestamp: "2024-01-01T00:00:02Z".to_string(),
            metadata: Some(r#"{"cost": 0.001}"#.to_string()),
        };

        db.append_message(&msg1).unwrap();
        db.append_message(&msg2).unwrap();

        let messages = db.get_messages("test_session").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }
}
