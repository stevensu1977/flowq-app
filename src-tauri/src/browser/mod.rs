//! Browser Relay Module
//!
//! Provides WebSocket server for communicating with FlowQ Browser Relay Chrome extension.
//! Enables AI agent to control the user's browser using existing login sessions.
//!
//! Also provides HTTP API for agentic browser control - allowing Claude to use curl
//! to interact with the browser continuously (like Playwright or browser-use).

pub mod http_api;
pub mod server;
pub mod types;

pub use http_api::{get_browser_http_api, BrowserHttpApi};
pub use server::{get_browser_relay, BrowserRelayServer};
pub use types::*;
