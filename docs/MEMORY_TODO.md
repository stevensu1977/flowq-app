# FlowQ Memory System - Implementation Plan

> Unified memory storage for Chat and Agent modes with Markdown source + SQLite indexing.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 MEMORY.md (Source of Truth)                 │
│                 Human-readable, Git-friendly                │
└────────────────────────────┬────────────────────────────────┘
                             │ Parse + Chunk
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  SQLite Index (Index Layer)                 │
│              FTS5 Full-text + Optional Embeddings           │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Chat Mode     │  │   Agent Mode    │  │   Search API    │
│                 │  │                 │  │                 │
│ Memory Tool     │  │ Read MEMORY.md  │  │ FTS5 Keywords   │
│ R/W Markdown    │  │ Inject prompt   │  │ Vector Search   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Storage Structure

```
{workspace}/
├── CLAUDE.md              ← Project instructions (developer maintained)
├── MEMORY.md              ← FlowQ memory (AI + user maintained)
└── .flowq/
    ├── memory.sqlite      ← Index database
    │   ├── files          ← File tracking (hash, mtime)
    │   ├── chunks         ← Chunked content + metadata
    │   └── chunks_fts     ← FTS5 full-text index
    │
    └── memories/          ← Memory Tool operation directory
        ├── context.md     ← Project context
        ├── preferences.md ← User preferences
        └── sessions/      ← Session-specific memories
```

---

## Implementation Phases

### Phase 1: SQLite Memory Index ✅

**File:** `src-tauri/src/memory_index.rs`

**Tasks:**

- [x] Create SQLite schema for memory indexing
- [x] Implement file tracking (hash-based change detection)
- [x] Implement Markdown chunking algorithm
- [x] Implement FTS5 full-text indexing
- [x] Implement search API (keyword search)
- [x] Add Tauri commands for memory operations

**Schema:**

```sql
-- File tracking
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
);

-- Chunk storage
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (path) REFERENCES files(path) ON DELETE CASCADE
);

-- FTS5 full-text index
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  id UNINDEXED,
  path UNINDEXED,
  start_line UNINDEXED,
  end_line UNINDEXED
);
```

**Tauri Commands:**

```rust
#[tauri::command]
async fn memory_sync(workspace: String) -> Result<SyncResult, String>

#[tauri::command]
async fn memory_search(
    workspace: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String>

#[tauri::command]
async fn memory_get_context(workspace: String) -> Result<String, String>
```

---

### Phase 2: Memory Tool Backend (Chat Mode) ✅

**File:** `src-tauri/src/memory_tool.rs`

**Tasks:**

- [x] Implement `view` command (directory listing, file content with line numbers)
- [x] Implement `create` command (create new file)
- [x] Implement `str_replace` command (replace text in file)
- [x] Implement `insert` command (insert text at line)
- [x] Implement `delete` command (delete file/directory)
- [x] Implement `rename` command (rename/move file)
- [x] Add path traversal protection (security)
- [x] Trigger SQLite sync on write operations

**Tauri Commands:**

```rust
#[tauri::command]
async fn memory_tool_view(
    workspace: String,
    path: String,
    view_range: Option<(u32, u32)>,
) -> Result<String, String>

#[tauri::command]
async fn memory_tool_create(
    workspace: String,
    path: String,
    file_text: String,
) -> Result<String, String>

#[tauri::command]
async fn memory_tool_str_replace(
    workspace: String,
    path: String,
    old_str: String,
    new_str: String,
) -> Result<String, String>

#[tauri::command]
async fn memory_tool_insert(
    workspace: String,
    path: String,
    insert_line: u32,
    insert_text: String,
) -> Result<String, String>

#[tauri::command]
async fn memory_tool_delete(
    workspace: String,
    path: String,
) -> Result<String, String>

#[tauri::command]
async fn memory_tool_rename(
    workspace: String,
    old_path: String,
    new_path: String,
) -> Result<String, String>
```

