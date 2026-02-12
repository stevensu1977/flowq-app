//! SQLite storage for RSS feeds and articles

use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::Manager;

/// RSS feed stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredFeed {
    pub id: String,
    pub url: String,
    pub title: String,
    pub description: Option<String>,
    pub site_url: Option<String>,
    pub icon_url: Option<String>,
    pub category_id: Option<String>,
    pub tags: Vec<String>,
    pub status: String,  // 'active' | 'paused' | 'error'
    pub error_message: Option<String>,
    pub last_fetched_at: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub article_count: i32,
    pub unread_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// RSS category stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCategory {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub feed_count: i32,
    pub created_at: String,
}

/// RSS article stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredArticle {
    pub id: String,
    pub feed_id: String,
    pub title: String,
    pub link: String,
    pub content: String,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub image_url: Option<String>,
    pub enclosures: Option<String>,  // JSON array
    pub published_at: String,
    pub fetched_at: String,
    pub is_read: bool,
    pub is_starred: bool,
    pub topics: Option<String>,  // JSON array
}

/// RSS database manager
pub struct RSSDatabase {
    conn: Arc<Mutex<Connection>>,
}

impl RSSDatabase {
    /// Open or create RSS database
    pub fn open(path: &Path) -> SqliteResult<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_tables()?;
        Ok(db)
    }

    /// Initialize RSS tables
    fn init_tables(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS rss_feeds (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                description TEXT,
                site_url TEXT,
                icon_url TEXT,
                category_id TEXT,
                tags TEXT DEFAULT '[]',
                status TEXT DEFAULT 'active',
                error_message TEXT,
                last_fetched_at TEXT,
                etag TEXT,
                last_modified TEXT,
                article_count INTEGER DEFAULT 0,
                unread_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rss_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT,
                created_at TEXT NOT NULL
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
                enclosures TEXT,
                published_at TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                is_starred INTEGER DEFAULT 0,
                topics TEXT,
                FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_rss_articles_feed ON rss_articles(feed_id);
            CREATE INDEX IF NOT EXISTS idx_rss_articles_published ON rss_articles(published_at DESC);
            CREATE INDEX IF NOT EXISTS idx_rss_articles_unread ON rss_articles(feed_id, is_read);
            CREATE INDEX IF NOT EXISTS idx_rss_articles_starred ON rss_articles(is_starred);

            -- Full-text search for articles
            CREATE VIRTUAL TABLE IF NOT EXISTS rss_articles_fts USING fts5(
                title, content,
                content='rss_articles',
                content_rowid='rowid'
            );

            -- Triggers to keep FTS index in sync
            CREATE TRIGGER IF NOT EXISTS rss_articles_ai AFTER INSERT ON rss_articles BEGIN
                INSERT INTO rss_articles_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
            END;

            CREATE TRIGGER IF NOT EXISTS rss_articles_ad AFTER DELETE ON rss_articles BEGIN
                INSERT INTO rss_articles_fts(rss_articles_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
            END;

            CREATE TRIGGER IF NOT EXISTS rss_articles_au AFTER UPDATE ON rss_articles BEGIN
                INSERT INTO rss_articles_fts(rss_articles_fts, rowid, title, content) VALUES('delete', OLD.rowid, OLD.title, OLD.content);
                INSERT INTO rss_articles_fts(rowid, title, content) VALUES (NEW.rowid, NEW.title, NEW.content);
            END;
        "#)?;
        Ok(())
    }

    // ============ Feed Operations ============

    /// Create a new feed
    pub fn create_feed(&self, feed: &StoredFeed) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO rss_feeds (id, url, title, description, site_url, icon_url, category_id, tags, status, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"#,
            params![
                feed.id,
                feed.url,
                feed.title,
                feed.description,
                feed.site_url,
                feed.icon_url,
                feed.category_id,
                serde_json::to_string(&feed.tags).unwrap_or_else(|_| "[]".to_string()),
                feed.status,
                feed.created_at,
                feed.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Get all feeds
    pub fn get_feeds(&self) -> SqliteResult<Vec<StoredFeed>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, url, title, description, site_url, icon_url, category_id, tags,
                      status, error_message, last_fetched_at, etag, last_modified,
                      article_count, unread_count, created_at, updated_at
               FROM rss_feeds ORDER BY title"#,
        )?;

        let feeds = stmt.query_map([], |row| {
            let tags_json: String = row.get(7)?;
            Ok(StoredFeed {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                site_url: row.get(4)?,
                icon_url: row.get(5)?,
                category_id: row.get(6)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                status: row.get(8)?,
                error_message: row.get(9)?,
                last_fetched_at: row.get(10)?,
                etag: row.get(11)?,
                last_modified: row.get(12)?,
                article_count: row.get(13)?,
                unread_count: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })?
        .collect::<SqliteResult<Vec<_>>>()?;

        Ok(feeds)
    }

    /// Get a feed by ID
    pub fn get_feed(&self, id: &str) -> SqliteResult<Option<StoredFeed>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, url, title, description, site_url, icon_url, category_id, tags,
                      status, error_message, last_fetched_at, etag, last_modified,
                      article_count, unread_count, created_at, updated_at
               FROM rss_feeds WHERE id = ?1"#,
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let tags_json: String = row.get(7)?;
            Ok(Some(StoredFeed {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                site_url: row.get(4)?,
                icon_url: row.get(5)?,
                category_id: row.get(6)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                status: row.get(8)?,
                error_message: row.get(9)?,
                last_fetched_at: row.get(10)?,
                etag: row.get(11)?,
                last_modified: row.get(12)?,
                article_count: row.get(13)?,
                unread_count: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Update a feed
    pub fn update_feed(&self, feed: &StoredFeed) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"UPDATE rss_feeds SET
                title = ?2, description = ?3, site_url = ?4, icon_url = ?5,
                category_id = ?6, tags = ?7, status = ?8, error_message = ?9,
                last_fetched_at = ?10, etag = ?11, last_modified = ?12,
                article_count = ?13, unread_count = ?14, updated_at = ?15
               WHERE id = ?1"#,
            params![
                feed.id,
                feed.title,
                feed.description,
                feed.site_url,
                feed.icon_url,
                feed.category_id,
                serde_json::to_string(&feed.tags).unwrap_or_else(|_| "[]".to_string()),
                feed.status,
                feed.error_message,
                feed.last_fetched_at,
                feed.etag,
                feed.last_modified,
                feed.article_count,
                feed.unread_count,
                feed.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Delete a feed and all its articles
    pub fn delete_feed(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        // Articles will be cascade deleted
        conn.execute("DELETE FROM rss_feeds WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ============ Category Operations ============

    /// Create a new category
    pub fn create_category(&self, category: &StoredCategory) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO rss_categories (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![category.id, category.name, category.color, category.created_at],
        )?;
        Ok(())
    }

    /// Get all categories with feed counts
    pub fn get_categories(&self) -> SqliteResult<Vec<StoredCategory>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT c.id, c.name, c.color, c.created_at,
                      (SELECT COUNT(*) FROM rss_feeds WHERE category_id = c.id) as feed_count
               FROM rss_categories c ORDER BY c.name"#,
        )?;

        let categories = stmt.query_map([], |row| {
            Ok(StoredCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
                feed_count: row.get(4)?,
            })
        })?
        .collect::<SqliteResult<Vec<_>>>()?;

        Ok(categories)
    }

    /// Delete a category (feeds remain but lose their category)
    pub fn delete_category(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        // Update feeds to remove category reference
        conn.execute(
            "UPDATE rss_feeds SET category_id = NULL WHERE category_id = ?1",
            params![id],
        )?;
        conn.execute("DELETE FROM rss_categories WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ============ Article Operations ============

    /// Insert or update an article
    pub fn upsert_article(&self, article: &StoredArticle) -> SqliteResult<bool> {
        let conn = self.conn.lock().unwrap();

        // Check if article exists
        let exists: bool = conn.query_row(
            "SELECT 1 FROM rss_articles WHERE id = ?1",
            params![article.id],
            |_| Ok(true),
        ).unwrap_or(false);

        if exists {
            // Update existing article (keep read/starred state)
            conn.execute(
                r#"UPDATE rss_articles SET
                    title = ?2, link = ?3, content = ?4, summary = ?5, author = ?6,
                    image_url = ?7, enclosures = ?8, published_at = ?9
                   WHERE id = ?1"#,
                params![
                    article.id,
                    article.title,
                    article.link,
                    article.content,
                    article.summary,
                    article.author,
                    article.image_url,
                    article.enclosures,
                    article.published_at,
                ],
            )?;
            Ok(false) // Not a new article
        } else {
            // Insert new article
            conn.execute(
                r#"INSERT INTO rss_articles (id, feed_id, title, link, content, summary, author,
                                             image_url, enclosures, published_at, fetched_at,
                                             is_read, is_starred, topics)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"#,
                params![
                    article.id,
                    article.feed_id,
                    article.title,
                    article.link,
                    article.content,
                    article.summary,
                    article.author,
                    article.image_url,
                    article.enclosures,
                    article.published_at,
                    article.fetched_at,
                    article.is_read,
                    article.is_starred,
                    article.topics,
                ],
            )?;
            Ok(true) // New article
        }
    }

    /// Get articles for a feed
    pub fn get_articles_for_feed(&self, feed_id: &str, limit: i32) -> SqliteResult<Vec<StoredArticle>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, feed_id, title, link, content, summary, author, image_url, enclosures,
                      published_at, fetched_at, is_read, is_starred, topics
               FROM rss_articles WHERE feed_id = ?1
               ORDER BY published_at DESC LIMIT ?2"#,
        )?;

        let articles = stmt.query_map(params![feed_id, limit], Self::row_to_article)?
            .collect::<SqliteResult<Vec<_>>>()?;

        Ok(articles)
    }

    /// Get recent articles across all feeds
    pub fn get_recent_articles(&self, hours: i32, limit: i32) -> SqliteResult<Vec<StoredArticle>> {
        let conn = self.conn.lock().unwrap();
        let cutoff = chrono::Utc::now() - chrono::Duration::hours(hours as i64);
        let cutoff_str = cutoff.to_rfc3339();

        let mut stmt = conn.prepare(
            r#"SELECT id, feed_id, title, link, content, summary, author, image_url, enclosures,
                      published_at, fetched_at, is_read, is_starred, topics
               FROM rss_articles WHERE published_at >= ?1
               ORDER BY published_at DESC LIMIT ?2"#,
        )?;

        let articles = stmt.query_map(params![cutoff_str, limit], Self::row_to_article)?
            .collect::<SqliteResult<Vec<_>>>()?;

        Ok(articles)
    }

    /// Search articles using full-text search
    pub fn search_articles(&self, query: &str, limit: i32) -> SqliteResult<Vec<StoredArticle>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT a.id, a.feed_id, a.title, a.link, a.content, a.summary, a.author,
                      a.image_url, a.enclosures, a.published_at, a.fetched_at,
                      a.is_read, a.is_starred, a.topics
               FROM rss_articles a
               JOIN rss_articles_fts fts ON a.rowid = fts.rowid
               WHERE rss_articles_fts MATCH ?1
               ORDER BY a.published_at DESC LIMIT ?2"#,
        )?;

        let articles = stmt.query_map(params![query, limit], Self::row_to_article)?
            .collect::<SqliteResult<Vec<_>>>()?;

        Ok(articles)
    }

    /// Mark article as read
    pub fn mark_article_read(&self, id: &str, is_read: bool) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE rss_articles SET is_read = ?2 WHERE id = ?1",
            params![id, is_read],
        )?;
        Ok(())
    }

    /// Toggle article starred status
    pub fn toggle_article_starred(&self, id: &str) -> SqliteResult<bool> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE rss_articles SET is_starred = NOT is_starred WHERE id = ?1",
            params![id],
        )?;

        let is_starred: bool = conn.query_row(
            "SELECT is_starred FROM rss_articles WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        Ok(is_starred)
    }

    /// Get starred articles
    pub fn get_starred_articles(&self, limit: i32) -> SqliteResult<Vec<StoredArticle>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, feed_id, title, link, content, summary, author, image_url, enclosures,
                      published_at, fetched_at, is_read, is_starred, topics
               FROM rss_articles WHERE is_starred = 1
               ORDER BY published_at DESC LIMIT ?1"#,
        )?;

        let articles = stmt.query_map(params![limit], Self::row_to_article)?
            .collect::<SqliteResult<Vec<_>>>()?;

        Ok(articles)
    }

    /// Delete old articles (retention cleanup)
    pub fn delete_old_articles(&self, days: i32) -> SqliteResult<i32> {
        let conn = self.conn.lock().unwrap();
        let cutoff = chrono::Utc::now() - chrono::Duration::days(days as i64);
        let cutoff_str = cutoff.to_rfc3339();

        // Don't delete starred articles
        let deleted = conn.execute(
            "DELETE FROM rss_articles WHERE published_at < ?1 AND is_starred = 0",
            params![cutoff_str],
        )?;

        Ok(deleted as i32)
    }

    /// Update feed article counts
    pub fn update_feed_counts(&self, feed_id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"UPDATE rss_feeds SET
                article_count = (SELECT COUNT(*) FROM rss_articles WHERE feed_id = ?1),
                unread_count = (SELECT COUNT(*) FROM rss_articles WHERE feed_id = ?1 AND is_read = 0)
               WHERE id = ?1"#,
            params![feed_id],
        )?;
        Ok(())
    }

    // Helper to convert row to StoredArticle
    fn row_to_article(row: &rusqlite::Row) -> SqliteResult<StoredArticle> {
        Ok(StoredArticle {
            id: row.get(0)?,
            feed_id: row.get(1)?,
            title: row.get(2)?,
            link: row.get(3)?,
            content: row.get(4)?,
            summary: row.get(5)?,
            author: row.get(6)?,
            image_url: row.get(7)?,
            enclosures: row.get(8)?,
            published_at: row.get(9)?,
            fetched_at: row.get(10)?,
            is_read: row.get(11)?,
            is_starred: row.get(12)?,
            topics: row.get(13)?,
        })
    }
}

