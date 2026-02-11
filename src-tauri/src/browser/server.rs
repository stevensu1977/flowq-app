//! WebSocket server for FlowQ Browser Relay extension

use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures::{SinkExt, StreamExt};
use uuid::Uuid;

use super::types::*;

const WS_PORT: u16 = 18799;
const WS_HOST: &str = "127.0.0.1";

/// Browser relay server state
pub struct BrowserRelayServer {
    /// Connected extension state
    connection: Arc<RwLock<Option<ExtensionConnection>>>,
    /// Channel to send commands to the connected WebSocket
    outgoing_tx: Arc<RwLock<Option<mpsc::Sender<String>>>>,
    /// Pending requests waiting for response
    pending_requests: Arc<RwLock<HashMap<String, tokio::sync::oneshot::Sender<BrowserResponse>>>>,
    /// Event broadcast channel
    event_tx: broadcast::Sender<ExtensionEvent>,
    /// Server running flag
    running: Arc<RwLock<bool>>,
}

struct ExtensionConnection {
    version: Option<String>,
    attached_tabs: Vec<TabInfo>,
}

impl BrowserRelayServer {
    /// Create a new browser relay server
    pub fn new() -> Self {
        let (event_tx, _event_rx) = broadcast::channel(100);

        Self {
            connection: Arc::new(RwLock::new(None)),
            outgoing_tx: Arc::new(RwLock::new(None)),
            pending_requests: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start the WebSocket server
    pub async fn start(&self) -> Result<(), String> {
        let addr = format!("{}:{}", WS_HOST, WS_PORT);

        // Check if already running
        {
            let running = self.running.read().await;
            if *running {
                return Ok(());
            }
        }

        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

        log::info!("Browser relay server listening on ws://{}", addr);

        // Set running flag
        {
            let mut running = self.running.write().await;
            *running = true;
        }

        // Clone Arc references for the spawn
        let connection = self.connection.clone();
        let outgoing_tx = self.outgoing_tx.clone();
        let pending_requests = self.pending_requests.clone();
        let event_tx = self.event_tx.clone();
        let running = self.running.clone();

        // Spawn server loop
        tokio::spawn(async move {
            loop {
                // Check if we should stop
                {
                    let is_running = running.read().await;
                    if !*is_running {
                        break;
                    }
                }

                // Accept connections with timeout to allow checking running flag
                match tokio::time::timeout(
                    std::time::Duration::from_secs(1),
                    listener.accept()
                ).await {
                    Ok(Ok((stream, addr))) => {
                        log::info!("Browser extension connected from: {}", addr);

                        // Handle connection
                        let conn = connection.clone();
                        let out_tx = outgoing_tx.clone();
                        let pending = pending_requests.clone();
                        let events = event_tx.clone();

                        tokio::spawn(async move {
                            if let Err(e) = handle_connection(stream, conn, out_tx, pending, events).await {
                                log::error!("Connection error: {}", e);
                            }
                        });
                    }
                    Ok(Err(e)) => {
                        log::error!("Accept error: {}", e);
                    }
                    Err(_) => {
                        // Timeout, continue loop to check running flag
                        continue;
                    }
                }
            }
            log::info!("Browser relay server stopped");
        });

        Ok(())
    }

    /// Stop the WebSocket server
    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
    }

    /// Check if extension is connected
    pub async fn is_connected(&self) -> bool {
        let connection = self.connection.read().await;
        connection.is_some()
    }

    /// Get connection status
    pub async fn get_status(&self) -> BrowserRelayStatus {
        let connection = self.connection.read().await;
        match &*connection {
            Some(conn) => BrowserRelayStatus {
                connected: true,
                extension_version: conn.version.clone(),
                attached_tabs: conn.attached_tabs.clone(),
            },
            None => BrowserRelayStatus {
                connected: false,
                extension_version: None,
                attached_tabs: vec![],
            },
        }
    }

    /// Send a command to the extension and wait for response
    pub async fn send_command(&self, request: BrowserRequest) -> Result<serde_json::Value, String> {
        // Check connection
        let connection = self.connection.read().await;
        if connection.is_none() {
            return Err("Extension not connected".to_string());
        }
        drop(connection);

        // Get the outgoing channel
        let outgoing_tx = {
            let tx_lock = self.outgoing_tx.read().await;
            match &*tx_lock {
                Some(tx) => tx.clone(),
                None => return Err("No active connection".to_string()),
            }
        };

        let request_id = Uuid::new_v4().to_string();
        let message = BrowserMessage {
            request_id: request_id.clone(),
            request,
        };

        // Create oneshot channel for response
        let (tx, rx) = tokio::sync::oneshot::channel();

        // Register pending request
        {
            let mut pending = self.pending_requests.write().await;
            pending.insert(request_id.clone(), tx);
        }

        // Serialize and send command
        let json_msg = serde_json::to_string(&message)
            .map_err(|e| format!("Failed to serialize message: {}", e))?;

        outgoing_tx.send(json_msg).await
            .map_err(|e| format!("Failed to send command: {}", e))?;

        log::debug!("Sent command with request_id: {}", request_id);

        // Wait for response with timeout
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(response)) => {
                log::debug!("Received response for request_id: {}", request_id);
                if let Some(error) = response.error {
                    Err(error)
                } else {
                    Ok(response.result.unwrap_or(serde_json::Value::Null))
                }
            }
            Ok(Err(_)) => {
                log::error!("Response channel closed for request_id: {}", request_id);
                Err("Response channel closed".to_string())
            }
            Err(_) => {
                // Remove pending request on timeout
                let mut pending = self.pending_requests.write().await;
                pending.remove(&request_id);
                log::error!("Request timed out for request_id: {}", request_id);
                Err("Request timed out".to_string())
            }
        }
    }

    /// Subscribe to extension events
    pub fn subscribe_events(&self) -> broadcast::Receiver<ExtensionEvent> {
        self.event_tx.subscribe()
    }
}

