//! Memory Tool Backend
//!
//! Implements file operations for the Memory Tool in Chat mode.
//! Based on Anthropic's Memory Tool specification.
//!
//! Operations:
//! - view: List directory or read file with line numbers
//! - create: Create a new file
//! - str_replace: Replace text in a file
//! - insert: Insert text at a specific line
//! - delete: Delete a file or directory
//! - rename: Rename/move a file

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::memory_index::MemoryIndex;

// ============ Types ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "command")]
pub enum MemoryToolCommand {
    #[serde(rename = "view")]
    View {
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        view_range: Option<(u32, u32)>,
    },
    #[serde(rename = "create")]
    Create {
        path: String,
        file_text: String,
    },
    #[serde(rename = "str_replace")]
    StrReplace {
        path: String,
        old_str: String,
        new_str: String,
    },
    #[serde(rename = "insert")]
    Insert {
        path: String,
        insert_line: u32,
        new_str: String,
    },
    #[serde(rename = "delete")]
    Delete {
        path: String,
    },
    #[serde(rename = "rename")]
    Rename {
        old_path: String,
        new_path: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryToolResult {
    pub success: bool,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl MemoryToolResult {
    fn success(output: String) -> Self {
        Self {
            success: true,
            output,
            error: None,
        }
    }

    fn error(message: String) -> Self {
        Self {
            success: false,
            output: String::new(),
            error: Some(message),
        }
    }
}

// ============ Memory Tool Handler ============

pub struct MemoryTool {
    workspace: PathBuf,
    memories_dir: PathBuf,
}

impl MemoryTool {
    /// Create a new MemoryTool for a workspace
    pub fn new(workspace: &Path) -> Self {
        let memories_dir = workspace.join(".flowq").join("memories");
        Self {
            workspace: workspace.to_path_buf(),
            memories_dir,
        }
    }

    /// Execute a memory tool command
    pub fn execute(&self, command: MemoryToolCommand) -> MemoryToolResult {
        match command {
            MemoryToolCommand::View { path, view_range } => self.view(&path, view_range),
            MemoryToolCommand::Create { path, file_text } => self.create(&path, &file_text),
            MemoryToolCommand::StrReplace { path, old_str, new_str } => {
                self.str_replace(&path, &old_str, &new_str)
            }
            MemoryToolCommand::Insert { path, insert_line, new_str } => {
                self.insert(&path, insert_line, &new_str)
            }
            MemoryToolCommand::Delete { path } => self.delete(&path),
            MemoryToolCommand::Rename { old_path, new_path } => self.rename(&old_path, &new_path),
        }
    }

    /// Validate and resolve a path within the memories directory
    fn resolve_path(&self, requested_path: &str) -> Result<PathBuf, String> {
        // Block obvious path traversal attempts
        if requested_path.contains("..") {
            return Err("Path traversal detected: '..' is not allowed".to_string());
        }

        // Block URL-encoded traversal
        if requested_path.contains("%2e") || requested_path.contains("%2E") {
            return Err("Path traversal detected: URL-encoded sequences not allowed".to_string());
        }

        // Block absolute paths
        if requested_path.starts_with('/') || requested_path.starts_with('\\') {
            return Err("Absolute paths are not allowed".to_string());
        }

        // Special case: empty path or "." means memories directory root
        let resolved = if requested_path.is_empty() || requested_path == "." {
            self.memories_dir.clone()
        } else {
            self.memories_dir.join(requested_path)
        };

        // Ensure the memories directory exists
        if !self.memories_dir.exists() {
            fs::create_dir_all(&self.memories_dir)
                .map_err(|e| format!("Failed to create memories directory: {}", e))?;
        }

        // For existing files/dirs, verify canonical path is within memories_dir
        if resolved.exists() {
            let canonical = resolved.canonicalize()
                .map_err(|e| format!("Failed to resolve path: {}", e))?;
            let memories_canonical = self.memories_dir.canonicalize()
                .map_err(|e| format!("Failed to resolve memories directory: {}", e))?;

            if !canonical.starts_with(&memories_canonical) {
                return Err("Path traversal detected: path escapes memories directory".to_string());
            }
        }

        Ok(resolved)
    }

    /// View command: list directory or read file
    fn view(&self, path: &str, view_range: Option<(u32, u32)>) -> MemoryToolResult {
        let resolved = match self.resolve_path(path) {
            Ok(p) => p,
            Err(e) => return MemoryToolResult::error(e),
        };

        if !resolved.exists() {
            return MemoryToolResult::error(format!("Path does not exist: {}", path));
        }

        if resolved.is_dir() {
            // List directory contents
            match self.list_directory(&resolved) {
                Ok(output) => MemoryToolResult::success(output),
                Err(e) => MemoryToolResult::error(e),
            }
        } else {
            // Read file with line numbers
            match self.read_file_with_lines(&resolved, view_range) {
                Ok(output) => MemoryToolResult::success(output),
                Err(e) => MemoryToolResult::error(e),
            }
        }
    }

    /// List directory contents
    fn list_directory(&self, dir: &Path) -> Result<String, String> {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut items: Vec<String> = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let file_type = entry.file_type()
                .map_err(|e| format!("Failed to get file type: {}", e))?;

            if file_type.is_dir() {
                items.push(format!("{}/", name));
            } else {
                items.push(name);
            }
        }

        items.sort();

        if items.is_empty() {
            Ok("(empty directory)".to_string())
        } else {
            Ok(items.join("\n"))
        }
    }

    /// Read file with line numbers
    fn read_file_with_lines(&self, file: &Path, view_range: Option<(u32, u32)>) -> Result<String, String> {
        let content = fs::read_to_string(file)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();

        let (start, end) = match view_range {
            Some((s, e)) => {
                let start = (s.saturating_sub(1)) as usize; // Convert to 0-indexed
                let end = (e as usize).min(total_lines);
                (start, end)
            }
            None => (0, total_lines),
        };

        let mut output = Vec::new();
        for (i, line) in lines.iter().enumerate().skip(start).take(end - start) {
            output.push(format!("{:4}| {}", i + 1, line));
        }

        if output.is_empty() {
            Ok("(empty file)".to_string())
        } else {
            Ok(output.join("\n"))
        }
    }

    /// Create command: create a new file
    fn create(&self, path: &str, file_text: &str) -> MemoryToolResult {
        let resolved = match self.resolve_path(path) {
            Ok(p) => p,
            Err(e) => return MemoryToolResult::error(e),
        };

        if resolved.exists() {
            return MemoryToolResult::error(format!("File already exists: {}", path));
        }

        // Create parent directories if needed
        if let Some(parent) = resolved.parent() {
            if !parent.exists() {
                if let Err(e) = fs::create_dir_all(parent) {
                    return MemoryToolResult::error(format!("Failed to create parent directory: {}", e));
                }
            }
        }

        // Write the file
        if let Err(e) = fs::write(&resolved, file_text) {
            return MemoryToolResult::error(format!("Failed to create file: {}", e));
        }

        // Trigger memory sync
        self.trigger_sync();

        MemoryToolResult::success(format!("File created: {}", path))
    }

    /// str_replace command: replace text in a file
    fn str_replace(&self, path: &str, old_str: &str, new_str: &str) -> MemoryToolResult {
        let resolved = match self.resolve_path(path) {
            Ok(p) => p,
            Err(e) => return MemoryToolResult::error(e),
        };

        if !resolved.exists() {
            return MemoryToolResult::error(format!("File does not exist: {}", path));
        }

        if !resolved.is_file() {
            return MemoryToolResult::error(format!("Path is not a file: {}", path));
        }

        // Read current content
        let content = match fs::read_to_string(&resolved) {
            Ok(c) => c,
            Err(e) => return MemoryToolResult::error(format!("Failed to read file: {}", e)),
        };

        // Check if old_str exists
        let count = content.matches(old_str).count();
        if count == 0 {
            return MemoryToolResult::error(format!(
                "String not found in file: '{}'",
                if old_str.len() > 50 { &old_str[..50] } else { old_str }
            ));
        }

        if count > 1 {
            return MemoryToolResult::error(format!(
                "String found {} times in file. Please provide a more unique string.",
                count
            ));
        }

        // Replace and write
        let new_content = content.replace(old_str, new_str);
        if let Err(e) = fs::write(&resolved, &new_content) {
            return MemoryToolResult::error(format!("Failed to write file: {}", e));
        }

        // Trigger memory sync
        self.trigger_sync();

        MemoryToolResult::success(format!("Successfully replaced text in {}", path))
    }

    /// insert command: insert text at a specific line
    fn insert(&self, path: &str, insert_line: u32, new_str: &str) -> MemoryToolResult {
        let resolved = match self.resolve_path(path) {
            Ok(p) => p,
            Err(e) => return MemoryToolResult::error(e),
        };

        if !resolved.exists() {
            return MemoryToolResult::error(format!("File does not exist: {}", path));
        }

        if !resolved.is_file() {
            return MemoryToolResult::error(format!("Path is not a file: {}", path));
        }

        // Read current content
        let content = match fs::read_to_string(&resolved) {
            Ok(c) => c,
            Err(e) => return MemoryToolResult::error(format!("Failed to read file: {}", e)),
        };

        let mut lines: Vec<&str> = content.lines().collect();
        let insert_idx = (insert_line.saturating_sub(1)) as usize;

        // Validate line number
        if insert_idx > lines.len() {
            return MemoryToolResult::error(format!(
                "Line number {} is beyond file length ({})",
                insert_line,
                lines.len()
            ));
        }

        // Insert the new lines
        let new_lines: Vec<&str> = new_str.lines().collect();
        for (i, line) in new_lines.iter().enumerate() {
            lines.insert(insert_idx + i, line);
        }

        // Write back
        let new_content = lines.join("\n");
        if let Err(e) = fs::write(&resolved, &new_content) {
            return MemoryToolResult::error(format!("Failed to write file: {}", e));
        }

        // Trigger memory sync
        self.trigger_sync();

        MemoryToolResult::success(format!(
            "Inserted {} line(s) at line {} in {}",
            new_lines.len(),
            insert_line,
            path
        ))
    }

    /// delete command: delete a file or directory
    fn delete(&self, path: &str) -> MemoryToolResult {
        let resolved = match self.resolve_path(path) {
            Ok(p) => p,
            Err(e) => return MemoryToolResult::error(e),
        };

        if !resolved.exists() {
            return MemoryToolResult::error(format!("Path does not exist: {}", path));
        }

        // Don't allow deleting the memories root
        if resolved == self.memories_dir {
            return MemoryToolResult::error("Cannot delete the memories root directory".to_string());
        }

        let result = if resolved.is_dir() {
            fs::remove_dir_all(&resolved)
        } else {
            fs::remove_file(&resolved)
        };

        if let Err(e) = result {
            return MemoryToolResult::error(format!("Failed to delete: {}", e));
        }

        // Trigger memory sync
        self.trigger_sync();

        MemoryToolResult::success(format!("Deleted: {}", path))
    }

    /// rename command: rename/move a file or directory
    fn rename(&self, old_path: &str, new_path: &str) -> MemoryToolResult {
        let old_resolved = match self.resolve_path(old_path) {
            Ok(p) => p,
            Err(e) => return MemoryToolResult::error(e),
        };

        let new_resolved = match self.resolve_path(new_path) {
            Ok(p) => p,
            Err(e) => return MemoryToolResult::error(e),
        };

        if !old_resolved.exists() {
            return MemoryToolResult::error(format!("Source path does not exist: {}", old_path));
        }

        if new_resolved.exists() {
            return MemoryToolResult::error(format!("Destination already exists: {}", new_path));
        }

        // Create parent directories for destination if needed
        if let Some(parent) = new_resolved.parent() {
            if !parent.exists() {
                if let Err(e) = fs::create_dir_all(parent) {
                    return MemoryToolResult::error(format!("Failed to create destination directory: {}", e));
                }
            }
        }

        if let Err(e) = fs::rename(&old_resolved, &new_resolved) {
            return MemoryToolResult::error(format!("Failed to rename: {}", e));
        }

        // Trigger memory sync
        self.trigger_sync();

        MemoryToolResult::success(format!("Renamed {} to {}", old_path, new_path))
    }

    /// Trigger memory index sync after write operations
    fn trigger_sync(&self) {
        // Best effort sync - don't fail the operation if sync fails
        if let Ok(index) = MemoryIndex::open(&self.workspace) {
            let _ = index.sync();
        }
    }
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_path_traversal_protection() {
        let dir = tempdir().unwrap();
        let tool = MemoryTool::new(dir.path());

        // Should block path traversal
        assert!(tool.resolve_path("../outside").is_err());
        assert!(tool.resolve_path("foo/../../../etc/passwd").is_err());
        assert!(tool.resolve_path("%2e%2e/outside").is_err());
        assert!(tool.resolve_path("/absolute/path").is_err());

        // Should allow valid paths
        assert!(tool.resolve_path("").is_ok());
        assert!(tool.resolve_path(".").is_ok());
        assert!(tool.resolve_path("notes.md").is_ok());
        assert!(tool.resolve_path("subdir/file.md").is_ok());
    }

    #[test]
    fn test_create_and_view() {
        let dir = tempdir().unwrap();
        let tool = MemoryTool::new(dir.path());

        // Create a file
        let result = tool.create("test.md", "Hello\nWorld");
        assert!(result.success);

        // View the file
        let result = tool.view("test.md", None);
        assert!(result.success);
        assert!(result.output.contains("Hello"));
        assert!(result.output.contains("World"));
    }

    #[test]
    fn test_str_replace() {
        let dir = tempdir().unwrap();
        let tool = MemoryTool::new(dir.path());

        // Create a file
        tool.create("test.md", "Hello World");

        // Replace text
        let result = tool.str_replace("test.md", "World", "FlowQ");
        assert!(result.success);

        // Verify
        let result = tool.view("test.md", None);
        assert!(result.output.contains("FlowQ"));
        assert!(!result.output.contains("World"));
    }

    #[test]
    fn test_insert() {
        let dir = tempdir().unwrap();
        let tool = MemoryTool::new(dir.path());

        // Create a file
        tool.create("test.md", "Line 1\nLine 3");

        // Insert at line 2
        let result = tool.insert("test.md", 2, "Line 2");
        assert!(result.success);

        // Verify
        let result = tool.view("test.md", None);
        assert!(result.output.contains("Line 1"));
        assert!(result.output.contains("Line 2"));
        assert!(result.output.contains("Line 3"));
    }

    #[test]
    fn test_delete() {
        let dir = tempdir().unwrap();
        let tool = MemoryTool::new(dir.path());

        // Create a file
        tool.create("test.md", "Content");

        // Delete it
        let result = tool.delete("test.md");
        assert!(result.success);

        // Verify it's gone
        let result = tool.view("test.md", None);
        assert!(!result.success);
    }

    #[test]
    fn test_rename() {
        let dir = tempdir().unwrap();
        let tool = MemoryTool::new(dir.path());

        // Create a file
        tool.create("old.md", "Content");

        // Rename it
        let result = tool.rename("old.md", "new.md");
        assert!(result.success);

        // Verify
        let result = tool.view("old.md", None);
        assert!(!result.success);

        let result = tool.view("new.md", None);
        assert!(result.success);
        assert!(result.output.contains("Content"));
    }

    #[test]
    fn test_view_directory() {
        let dir = tempdir().unwrap();
        let tool = MemoryTool::new(dir.path());

        // Create some files
        tool.create("file1.md", "Content 1");
        tool.create("file2.md", "Content 2");
        tool.create("subdir/file3.md", "Content 3");

        // View root directory
        let result = tool.view("", None);
        assert!(result.success);
        assert!(result.output.contains("file1.md"));
        assert!(result.output.contains("file2.md"));
        assert!(result.output.contains("subdir/"));
    }
}