// ============ Global Instance ============

use std::sync::OnceLock;

static RSS_DB: OnceLock<Arc<RSSDatabase>> = OnceLock::new();

/// Initialize or get the RSS database instance
pub fn get_rss_db(app_data_dir: &Path) -> Arc<RSSDatabase> {
    RSS_DB.get_or_init(|| {
        let db_path = app_data_dir.join("rss.db");
        log::info!("Initializing RSS database at: {:?}", db_path);
        Arc::new(RSSDatabase::open(&db_path).expect("Failed to open RSS database"))
    }).clone()
}

// ============ Tauri Commands ============

use tauri::AppHandle;

/// Get all RSS feeds
#[tauri::command]
pub fn rss_get_feeds(app: AppHandle) -> Result<Vec<StoredFeed>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.get_feeds().map_err(|e| e.to_string())
}

/// Create a new RSS feed
#[tauri::command]
pub fn rss_create_feed(app: AppHandle, feed: StoredFeed) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.create_feed(&feed).map_err(|e| e.to_string())
}

/// Update an existing RSS feed
#[tauri::command]
pub fn rss_update_feed(app: AppHandle, feed: StoredFeed) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.update_feed(&feed).map_err(|e| e.to_string())
}

/// Delete an RSS feed
#[tauri::command]
pub fn rss_delete_feed(app: AppHandle, id: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.delete_feed(&id).map_err(|e| e.to_string())
}