---

### Phase 3: Chat Mode Integration ✅

**File:** `src-tauri/src/lib.rs` (modified `chat_send`), `src-tauri/src/chat.rs`

**Tasks:**

- [x] Inject memory context into system prompt when workspace is provided
- [x] Read MEMORY.md and .flowq/memories/ automatically
- [x] Combine memory context with user's system prompt
- [x] Implement Memory Tool with tool_use loop (Anthropic API)
- [x] Implement Memory Tool with tool_use loop (AWS Bedrock)
- [x] Add strong memory tool usage instructions to system prompt

**Implementation Details:**

1. **Memory Context Injection:** Reads existing memories from `.flowq/memories/` and injects into system prompt for all providers.

2. **Memory Tool (Anthropic + Bedrock):** Full tool_use implementation allowing AI to:
   - Save new memories with `create` command
   - Update existing memories with `str_replace`/`insert`
   - View memory files with `view`
   - Delete memories with `delete`

3. **Tool Use Loop:** Implements the full tool_use cycle for both Anthropic and Bedrock:
   - Send request with memory tool definition
   - Handle `stop_reason: "tool_use"` (Anthropic) or `StopReason::ToolUse` (Bedrock)
   - Execute memory operations via `MemoryTool`
   - Return `tool_result` and continue until `end_turn`

4. **System Prompt:** Strong directive to actually call the tool when user asks to remember something

**API Changes:**

```rust
// Add to Anthropic request
let tools = vec![
    serde_json::json!({
        "type": "memory_20250818",
        "name": "memory"
    })
];

// Add beta header
headers.insert("anthropic-beta", "context-management-2025-06-27");
```

**Tool Use Loop:**

```rust
loop {
    let response = send_to_anthropic(&messages, &tools).await?;

    match response.stop_reason {
        StopReason::EndTurn => break,
        StopReason::ToolUse => {
            for tool_use in response.tool_uses {
                if tool_use.name == "memory" {
                    let result = handle_memory_tool(workspace, tool_use.input).await?;
                    messages.push(tool_result(tool_use.id, result));
                }
            }
        }
    }
}
```

---

### Phase 4: Agent Mode Integration ✅

**File:** `src-tauri/src/lib.rs` (modify `send_message`)

**Tasks:**

- [x] Read memory files at session start
- [x] Inject memory context into system prompt
- [ ] Optional: Sync agent outputs back to memory (future enhancement)

**Implementation:**

```rust
async fn send_message(...) {
    // Read memory context
    let memory_context = memory_get_context(&workspace).await?;

    // Inject into prompt
    let enhanced_prompt = if !memory_context.is_empty() {
        format!(
            "## Memory Context\n{}\n\n## User Request\n{}",
            memory_context,
            user_prompt
        )
    } else {
        user_prompt
    };

    // Continue with Claude Agent SDK...
}
```

---

### Phase 5: Frontend Integration (Optional)

**File:** `components/MemoryPanel.tsx`

**Tasks:**

- [ ] Memory file browser UI
- [ ] Search interface with results
- [ ] Quick access to MEMORY.md
- [ ] Memory sync status indicator

---

## Chunking Algorithm

**Parameters:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `max_tokens` | 400 | Max tokens per chunk |
| `overlap` | 80 | Overlap tokens between chunks |
| `max_chars` | 1600 | ≈ max_tokens × 4 |

**Algorithm:**

