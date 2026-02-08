//! MCP Server Configuration Manager
//!
//! Manages MCP server configurations stored in ~/.claude.json
//! This module handles CRUD operations for MCP servers without
//! actually spawning connections - that's handled by Claude Code CLI.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// ============ Types ============

/// MCP Server information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub transport: String,  // "stdio" or "http"
    pub disabled: Option<bool>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
}

/// Request to add a new MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddMcpServerRequest {
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
}

/// MCP Tool information (discovered from server)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
}

// ============ Error Type ============

#[derive(Debug)]
pub enum McpError {
    HomeNotFound,
    IoError(std::io::Error),
    JsonError(serde_json::Error),
    InvalidConfig(String),
    ServerNotFound(String),
}

impl std::fmt::Display for McpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpError::HomeNotFound => write!(f, "Could not find home directory"),
            McpError::IoError(e) => write!(f, "IO error: {}", e),
            McpError::JsonError(e) => write!(f, "JSON error: {}", e),
            McpError::InvalidConfig(msg) => write!(f, "Invalid config: {}", msg),
            McpError::ServerNotFound(name) => write!(f, "Server not found: {}", name),
        }
    }
}

impl From<std::io::Error> for McpError {
    fn from(e: std::io::Error) -> Self {
        McpError::IoError(e)
    }
}

impl From<serde_json::Error> for McpError {
    fn from(e: serde_json::Error) -> Self {
        McpError::JsonError(e)
    }
}

pub type Result<T> = std::result::Result<T, McpError>;

// ============ MCP Manager ============

/// MCP configuration manager for Claude
pub struct McpManager;