/// Handle a single WebSocket connection
async fn handle_connection(
    stream: TcpStream,
    connection: Arc<RwLock<Option<ExtensionConnection>>>,
    outgoing_tx_holder: Arc<RwLock<Option<mpsc::Sender<String>>>>,
    pending_requests: Arc<RwLock<HashMap<String, tokio::sync::oneshot::Sender<BrowserResponse>>>>,
    event_tx: broadcast::Sender<ExtensionEvent>,
) -> Result<(), String> {
    let ws_stream = accept_async(stream)
        .await
        .map_err(|e| format!("WebSocket handshake failed: {}", e))?;

    let (mut write, mut read) = ws_stream.split();

    // Create channel for outgoing messages
    let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<String>(100);

    // Store the outgoing sender so send_command can use it
    {
        let mut tx_holder = outgoing_tx_holder.write().await;
        *tx_holder = Some(outgoing_tx);
    }

    // Spawn writer task
    let write_handle = tokio::spawn(async move {
        while let Some(msg) = outgoing_rx.recv().await {
            log::debug!("Sending WebSocket message: {}", &msg[..msg.len().min(200)]);
            if let Err(e) = write.send(Message::Text(msg)).await {
                log::error!("Failed to send message: {}", e);
                break;
            }
        }
        log::debug!("Writer task ended");
    });

    // Initialize connection state
    {
        let mut conn = connection.write().await;
        *conn = Some(ExtensionConnection {
            version: None,
            attached_tabs: vec![],
        });
    }

    log::info!("WebSocket connection established, processing messages...");

    // Process incoming messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                log::debug!("Received WebSocket message: {}", &text[..text.len().min(200)]);
                // Parse message
                match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(value) => {
                        // Check message type
                        if let Some(msg_type) = value.get("type").and_then(|t| t.as_str()) {
                            match msg_type {
                                "response" => {
                                    // Handle response
                                    if let Ok(response) = serde_json::from_value::<BrowserResponse>(value) {
                                        log::debug!("Processing response for request_id: {}", response.request_id);
                                        let mut pending = pending_requests.write().await;
                                        if let Some(tx) = pending.remove(&response.request_id) {
                                            let _ = tx.send(response);
                                        } else {
                                            log::warn!("No pending request found for request_id");
                                        }
                                    }
                                }
                                "relay_ready" | "tab_closed" | "tab_navigated" | "debugger_detached" => {
                                    log::info!("Received event: {}", msg_type);
                                    // Handle events
                                    if let Ok(event) = serde_json::from_value::<ExtensionEvent>(value) {
                                        // Update connection state for relay_ready
                                        if let ExtensionEvent::RelayReady { ref attached_tabs } = event {
                                            let mut conn = connection.write().await;
                                            if let Some(ref mut c) = *conn {
                                                c.attached_tabs = attached_tabs.iter().map(|(id, info)| {
                                                    TabInfo {
                                                        id: *id,
                                                        url: info.url.clone(),
                                                        title: None,
                                                        active: false,
                                                        attached: info.attached,
                                                    }
                                                }).collect();
                                            }
                                        }
                                        let _ = event_tx.send(event);
                                    }
                                }
                                _ => {
                                    log::warn!("Unknown message type: {}", msg_type);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to parse message: {}", e);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                log::info!("Extension disconnected");
                break;
            }
            Ok(Message::Ping(_data)) => {
                log::debug!("Received ping");
            }
            Err(e) => {
                log::error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Clear connection state
    {
        let mut conn = connection.write().await;
        *conn = None;
    }

    // Clear outgoing channel
    {
        let mut tx_holder = outgoing_tx_holder.write().await;
        *tx_holder = None;
    }

    // Clean up
    write_handle.abort();

    log::info!("Connection handler finished");

    Ok(())
}

impl Default for BrowserRelayServer {
    fn default() -> Self {
        Self::new()
    }
}

/// Global server instance
static BROWSER_RELAY: std::sync::OnceLock<Arc<BrowserRelayServer>> = std::sync::OnceLock::new();

/// Get or create the global browser relay server
pub fn get_browser_relay() -> Arc<BrowserRelayServer> {
    BROWSER_RELAY.get_or_init(|| Arc::new(BrowserRelayServer::new())).clone()
}
