//! Skills Management Module
//!
//! Manages skills stored in ~/.claude/skills/
//! Each skill is a directory containing SKILL.md and optional .metadata.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ============ Types ============

/// Skill information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub path: String,
    pub token_count: Option<u64>,
}

/// Skill metadata (stored in .metadata.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    pub name: String,
    pub description: Option<String>,
    pub source: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub installed_at: String,
    pub updated_at: String,
}

/// File item for browsing skill contents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
}

/// Search result from skills.sh
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchSkill {
    pub name: String,
    pub slug: String,
    pub source: String,
    pub installs: u64,
}

/// Request to install a skill from content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallSkillRequest {
    pub content: String,
    pub filename: String,
}

// ============ Error Type ============

#[derive(Debug)]
pub enum SkillError {
    HomeNotFound,
    IoError(std::io::Error),
    JsonError(serde_json::Error),
    SkillNotFound(String),
    SkillMdNotFound(String),
    NetworkError(String),
    ZipError(String),
}

impl std::fmt::Display for SkillError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SkillError::HomeNotFound => write!(f, "Could not find home directory"),
            SkillError::IoError(e) => write!(f, "IO error: {}", e),
            SkillError::JsonError(e) => write!(f, "JSON error: {}", e),
            SkillError::SkillNotFound(name) => write!(f, "Skill not found: {}", name),
            SkillError::SkillMdNotFound(name) => write!(f, "SKILL.md not found for: {}", name),
            SkillError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            SkillError::ZipError(msg) => write!(f, "ZIP error: {}", msg),
        }
    }
}

impl From<std::io::Error> for SkillError {
    fn from(e: std::io::Error) -> Self {
        SkillError::IoError(e)
    }
}

impl From<serde_json::Error> for SkillError {
    fn from(e: serde_json::Error) -> Self {
        SkillError::JsonError(e)
    }
}

pub type Result<T> = std::result::Result<T, SkillError>;

// ============ Skills Manager ============

/// Skills manager for Claude
pub struct SkillManager;