impl McpManager {
    /// Get the path to Claude's MCP config file
    fn config_path() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or(McpError::HomeNotFound)?;
        Ok(home.join(".claude.json"))
    }

    /// Read the config file, returns empty object if not exists
    fn read_config() -> Result<serde_json::Value> {
        let path = Self::config_path()?;

        if !path.exists() {
            return Ok(serde_json::json!({}));
        }

        let content = fs::read_to_string(&path)?;
        let config: serde_json::Value = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// Write config back to file
    fn write_config(config: &serde_json::Value) -> Result<()> {
        let path = Self::config_path()?;
        let json_str = serde_json::to_string_pretty(config)?;
        fs::write(&path, json_str)?;
        Ok(())
    }

    /// List all configured MCP servers
    pub fn list() -> Result<Vec<McpServerInfo>> {
        let config = Self::read_config()?;

        let servers = config
            .get("mcpServers")
            .and_then(|s| s.as_object())
            .map(|obj| {
                obj.iter()
                    .map(|(name, value)| Self::parse_server(name, value))
                    .collect()
            })
            .unwrap_or_default();

        Ok(servers)
    }

    /// Add a new MCP server
    pub fn add(request: AddMcpServerRequest) -> Result<()> {
        let mut config = Self::read_config()?;

        // Get or create mcpServers object
        let mcp_servers = config
            .as_object_mut()
            .ok_or(McpError::InvalidConfig("root is not an object".to_string()))?
            .entry("mcpServers")
            .or_insert(serde_json::json!({}))
            .as_object_mut()
            .ok_or(McpError::InvalidConfig("mcpServers is not an object".to_string()))?;

        // Build server config based on transport type
        let mut server_config = serde_json::Map::new();

        if request.transport == "stdio" {
            server_config.insert("type".to_string(), serde_json::json!("stdio"));

            if let Some(cmd) = request.command {
                server_config.insert("command".to_string(), serde_json::json!(cmd));
            }

            if let Some(args) = request.args {
                if !args.is_empty() {
                    server_config.insert("args".to_string(), serde_json::json!(args));
                }
            }

            if let Some(env) = request.env {
                if !env.is_empty() {
                    server_config.insert("env".to_string(), serde_json::json!(env));
                }
            }
        } else {
            // HTTP/SSE transport
            server_config.insert("type".to_string(), serde_json::json!("http"));

            if let Some(url) = request.url {
                server_config.insert("url".to_string(), serde_json::json!(url));
            }

            if let Some(headers) = request.headers {
                if !headers.is_empty() {
                    server_config.insert("headers".to_string(), serde_json::json!(headers));
                }
            }
        }

        mcp_servers.insert(request.name, serde_json::Value::Object(server_config));
        Self::write_config(&config)?;

        Ok(())
    }

    /// Remove an MCP server
    pub fn remove(name: &str) -> Result<()> {
        let mut config = Self::read_config()?;

        if let Some(mcp_servers) = config
            .get_mut("mcpServers")
            .and_then(|s| s.as_object_mut())
        {
            mcp_servers.remove(name);
        }

        Self::write_config(&config)?;
        Ok(())
    }

    /// Toggle MCP server enabled/disabled state
    pub fn toggle(name: &str, disabled: bool) -> Result<()> {
        let mut config = Self::read_config()?;

        let server = config
            .get_mut("mcpServers")
            .and_then(|s| s.get_mut(name))
            .and_then(|s| s.as_object_mut())
            .ok_or_else(|| McpError::ServerNotFound(name.to_string()))?;

        if disabled {
            server.insert("disabled".to_string(), serde_json::json!(true));
        } else {
            server.remove("disabled");
        }

        Self::write_config(&config)?;
        Ok(())
    }

    /// Update an existing MCP server
    pub fn update(name: &str, request: AddMcpServerRequest) -> Result<()> {
        // Remove old and add new with same name
        Self::remove(name)?;
        Self::add(request)?;
        Ok(())
    }

    /// Get a single MCP server by name
    pub fn get(name: &str) -> Result<Option<McpServerInfo>> {
        let config = Self::read_config()?;

        let server = config
            .get("mcpServers")
            .and_then(|s| s.get(name))
            .map(|value| Self::parse_server(name, value));

        Ok(server)
    }

    /// Parse server config from JSON
    fn parse_server(name: &str, value: &serde_json::Value) -> McpServerInfo {
        let obj = value.as_object();

        // Determine transport type
        let transport = value
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| {
                if s == "http" || s == "sse" {
                    "http"
                } else {
                    "stdio"
                }
            })
            .unwrap_or_else(|| {
                // Fallback: if has url, it's http; otherwise stdio
                if value.get("url").is_some() {
                    "http"
                } else {
                    "stdio"
                }
            });

        McpServerInfo {
            name: name.to_string(),
            transport: transport.to_string(),
            disabled: value.get("disabled").and_then(|v| v.as_bool()),
            command: value.get("command").and_then(|v| v.as_str()).map(String::from),
            args: value.get("args").and_then(|v| {
                v.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
            }),
            env: obj.and_then(|o| o.get("env")).and_then(|v| {
                v.as_object().map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
            }),
            url: value.get("url").and_then(|v| v.as_str()).map(String::from),
            headers: obj.and_then(|o| o.get("headers")).and_then(|v| {
                v.as_object().map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
            }),
        }
    }
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_stdio_server() {
        let value = serde_json::json!({
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            "env": {
                "DEBUG": "true"
            }
        });

        let server = McpManager::parse_server("test-server", &value);

        assert_eq!(server.name, "test-server");
        assert_eq!(server.transport, "stdio");
        assert_eq!(server.command, Some("npx".to_string()));
        assert!(server.args.is_some());
        assert_eq!(server.args.as_ref().unwrap().len(), 3);
        assert!(server.env.is_some());
    }

    #[test]
    fn test_parse_http_server() {
        let value = serde_json::json!({
            "type": "http",
            "url": "http://localhost:3000",
            "headers": {
                "Authorization": "Bearer token123"
            }
        });

        let server = McpManager::parse_server("http-server", &value);

        assert_eq!(server.name, "http-server");
        assert_eq!(server.transport, "http");
        assert_eq!(server.url, Some("http://localhost:3000".to_string()));
        assert!(server.headers.is_some());
    }

    #[test]
    fn test_parse_disabled_server() {
        let value = serde_json::json!({
            "type": "stdio",
            "command": "test",
            "disabled": true
        });

        let server = McpManager::parse_server("disabled-server", &value);

        assert_eq!(server.disabled, Some(true));
    }
}