/// Get all categories
#[tauri::command]
pub fn rss_get_categories(app: AppHandle) -> Result<Vec<StoredCategory>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.get_categories().map_err(|e| e.to_string())
}

/// Create a new category
#[tauri::command]
pub fn rss_create_category(app: AppHandle, category: StoredCategory) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.create_category(&category).map_err(|e| e.to_string())
}

/// Delete a category
#[tauri::command]
pub fn rss_delete_category(app: AppHandle, id: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.delete_category(&id).map_err(|e| e.to_string())
}

/// Insert or update articles (batch)
#[tauri::command]
pub fn rss_upsert_articles(app: AppHandle, articles: Vec<StoredArticle>) -> Result<i32, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);

    let mut new_count = 0;
    for article in &articles {
        if db.upsert_article(article).map_err(|e| e.to_string())? {
            new_count += 1;
        }
    }

    // Update feed counts
    if let Some(first) = articles.first() {
        db.update_feed_counts(&first.feed_id).map_err(|e| e.to_string())?;
    }

    Ok(new_count)
}

/// Get articles for a feed
#[tauri::command]
pub fn rss_get_articles(app: AppHandle, feed_id: String, limit: i32) -> Result<Vec<StoredArticle>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.get_articles_for_feed(&feed_id, limit).map_err(|e| e.to_string())
}