impl SkillManager {
    /// Get the skills directory path
    fn skills_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or(SkillError::HomeNotFound)?;
        Ok(home.join(".claude").join("skills"))
    }

    /// Ensure skills directory exists
    fn ensure_skills_dir() -> Result<PathBuf> {
        let dir = Self::skills_dir()?;
        if !dir.exists() {
            fs::create_dir_all(&dir)?;
        }
        Ok(dir)
    }

    /// Find SKILL.md in a skill directory (case-insensitive)
    fn find_skill_md(skill_dir: &PathBuf) -> Option<PathBuf> {
        let variants = ["SKILL.md", "skill.md", "Skill.md"];
        for variant in variants {
            let path = skill_dir.join(variant);
            if path.exists() {
                return Some(path);
            }
        }
        None
    }

    /// List all installed skills
    pub fn list() -> Result<Vec<SkillInfo>> {
        let skills_dir = Self::skills_dir()?;

        if !skills_dir.exists() {
            return Ok(Vec::new());
        }

        let mut skills = Vec::new();

        for entry in fs::read_dir(&skills_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                let name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                // Skip hidden directories
                if name.starts_with('.') {
                    continue;
                }

                // Calculate token count from SKILL.md size
                let token_count = Self::find_skill_md(&path)
                    .and_then(|p| fs::metadata(&p).ok())
                    .map(|m| m.len() / 4); // Approximate token count

                skills.push(SkillInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    token_count,
                });
            }
        }

        skills.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(skills)
    }

    /// Get skill content (SKILL.md)
    pub fn get_content(name: &str) -> Result<String> {
        let skills_dir = Self::skills_dir()?;
        let skill_dir = skills_dir.join(name);

        if !skill_dir.exists() {
            return Err(SkillError::SkillNotFound(name.to_string()));
        }

        let skill_md = Self::find_skill_md(&skill_dir)
            .ok_or_else(|| SkillError::SkillMdNotFound(name.to_string()))?;

        Ok(fs::read_to_string(skill_md)?)
    }

    /// Get skill metadata
    pub fn get_metadata(name: &str) -> Result<Option<SkillMetadata>> {
        let skills_dir = Self::skills_dir()?;
        let metadata_path = skills_dir.join(name).join(".metadata.json");

        if !metadata_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&metadata_path)?;
        let metadata: SkillMetadata = serde_json::from_str(&content)?;
        Ok(Some(metadata))
    }

    /// List files in a skill directory
    pub fn list_files(name: &str, subpath: Option<&str>) -> Result<Vec<FileItem>> {
        let skills_dir = Self::skills_dir()?;
        let mut target_dir = skills_dir.join(name);

        if let Some(sub) = subpath {
            target_dir = target_dir.join(sub);
        }

        if !target_dir.exists() {
            return Err(SkillError::SkillNotFound(name.to_string()));
        }

        let mut items = Vec::new();

        for entry in fs::read_dir(&target_dir)? {
            let entry = entry?;
            let path = entry.path();
            let file_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // Skip hidden files except .metadata.json
            if file_name.starts_with('.') && file_name != ".metadata.json" {
                continue;
            }

            let is_directory = path.is_dir();
            let size = if is_directory {
                None
            } else {
                fs::metadata(&path).ok().map(|m| m.len())
            };

            // Calculate relative path from skill directory
            let rel_path = if let Some(sub) = subpath {
                format!("{}/{}", sub, file_name)
            } else {
                file_name.clone()
            };

            items.push(FileItem {
                name: file_name,
                path: rel_path,
                is_directory,
                size,
            });
        }

        // Sort: directories first, then by name
        items.sort_by(|a, b| {
            match (a.is_directory, b.is_directory) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.cmp(&b.name),
            }
        });

        Ok(items)
    }

    /// Read a file from a skill
    pub fn read_file(name: &str, file_path: &str) -> Result<String> {
        let skills_dir = Self::skills_dir()?;
        let skill_dir = skills_dir.join(name);
        let full_path = skill_dir.join(file_path);

        // Security check: ensure path doesn't escape skill directory
        let canonical = full_path.canonicalize()?;
        let skill_canonical = skill_dir.canonicalize()?;

        if !canonical.starts_with(&skill_canonical) {
            return Err(SkillError::IoError(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "Access denied: path outside skill directory",
            )));
        }

        Ok(fs::read_to_string(&canonical)?)
    }

    /// Install skill from content (markdown file)
    pub fn install_from_content(content: &str, filename: &str) -> Result<String> {
        let name = Self::extract_skill_name(content, filename);
        let sanitized_name = Self::sanitize_name(&name);

        let skills_dir = Self::ensure_skills_dir()?;
        let skill_dir = skills_dir.join(&sanitized_name);

        // Create skill directory
        fs::create_dir_all(&skill_dir)?;

        // Write SKILL.md
        fs::write(skill_dir.join("SKILL.md"), content)?;

        // Save metadata
        Self::save_metadata(&skill_dir, &name, None)?;

        Ok(format!("Installed: {}", name))
    }

    /// Install skill from URL (GitHub directory or direct file)
    pub async fn install_from_url(url: &str) -> Result<String> {
        // Check if it's a GitHub directory URL
        if url.contains("github.com") && url.contains("/tree/") {
            return Self::install_from_github_dir(url).await;
        }

        // Otherwise, try to fetch as a direct file
        let client = reqwest::Client::builder()
            .user_agent("Craft-Agent/1.0")
            .build()
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        let response = client.get(url).send().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SkillError::NetworkError(format!(
                "Failed to fetch URL: {}",
                response.status()
            )));
        }

        let content = response.text().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        let filename = url.rsplit('/').next().unwrap_or("skill");
        Self::install_from_content(&content, filename)
    }

    /// Install skill from GitHub directory URL
    async fn install_from_github_dir(url: &str) -> Result<String> {
        // Parse GitHub URL: https://github.com/owner/repo/tree/branch/path
        let parts: Vec<&str> = url
            .trim_start_matches("https://")
            .trim_start_matches("github.com/")
            .split('/')
            .collect();

        if parts.len() < 4 || parts[2] != "tree" {
            return Err(SkillError::NetworkError("Invalid GitHub URL format".to_string()));
        }

        let owner = parts[0];
        let repo = parts[1];
        let branch = parts[3];
        let path = if parts.len() > 4 {
            parts[4..].join("/")
        } else {
            String::new()
        };

        let client = reqwest::Client::builder()
            .user_agent("Craft-Agent/1.0")
            .build()
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        // Fetch directory contents from GitHub API
        let api_url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
            owner, repo, path, branch
        );

        let response = client.get(&api_url).send().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SkillError::NetworkError(format!(
                "GitHub API error: {}",
                response.status()
            )));
        }

        let contents: Vec<serde_json::Value> = response.json().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        // Find SKILL.md
        let skill_md_entry = contents.iter()
            .find(|item| {
                item.get("name")
                    .and_then(|n| n.as_str())
                    .map(|n| n.eq_ignore_ascii_case("SKILL.md"))
                    .unwrap_or(false)
            });

        let skill_md_url = skill_md_entry
            .and_then(|item| item.get("download_url"))
            .and_then(|url| url.as_str())
            .ok_or_else(|| SkillError::SkillMdNotFound("repository".to_string()))?;

        // Fetch SKILL.md content
        let skill_response = client.get(skill_md_url).send().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        let skill_content = skill_response.text().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        // Extract skill name and create directory
        let name = Self::extract_skill_name(&skill_content, &path);
        let sanitized_name = Self::sanitize_name(&name);

        let skills_dir = Self::ensure_skills_dir()?;
        let skill_dir = skills_dir.join(&sanitized_name);
        fs::create_dir_all(&skill_dir)?;

        // Download all files recursively
        Self::download_github_files(&client, &contents, &skill_dir, owner, repo, branch).await?;

        // Save metadata
        Self::save_metadata(&skill_dir, &name, Some(url.to_string()))?;

        Ok(format!("Installed: {}", name))
    }

    /// Recursively download files from GitHub
    async fn download_github_files(
        client: &reqwest::Client,
        contents: &[serde_json::Value],
        target_dir: &PathBuf,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> Result<()> {
        for item in contents {
            let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            let item_name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let item_path = item.get("path").and_then(|p| p.as_str()).unwrap_or("");

            if item_type == "file" {
                if let Some(download_url) = item.get("download_url").and_then(|u| u.as_str()) {
                    let response = client.get(download_url).send().await
                        .map_err(|e| SkillError::NetworkError(e.to_string()))?;

                    let content = response.bytes().await
                        .map_err(|e| SkillError::NetworkError(e.to_string()))?;

                    let file_path = target_dir.join(item_name);
                    fs::write(&file_path, &content)?;
                }
            } else if item_type == "dir" {
                // Fetch subdirectory contents
                let api_url = format!(
                    "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
                    owner, repo, item_path, branch
                );

                let response = client.get(&api_url).send().await
                    .map_err(|e| SkillError::NetworkError(e.to_string()))?;

                if response.status().is_success() {
                    let sub_contents: Vec<serde_json::Value> = response.json().await
                        .map_err(|e| SkillError::NetworkError(e.to_string()))?;

                    let sub_dir = target_dir.join(item_name);
                    fs::create_dir_all(&sub_dir)?;

                    Box::pin(Self::download_github_files(
                        client, &sub_contents, &sub_dir, owner, repo, branch
                    )).await?;
                }
            }
        }

        Ok(())
    }

    /// Install skill from ZIP (base64 encoded)
    pub fn install_from_zip(zip_base64: &str, source: &str) -> Result<String> {
        use base64::{Engine, engine::general_purpose::STANDARD};
        use std::io::{Cursor, Read};

        let zip_data = STANDARD.decode(zip_base64)
            .map_err(|e| SkillError::ZipError(format!("Base64 decode error: {}", e)))?;

        let cursor = Cursor::new(&zip_data);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| SkillError::ZipError(format!("ZIP open error: {}", e)))?;

        // First pass: find SKILL.md and extract name
        let mut skill_content = None;
        let mut skill_path_prefix = String::new();

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| SkillError::ZipError(format!("ZIP read error: {}", e)))?;

            let file_name = file.name().to_string();

            // Skip __MACOSX directory
            if file_name.contains("__MACOSX") {
                continue;
            }

            if file_name.to_lowercase().ends_with("skill.md") {
                let mut content = String::new();
                file.read_to_string(&mut content)
                    .map_err(|e| SkillError::ZipError(format!("Read error: {}", e)))?;

                // Get the directory prefix
                if let Some(parent) = std::path::Path::new(&file_name).parent() {
                    skill_path_prefix = parent.to_string_lossy().to_string();
                    if !skill_path_prefix.is_empty() {
                        skill_path_prefix.push('/');
                    }
                }

                skill_content = Some(content);
                break;
            }
        }

        let content = skill_content
            .ok_or_else(|| SkillError::SkillMdNotFound("ZIP archive".to_string()))?;

        let name = Self::extract_skill_name(&content, source);
        let sanitized_name = Self::sanitize_name(&name);

        let skills_dir = Self::ensure_skills_dir()?;
        let skill_dir = skills_dir.join(&sanitized_name);
        fs::create_dir_all(&skill_dir)?;

        // Re-open archive for extraction
        let cursor = Cursor::new(&zip_data);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| SkillError::ZipError(format!("ZIP reopen error: {}", e)))?;

        // Second pass: extract files
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| SkillError::ZipError(format!("ZIP read error: {}", e)))?;

            let file_name = file.name().to_string();

            // Skip __MACOSX and files outside the skill directory
            if file_name.contains("__MACOSX") {
                continue;
            }

            // Remove the prefix to get relative path
            let rel_path = if !skill_path_prefix.is_empty() && file_name.starts_with(&skill_path_prefix) {
                &file_name[skill_path_prefix.len()..]
            } else {
                &file_name
            };

            if rel_path.is_empty() {
                continue;
            }

            let target_path = skill_dir.join(rel_path);

            if file.is_dir() {
                fs::create_dir_all(&target_path)?;
            } else {
                if let Some(parent) = target_path.parent() {
                    fs::create_dir_all(parent)?;
                }

                let mut content = Vec::new();
                file.read_to_end(&mut content)
                    .map_err(|e| SkillError::ZipError(format!("Read error: {}", e)))?;

                fs::write(&target_path, &content)?;
            }
        }

        Self::save_metadata(&skill_dir, &name, Some(source.to_string()))?;

        Ok(format!("Installed: {}", name))
    }

    /// Delete a skill
    pub fn delete(name: &str) -> Result<()> {
        let skills_dir = Self::skills_dir()?;
        let skill_dir = skills_dir.join(name);

        if skill_dir.exists() {
            fs::remove_dir_all(&skill_dir)?;
        }

        Ok(())
    }

    /// Open skill folder in file manager
    pub fn open_folder(name: &str) -> Result<()> {
        let skills_dir = Self::skills_dir()?;
        let skill_dir = skills_dir.join(name);

        if !skill_dir.exists() {
            return Err(SkillError::SkillNotFound(name.to_string()));
        }

        #[cfg(target_os = "macos")]
        std::process::Command::new("open").arg(&skill_dir).spawn()?;

        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer").arg(&skill_dir).spawn()?;

        #[cfg(target_os = "linux")]
        std::process::Command::new("xdg-open").arg(&skill_dir).spawn()?;

        Ok(())
    }

    /// Search skills from skills.sh API
    pub async fn search(query: &str) -> Result<Vec<SearchSkill>> {
        let client = reqwest::Client::builder()
            .user_agent("Craft-Agent/1.0")
            .build()
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        let url = format!(
            "https://skills.sh/api/search?q={}&limit=20",
            urlencoding::encode(query)
        );

        let response = client.get(&url).send().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SkillError::NetworkError(format!(
                "Search API error: {}",
                response.status()
            )));
        }

        let data: serde_json::Value = response.json().await
            .map_err(|e| SkillError::NetworkError(e.to_string()))?;

        let skills = data
            .get("skills")
            .and_then(|s| s.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        Some(SearchSkill {
                            name: item.get("name")?.as_str()?.to_string(),
                            slug: item.get("id")?.as_str()?.to_string(),
                            source: item.get("topSource")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            installs: item.get("installs")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(skills)
    }

    /// Extract skill name from YAML frontmatter or filename
    fn extract_skill_name(content: &str, fallback: &str) -> String {
        if let Some(stripped) = content.strip_prefix("---") {
            if let Some(end) = stripped.find("---") {
                let frontmatter = &stripped[..end];
                for line in frontmatter.lines() {
                    if let Some(name_value) = line.strip_prefix("name:") {
                        let name = name_value.trim().trim_matches('"').trim_matches('\'');
                        if !name.is_empty() {
                            return name.to_string();
                        }
                    }
                }
            }
        }

        // Fallback to filename
        fallback
            .rsplit('/')
            .next()
            .unwrap_or(fallback)
            .trim_end_matches(".md")
            .trim_end_matches(".zip")
            .to_string()
    }

    /// Extract description from YAML frontmatter
    fn extract_skill_description(content: &str) -> Option<String> {
        if let Some(stripped) = content.strip_prefix("---") {
            if let Some(end) = stripped.find("---") {
                let frontmatter = &stripped[..end];
                for line in frontmatter.lines() {
                    if let Some(desc_value) = line.strip_prefix("description:") {
                        let desc = desc_value.trim().trim_matches('"').trim_matches('\'');
                        if !desc.is_empty() {
                            return Some(desc.to_string());
                        }
                    }
                }
            }
        }
        None
    }

    /// Sanitize skill name for directory
    fn sanitize_name(name: &str) -> String {
        name.chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect::<String>()
            .to_lowercase()
            .chars()
            .take(50)
            .collect()
    }

    /// Save skill metadata
    fn save_metadata(skill_dir: &PathBuf, name: &str, source: Option<String>) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        // Try to extract description from SKILL.md
        let description = Self::find_skill_md(skill_dir)
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|content| Self::extract_skill_description(&content));

        let metadata = SkillMetadata {
            name: name.to_string(),
            description,
            source,
            version: None,
            author: None,
            installed_at: now.clone(),
            updated_at: now,
        };

        let json = serde_json::to_string_pretty(&metadata)?;
        fs::write(skill_dir.join(".metadata.json"), json)?;
        Ok(())
    }
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_skill_name_from_frontmatter() {
        let content = r#"---
name: "Test Skill"
description: "A test skill"
---

# Test Skill
Content here.
"#;

        let name = SkillManager::extract_skill_name(content, "fallback");
        assert_eq!(name, "Test Skill");
    }

    #[test]
    fn test_extract_skill_name_fallback() {
        let content = "# Just content without frontmatter";
        let name = SkillManager::extract_skill_name(content, "my-skill.md");
        assert_eq!(name, "my-skill");
    }

    #[test]
    fn test_sanitize_name() {
        assert_eq!(SkillManager::sanitize_name("Test Skill"), "test-skill");
        assert_eq!(SkillManager::sanitize_name("My_Skill-v1"), "my_skill-v1");
        assert_eq!(SkillManager::sanitize_name("Skill@123!"), "skill-123-");
    }
}
