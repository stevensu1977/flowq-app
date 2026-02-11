//! Types for FlowQ Browser Relay communication

use serde::{Deserialize, Serialize};

/// Request from FlowQ to Chrome extension
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum BrowserRequest {
    /// Health check
    Ping,
    /// List all open tabs
    ListTabs,
    /// Open a new tab
    Open {
        url: String,
    },
    /// Close a tab
    Close {
        #[serde(rename = "tabId")]
        tab_id: u32,
    },
    /// Attach debugger to tab
    Attach {
        #[serde(rename = "tabId")]
        tab_id: u32,
    },
    /// Detach from tab
    Detach {
        #[serde(rename = "tabId")]
        tab_id: u32,
    },
    /// Get page accessibility snapshot
    Snapshot {
        #[serde(rename = "tabId")]
        tab_id: u32,
    },
    /// Execute JavaScript
    Evaluate {
        #[serde(rename = "tabId")]
        tab_id: u32,
        expression: String,
    },
    /// Click element
    Click {
        #[serde(rename = "tabId")]
        tab_id: u32,
        selector: String,
    },
    /// Type text
    Type {
        #[serde(rename = "tabId")]
        tab_id: u32,
        selector: String,
        text: String,
    },
    /// Scroll page
    Scroll {
        #[serde(rename = "tabId")]
        tab_id: u32,
        direction: ScrollDirection,
    },
    /// Take screenshot
    Screenshot {
        #[serde(rename = "tabId")]
        tab_id: u32,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

/// Message wrapper with request ID for correlation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserMessage {
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(flatten)]
    pub request: BrowserRequest,
}

/// Response from Chrome extension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserResponse {
    #[serde(rename = "type")]
    pub response_type: String,
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Tab information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: u32,
    pub url: Option<String>,
    pub title: Option<String>,
    pub active: bool,
    pub attached: bool,
}

/// Page snapshot result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageSnapshot {
    pub page: PageInfo,
    pub tree: Vec<AccessibilityNode>,
    #[serde(rename = "nodeCount")]
    pub node_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageInfo {
    pub url: String,
    pub title: String,
    #[serde(rename = "scrollY")]
    pub scroll_y: f64,
    #[serde(rename = "scrollHeight")]
    pub scroll_height: f64,
    #[serde(rename = "viewportHeight")]
    pub viewport_height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityNode {
    #[serde(rename = "ref")]
    pub reference: String,
    pub role: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<AccessibilityNode>,
}

/// Screenshot result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotResult {
    pub data: String, // base64 encoded
    pub format: String,
}

/// Event from extension to FlowQ
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExtensionEvent {
    /// Extension connected and ready
    RelayReady {
        #[serde(rename = "attachedTabs")]
        attached_tabs: Vec<(u32, TabAttachInfo)>,
    },
    /// Tab was closed
    TabClosed {
        #[serde(rename = "tabId")]
        tab_id: u32,
    },
    /// Tab navigated to new URL
    TabNavigated {
        #[serde(rename = "tabId")]
        tab_id: u32,
        url: String,
    },
    /// Debugger was detached
    DebuggerDetached {
        #[serde(rename = "tabId")]
        tab_id: u32,
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabAttachInfo {
    pub attached: bool,
    pub url: Option<String>,
}

/// Connection status for UI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserRelayStatus {
    pub connected: bool,
    #[serde(rename = "extensionVersion")]
    pub extension_version: Option<String>,
    #[serde(rename = "attachedTabs")]
    pub attached_tabs: Vec<TabInfo>,
}