/// Get recent articles across all feeds
#[tauri::command]
pub fn rss_get_recent_articles(app: AppHandle, hours: i32, limit: i32) -> Result<Vec<StoredArticle>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.get_recent_articles(hours, limit).map_err(|e| e.to_string())
}

/// Search articles
#[tauri::command]
pub fn rss_search_articles(app: AppHandle, query: String, limit: i32) -> Result<Vec<StoredArticle>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.search_articles(&query, limit).map_err(|e| e.to_string())
}

/// Mark article as read
#[tauri::command]
pub fn rss_mark_article_read(app: AppHandle, id: String, is_read: bool) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.mark_article_read(&id, is_read).map_err(|e| e.to_string())
}

/// Toggle article starred status
#[tauri::command]
pub fn rss_toggle_article_starred(app: AppHandle, id: String) -> Result<bool, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.toggle_article_starred(&id).map_err(|e| e.to_string())
}

/// Get starred articles
#[tauri::command]
pub fn rss_get_starred_articles(app: AppHandle, limit: i32) -> Result<Vec<StoredArticle>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.get_starred_articles(limit).map_err(|e| e.to_string())
}

/// Delete old articles
#[tauri::command]
pub fn rss_cleanup_old_articles(app: AppHandle, days: i32) -> Result<i32, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db = get_rss_db(&app_data_dir);
    db.delete_old_articles(days).map_err(|e| e.to_string())
}
