//! Memory Index Layer
//!
//! SQLite-based indexing for memory files with FTS5 full-text search.
//! This module handles:
//! - File tracking (hash-based change detection)
//! - Markdown chunking
//! - FTS5 indexing and search

use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

// ============ Configuration ============

/// Chunking parameters
const MAX_CHARS_PER_CHUNK: usize = 1600; // ~400 tokens
const OVERLAP_CHARS: usize = 320; // ~80 tokens

// ============ Types ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedFile {
    pub path: String,
    pub hash: String,
    pub mtime: i64,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub text: String,
    pub hash: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub text: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub files_added: usize,
    pub files_updated: usize,
    pub files_removed: usize,
    pub chunks_created: usize,
}

// ============ Memory Index Database ============

pub struct MemoryIndex {
    conn: Mutex<Connection>,
    workspace: PathBuf,
}

impl MemoryIndex {
    /// Open or create memory index database for a workspace
    pub fn open(workspace: &Path) -> Result<Self> {
        let flowq_dir = workspace.join(".flowq");
        fs::create_dir_all(&flowq_dir).map_err(|e| {
            rusqlite::Error::InvalidPath(PathBuf::from(format!("Failed to create .flowq dir: {}", e)))
        })?;

        let db_path = flowq_dir.join("memory.sqlite");
        let conn = Connection::open(&db_path)?;

        let index = Self {
            conn: Mutex::new(conn),
            workspace: workspace.to_path_buf(),
        };

        index.init_schema()?;
        Ok(index)
    }

    /// Initialize database schema
    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            -- File tracking
            CREATE TABLE IF NOT EXISTS files (
                path TEXT PRIMARY KEY,
                hash TEXT NOT NULL,
                mtime INTEGER NOT NULL,
                size INTEGER NOT NULL
            );