```rust
fn chunk_markdown(content: &str, max_chars: usize, overlap_chars: usize) -> Vec<Chunk> {
    let lines: Vec<&str> = content.lines().collect();
    let mut chunks = Vec::new();
    let mut current_lines = Vec::new();
    let mut current_chars = 0;

    for (i, line) in lines.iter().enumerate() {
        let line_len = line.len() + 1; // +1 for newline

        if current_chars + line_len > max_chars && !current_lines.is_empty() {
            // Flush current chunk
            chunks.push(Chunk {
                start_line: current_lines[0].0,
                end_line: current_lines.last().unwrap().0,
                text: current_lines.iter().map(|(_, l)| *l).collect::<Vec<_>>().join("\n"),
            });

            // Keep overlap for next chunk
            let mut overlap_len = 0;
            let mut overlap_start = current_lines.len();
            for j in (0..current_lines.len()).rev() {
                overlap_len += current_lines[j].1.len() + 1;
                if overlap_len >= overlap_chars {
                    overlap_start = j;
                    break;
                }
            }
            current_lines = current_lines[overlap_start..].to_vec();
            current_chars = current_lines.iter().map(|(_, l)| l.len() + 1).sum();
        }

        current_lines.push((i + 1, *line)); // 1-indexed
        current_chars += line_len;
    }

    // Flush remaining
    if !current_lines.is_empty() {
        chunks.push(Chunk {
            start_line: current_lines[0].0,
            end_line: current_lines.last().unwrap().0,
            text: current_lines.iter().map(|(_, l)| *l).collect::<Vec<_>>().join("\n"),
        });
    }

    chunks
}
```

---

## Search Implementation

**FTS5 Search:**

```rust
fn search_fts(db: &Connection, query: &str, limit: usize) -> Vec<SearchResult> {
    // Build FTS5 query
    let fts_query = query
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" AND ");

    let sql = r#"
        SELECT c.path, c.start_line, c.end_line, c.text,
               bm25(chunks_fts) as score
        FROM chunks_fts f
        JOIN chunks c ON c.id = f.id
        WHERE chunks_fts MATCH ?
        ORDER BY score
        LIMIT ?
    "#;

    db.query(sql, [&fts_query, &limit.to_string()])
}
```

---

## Security Considerations

**Path Traversal Protection:**

```rust
fn validate_memory_path(workspace: &Path, requested_path: &str) -> Result<PathBuf, String> {
    let memories_dir = workspace.join(".flowq/memories");
    let requested = memories_dir.join(requested_path);
    let canonical = requested.canonicalize()
        .map_err(|_| "Invalid path")?;

    if !canonical.starts_with(&memories_dir) {
        return Err("Path traversal detected".to_string());
    }

    Ok(canonical)
}
```

**Blocked Patterns:**

- `../` and `..\\`
- URL-encoded sequences (`%2e%2e%2f`)
- Absolute paths
- Symlink escapes

---

## Configuration

**Default Config:**

```json
{
  "memory": {
    "enabled": true,
    "sync_on_change": true,
    "sync_debounce_ms": 1500,
    "chunking": {
      "max_tokens": 400,
      "overlap": 80
    },
    "search": {
      "max_results": 10,
      "min_score": 0.1
    }
  }
}
```

---

## Dependencies

**Rust (Cargo.toml):**

```toml
[dependencies]
rusqlite = { version = "0.31", features = ["bundled"] }
sha2 = "0.10"
```

**Note:** FTS5 is included in SQLite bundled with rusqlite.

---

## Testing Plan

- [ ] Unit tests for chunking algorithm
- [ ] Unit tests for FTS5 search
- [ ] Integration tests for Memory Tool commands
- [ ] E2E tests for Chat mode with memory
- [ ] E2E tests for Agent mode with memory injection
- [ ] Security tests for path traversal

---

## Timeline

| Phase | Description | Priority |
|-------|-------------|----------|
| 1 | SQLite Memory Index | P0 |
| 2 | Memory Tool Backend | P0 |
| 3 | Chat Mode Integration | P0 |
| 4 | Agent Mode Integration | P1 |
| 5 | Frontend UI | P2 |

---

## References

- [Anthropic Memory Tool Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [OpenClaw Memory System](../internal_docs/MEMORY_SYSTEM.md)
- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)

---

*Last updated: February 2025*