            -- Chunk storage
            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                text TEXT NOT NULL,
                hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (path) REFERENCES files(path) ON DELETE CASCADE
            );

            -- Index for chunk path lookup
            CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);

            -- FTS5 full-text index
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                text,
                id UNINDEXED,
                path UNINDEXED,
                start_line UNINDEXED,
                end_line UNINDEXED
            );

            -- Enable foreign keys
            PRAGMA foreign_keys = ON;
            "#,
        )?;

        Ok(())
    }

    /// Get the memories directory path
    fn memories_dir(&self) -> PathBuf {
        self.workspace.join(".flowq").join("memories")
    }

    /// Get MEMORY.md path
    fn memory_md_path(&self) -> PathBuf {
        self.workspace.join("MEMORY.md")
    }

    /// Sync all memory files to the index
    pub fn sync(&self) -> Result<SyncResult> {
        let mut result = SyncResult {
            files_added: 0,
            files_updated: 0,
            files_removed: 0,
            chunks_created: 0,
        };

        // Collect all memory files
        let mut memory_files = Vec::new();

        // Check MEMORY.md
        let memory_md = self.memory_md_path();
        if memory_md.exists() {
            memory_files.push(memory_md);
        }

        // Check .flowq/memories/ directory
        let memories_dir = self.memories_dir();
        if memories_dir.exists() {
            self.collect_markdown_files(&memories_dir, &mut memory_files);
        }

        // Get currently tracked files
        let tracked_files = self.get_tracked_files()?;
        let tracked_paths: std::collections::HashSet<String> =
            tracked_files.iter().map(|f| f.path.clone()).collect();

        // Process each memory file
        let mut current_paths = std::collections::HashSet::new();
        for file_path in memory_files {
            let relative_path = file_path
                .strip_prefix(&self.workspace)
                .unwrap_or(&file_path)
                .to_string_lossy()
                .to_string();

            current_paths.insert(relative_path.clone());

            // Check if file needs updating
            let file_info = self.get_file_info(&file_path)?;

            let needs_update = if let Some(tracked) = tracked_files.iter().find(|f| f.path == relative_path) {
                tracked.hash != file_info.hash || tracked.mtime != file_info.mtime
            } else {
                true
            };

            if needs_update {
                // Read and chunk the file
                let content = fs::read_to_string(&file_path).map_err(|e| {
                    rusqlite::Error::InvalidPath(PathBuf::from(format!("Failed to read file: {}", e)))
                })?;

                let chunks = chunk_markdown(&content);

                // Update file tracking
                if tracked_paths.contains(&relative_path) {
                    self.update_file(&file_info)?;
                    result.files_updated += 1;
                } else {
                    self.add_file(&file_info)?;
                    result.files_added += 1;
                }

                // Delete old chunks for this file
                self.delete_chunks_for_file(&relative_path)?;

                // Insert new chunks
                for chunk in chunks {
                    let chunk_id = format!("{}:{}:{}", relative_path, chunk.start_line, chunk.end_line);
                    let full_chunk = Chunk {
                        id: chunk_id,
                        path: relative_path.clone(),
                        start_line: chunk.start_line,
                        end_line: chunk.end_line,
                        text: chunk.text,
                        hash: chunk.hash,
                        created_at: chrono::Utc::now().timestamp(),
                    };
                    self.add_chunk(&full_chunk)?;
                    result.chunks_created += 1;
                }
            }
        }

        // Remove files that no longer exist
        for tracked in &tracked_files {
            if !current_paths.contains(&tracked.path) {
                self.delete_file(&tracked.path)?;
                result.files_removed += 1;
            }
        }

        Ok(result)
    }

    /// Collect all .md files from a directory recursively
    fn collect_markdown_files(&self, dir: &Path, files: &mut Vec<PathBuf>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    self.collect_markdown_files(&path, files);
                } else if path.extension().map_or(false, |ext| ext == "md") {
                    files.push(path);
                }
            }
        }
    }

    /// Get file info (hash, mtime, size)
    fn get_file_info(&self, path: &Path) -> Result<TrackedFile> {
        let content = fs::read(path).map_err(|e| {
            rusqlite::Error::InvalidPath(PathBuf::from(format!("Failed to read file: {}", e)))
        })?;

        let mut hasher = Sha256::new();
        hasher.update(&content);
        let hash = format!("{:x}", hasher.finalize());

        let metadata = fs::metadata(path).map_err(|e| {
            rusqlite::Error::InvalidPath(PathBuf::from(format!("Failed to get metadata: {}", e)))
        })?;

        let mtime = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let relative_path = path
            .strip_prefix(&self.workspace)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        Ok(TrackedFile {
            path: relative_path,
            hash,
            mtime,
            size: metadata.len() as i64,
        })
    }

    /// Get all tracked files
    fn get_tracked_files(&self) -> Result<Vec<TrackedFile>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT path, hash, mtime, size FROM files")?;

        let rows = stmt.query_map([], |row| {
            Ok(TrackedFile {
                path: row.get(0)?,
                hash: row.get(1)?,
                mtime: row.get(2)?,
                size: row.get(3)?,
            })
        })?;

        rows.collect()
    }

    /// Add a file to tracking
    fn add_file(&self, file: &TrackedFile) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO files (path, hash, mtime, size) VALUES (?1, ?2, ?3, ?4)",
            params![file.path, file.hash, file.mtime, file.size],
        )?;
        Ok(())
    }

    /// Update a tracked file
    fn update_file(&self, file: &TrackedFile) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE files SET hash = ?2, mtime = ?3, size = ?4 WHERE path = ?1",
            params![file.path, file.hash, file.mtime, file.size],
        )?;
        Ok(())
    }

    /// Delete a file from tracking (cascades to chunks)
    fn delete_file(&self, path: &str) -> Result<()> {
        // Delete from FTS first
        self.delete_chunks_for_file(path)?;

        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM files WHERE path = ?1", params![path])?;
        Ok(())
    }

    /// Add a chunk to the index
    fn add_chunk(&self, chunk: &Chunk) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Insert into chunks table
        conn.execute(
            "INSERT INTO chunks (id, path, start_line, end_line, text, hash, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                chunk.id,
                chunk.path,
                chunk.start_line,
                chunk.end_line,
                chunk.text,
                chunk.hash,
                chunk.created_at,
            ],
        )?;

        // Insert into FTS index
        conn.execute(
            "INSERT INTO chunks_fts (text, id, path, start_line, end_line)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                chunk.text,
                chunk.id,
                chunk.path,
                chunk.start_line,
                chunk.end_line,
            ],
        )?;

        Ok(())
    }

    /// Delete all chunks for a file
    fn delete_chunks_for_file(&self, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Delete from FTS first (using path column)
        conn.execute(
            "DELETE FROM chunks_fts WHERE path = ?1",
            params![path],
        )?;

        // Delete from chunks table
        conn.execute("DELETE FROM chunks WHERE path = ?1", params![path])?;

        Ok(())
    }

    /// Search memory using FTS5
    pub fn search(&self, query: &str, max_results: usize) -> Result<Vec<SearchResult>> {
        let conn = self.conn.lock().unwrap();

        // Build FTS5 query - wrap each term in quotes and join with AND
        let fts_query = query
            .split_whitespace()
            .map(|t| format!("\"{}\"", t.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" AND ");

        if fts_query.is_empty() {
            return Ok(Vec::new());
        }

        let sql = r#"
            SELECT f.path, f.start_line, f.end_line, c.text,
                   bm25(chunks_fts) as score
            FROM chunks_fts f
            JOIN chunks c ON c.id = f.id
            WHERE chunks_fts MATCH ?1
            ORDER BY score
            LIMIT ?2
        "#;

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![fts_query, max_results as i64], |row| {
            Ok(SearchResult {
                path: row.get(0)?,
                start_line: row.get(1)?,
                end_line: row.get(2)?,
                text: row.get(3)?,
                score: row.get(4)?,
            })
        })?;

        rows.collect()
    }

    /// Get all memory context as a formatted string
    pub fn get_context(&self) -> Result<String> {
        let mut context = String::new();

        // Read MEMORY.md if it exists
        let memory_md = self.memory_md_path();
        if memory_md.exists() {
            if let Ok(content) = fs::read_to_string(&memory_md) {
                context.push_str("## MEMORY.md\n\n");
                context.push_str(&content);
                context.push_str("\n\n");
            }
        }

        // Read files from .flowq/memories/
        let memories_dir = self.memories_dir();
        if memories_dir.exists() {
            let mut memory_files = Vec::new();
            self.collect_markdown_files(&memories_dir, &mut memory_files);

            for file_path in memory_files {
                if let Ok(content) = fs::read_to_string(&file_path) {
                    let relative_path = file_path
                        .strip_prefix(&self.workspace)
                        .unwrap_or(&file_path)
                        .to_string_lossy();

                    context.push_str(&format!("## {}\n\n", relative_path));
                    context.push_str(&content);
                    context.push_str("\n\n");
                }
            }
        }

        Ok(context)
    }

    /// Get statistics about the memory index
    pub fn get_stats(&self) -> Result<MemoryStats> {
        let conn = self.conn.lock().unwrap();

        let file_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files",
            [],
            |row| row.get(0),
        )?;

        let chunk_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM chunks",
            [],
            |row| row.get(0),
        )?;

        let total_size: i64 = conn.query_row(
            "SELECT COALESCE(SUM(size), 0) FROM files",
            [],
            |row| row.get(0),
        )?;

        Ok(MemoryStats {
            file_count: file_count as usize,
            chunk_count: chunk_count as usize,
            total_size_bytes: total_size as usize,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub file_count: usize,
    pub chunk_count: usize,
    pub total_size_bytes: usize,
}

// ============ Chunking Algorithm ============

/// Intermediate chunk structure (without full metadata)
struct RawChunk {
    start_line: u32,
    end_line: u32,
    text: String,
    hash: String,
}

/// Chunk markdown content into overlapping segments
fn chunk_markdown(content: &str) -> Vec<RawChunk> {
    let lines: Vec<&str> = content.lines().collect();
    let mut chunks = Vec::new();
    let mut current_lines: Vec<(u32, &str)> = Vec::new();
    let mut current_chars = 0;

    for (i, line) in lines.iter().enumerate() {
        let line_len = line.len() + 1; // +1 for newline

        if current_chars + line_len > MAX_CHARS_PER_CHUNK && !current_lines.is_empty() {
            // Flush current chunk
            let chunk_text: String = current_lines
                .iter()
                .map(|(_, l)| *l)
                .collect::<Vec<_>>()
                .join("\n");

            let mut hasher = Sha256::new();
            hasher.update(chunk_text.as_bytes());
            let hash = format!("{:x}", hasher.finalize());

            chunks.push(RawChunk {
                start_line: current_lines[0].0,
                end_line: current_lines.last().unwrap().0,
                text: chunk_text,
                hash,
            });

            // Keep overlap for next chunk
            let mut overlap_len = 0;
            let mut overlap_start = current_lines.len();
            for j in (0..current_lines.len()).rev() {
                overlap_len += current_lines[j].1.len() + 1;
                if overlap_len >= OVERLAP_CHARS {
                    overlap_start = j;
                    break;
                }
            }
            current_lines = current_lines[overlap_start..].to_vec();
            current_chars = current_lines.iter().map(|(_, l)| l.len() + 1).sum();
        }

        current_lines.push(((i + 1) as u32, *line)); // 1-indexed
        current_chars += line_len;
    }

    // Flush remaining
    if !current_lines.is_empty() {
        let chunk_text: String = current_lines
            .iter()
            .map(|(_, l)| *l)
            .collect::<Vec<_>>()
            .join("\n");

        let mut hasher = Sha256::new();
        hasher.update(chunk_text.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        chunks.push(RawChunk {
            start_line: current_lines[0].0,
            end_line: current_lines.last().unwrap().0,
            text: chunk_text,
            hash,
        });
    }

    chunks
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_chunk_markdown_small() {
        let content = "Line 1\nLine 2\nLine 3";
        let chunks = chunk_markdown(content);

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].start_line, 1);
        assert_eq!(chunks[0].end_line, 3);
        assert_eq!(chunks[0].text, "Line 1\nLine 2\nLine 3");
    }

    #[test]
    fn test_chunk_markdown_large() {
        // Create content larger than MAX_CHARS_PER_CHUNK
        let lines: Vec<String> = (1..=100)
            .map(|i| format!("This is line number {} with some additional content to make it longer.", i))
            .collect();
        let content = lines.join("\n");

        let chunks = chunk_markdown(&content);

        // Should have multiple chunks
        assert!(chunks.len() > 1);

        // Check overlap - subsequent chunks should start before previous ends
        for i in 1..chunks.len() {
            assert!(chunks[i].start_line <= chunks[i - 1].end_line);
        }
    }

    #[test]
    fn test_memory_index_create() {
        let dir = tempdir().unwrap();
        let workspace = dir.path();

        let index = MemoryIndex::open(workspace).unwrap();
        let stats = index.get_stats().unwrap();

        assert_eq!(stats.file_count, 0);
        assert_eq!(stats.chunk_count, 0);
    }

    #[test]
    fn test_memory_index_sync() {
        let dir = tempdir().unwrap();
        let workspace = dir.path();

        // Create MEMORY.md
        let memory_md = workspace.join("MEMORY.md");
        fs::write(&memory_md, "# Memory\n\nThis is a test memory file.\n").unwrap();

        let index = MemoryIndex::open(workspace).unwrap();
        let result = index.sync().unwrap();

        assert_eq!(result.files_added, 1);
        assert_eq!(result.files_updated, 0);
        assert!(result.chunks_created > 0);

        // Check stats
        let stats = index.get_stats().unwrap();
        assert_eq!(stats.file_count, 1);
        assert!(stats.chunk_count > 0);
    }

    #[test]
    fn test_memory_index_search() {
        let dir = tempdir().unwrap();
        let workspace = dir.path();

        // Create MEMORY.md with searchable content
        let memory_md = workspace.join("MEMORY.md");
        fs::write(
            &memory_md,
            "# Memory\n\nThis is a unique keyword for testing.\n\nAnother paragraph here.\n",
        )
        .unwrap();

        let index = MemoryIndex::open(workspace).unwrap();
        index.sync().unwrap();

        // Search for the unique keyword
        let results = index.search("unique keyword", 10).unwrap();

        assert!(!results.is_empty());
        assert!(results[0].text.contains("unique keyword"));
    }

    #[test]
    fn test_get_context() {
        let dir = tempdir().unwrap();
        let workspace = dir.path();

        // Create MEMORY.md
        let memory_md = workspace.join("MEMORY.md");
        fs::write(&memory_md, "# Memory\n\nTest content.\n").unwrap();

        let index = MemoryIndex::open(workspace).unwrap();
        let context = index.get_context().unwrap();

        assert!(context.contains("## MEMORY.md"));
        assert!(context.contains("Test content"));
    }
}
