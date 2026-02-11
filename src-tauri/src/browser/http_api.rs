//! HTTP API for browser control
//!
//! Provides a REST API that Claude can call with curl to control the browser.
//! This enables agentic browser control where Claude can continuously interact
//! with web pages like Playwright or browser-use.

use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{body::Incoming, Request, Response, Method, StatusCode};
use hyper_util::rt::TokioIo;
use http_body_util::{Full, BodyExt};
use bytes::Bytes;
use tokio::net::TcpListener;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

use super::server::BrowserRelayServer;
use super::types::*;

const HTTP_PORT: u16 = 18800;
const HTTP_HOST: &str = "127.0.0.1";

/// HTTP API Server for browser control
pub struct BrowserHttpApi {
    running: Arc<RwLock<bool>>,
}

impl BrowserHttpApi {
    pub fn new() -> Self {
        Self {
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start the HTTP API server
    pub async fn start(&self, relay: Arc<BrowserRelayServer>) -> Result<(), String> {
        let addr: SocketAddr = format!("{}:{}", HTTP_HOST, HTTP_PORT)
            .parse()
            .map_err(|e| format!("Invalid address: {}", e))?;

        // Check if already running
        {
            let running = self.running.read().await;
            if *running {
                return Ok(());
            }
        }

        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Failed to bind HTTP server to {}: {}", addr, e))?;

        log::info!("Browser HTTP API listening on http://{}", addr);

        // Set running flag
        {
            let mut running = self.running.write().await;
            *running = true;
        }

        let running = self.running.clone();

        tokio::spawn(async move {
            loop {
                // Check if we should stop
                {
                    let is_running = running.read().await;
                    if !*is_running {
                        break;
                    }
                }

                // Accept connections with timeout
                match tokio::time::timeout(
                    std::time::Duration::from_secs(1),
                    listener.accept()
                ).await {
                    Ok(Ok((stream, _addr))) => {
                        let relay = relay.clone();
                        let io = TokioIo::new(stream);

                        tokio::spawn(async move {
                            let service = service_fn(move |req| {
                                handle_request(req, relay.clone())
                            });

                            if let Err(e) = http1::Builder::new()
                                .serve_connection(io, service)
                                .await
                            {
                                log::error!("HTTP connection error: {}", e);
                            }
                        });
                    }
                    Ok(Err(e)) => {
                        log::error!("HTTP accept error: {}", e);
                    }
                    Err(_) => {
                        // Timeout, continue loop
                        continue;
                    }
                }
            }
            log::info!("Browser HTTP API stopped");
        });

        Ok(())
    }

    /// Stop the HTTP API server
    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
    }
}

impl Default for BrowserHttpApi {
    fn default() -> Self {
        Self::new()
    }
}

/// API Response wrapper
#[derive(Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn error(msg: String) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            error: Some(msg),
        }
    }
}

/// Request body for actions
#[derive(Deserialize)]
struct TabRequest {
    #[serde(rename = "tabId")]
    tab_id: u32,
}

#[derive(Deserialize)]
struct OpenRequest {
    url: String,
}

#[derive(Deserialize)]
struct ClickRequest {
    #[serde(rename = "tabId")]
    tab_id: u32,
    selector: String,
}

#[derive(Deserialize)]
struct TypeRequest {
    #[serde(rename = "tabId")]
    tab_id: u32,
    selector: String,
    text: String,
}

#[derive(Deserialize)]
struct ScrollRequest {
    #[serde(rename = "tabId")]
    tab_id: u32,
    direction: String,
}

#[derive(Deserialize)]
struct EvaluateRequest {
    #[serde(rename = "tabId")]
    tab_id: u32,
    expression: String,
}

/// Handle HTTP requests
async fn handle_request(
    req: Request<Incoming>,
    relay: Arc<BrowserRelayServer>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    // Add CORS headers
    let cors_headers = |mut response: Response<Full<Bytes>>| {
        response.headers_mut().insert(
            "Access-Control-Allow-Origin",
            "*".parse().unwrap()
        );
        response.headers_mut().insert(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS".parse().unwrap()
        );
        response.headers_mut().insert(
            "Access-Control-Allow-Headers",
            "Content-Type".parse().unwrap()
        );
        response.headers_mut().insert(
            "Content-Type",
            "application/json".parse().unwrap()
        );
        response
    };

    // Handle preflight
    if req.method() == Method::OPTIONS {
        return Ok(cors_headers(Response::new(Full::new(Bytes::new()))));
    }

    let path = req.uri().path();
    let method = req.method().clone();

    let result = match (method, path) {
        // GET /status - Check connection status
        (Method::GET, "/status") => {
            let status = relay.get_status().await;
            json_response(ApiResponse::success(status))
        }

        // GET /tabs - List all tabs
        (Method::GET, "/tabs") => {
            match relay.send_command(BrowserRequest::ListTabs).await {
                Ok(data) => json_response(ApiResponse::success(data)),
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /open - Open new tab
        (Method::POST, "/open") => {
            match parse_body::<OpenRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Open { url: body.url }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /close - Close tab
        (Method::POST, "/close") => {
            match parse_body::<TabRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Close { tab_id: body.tab_id }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /attach - Attach debugger to tab
        (Method::POST, "/attach") => {
            match parse_body::<TabRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Attach { tab_id: body.tab_id }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /detach - Detach from tab
        (Method::POST, "/detach") => {
            match parse_body::<TabRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Detach { tab_id: body.tab_id }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /snapshot - Get page snapshot (accessibility tree + text content)
        (Method::POST, "/snapshot") => {
            match parse_body::<TabRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Snapshot { tab_id: body.tab_id }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /click - Click element
        (Method::POST, "/click") => {
            match parse_body::<ClickRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Click {
                        tab_id: body.tab_id,
                        selector: body.selector,
                    }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /type - Type text into element
        (Method::POST, "/type") => {
            match parse_body::<TypeRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Type {
                        tab_id: body.tab_id,
                        selector: body.selector,
                        text: body.text,
                    }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /scroll - Scroll page
        (Method::POST, "/scroll") => {
            match parse_body::<ScrollRequest>(req).await {
                Ok(body) => {
                    let direction = match body.direction.to_lowercase().as_str() {
                        "up" => ScrollDirection::Up,
                        "down" => ScrollDirection::Down,
                        "left" => ScrollDirection::Left,
                        "right" => ScrollDirection::Right,
                        _ => return Ok(cors_headers(json_response(
                            ApiResponse::<()>::error(format!("Invalid direction: {}", body.direction))
                        ))),
                    };
                    match relay.send_command(BrowserRequest::Scroll {
                        tab_id: body.tab_id,
                        direction,
                    }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /screenshot - Take screenshot
        (Method::POST, "/screenshot") => {
            match parse_body::<TabRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Screenshot { tab_id: body.tab_id }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // POST /evaluate - Execute JavaScript
        (Method::POST, "/evaluate") => {
            match parse_body::<EvaluateRequest>(req).await {
                Ok(body) => {
                    match relay.send_command(BrowserRequest::Evaluate {
                        tab_id: body.tab_id,
                        expression: body.expression,
                    }).await {
                        Ok(data) => json_response(ApiResponse::success(data)),
                        Err(e) => json_response(ApiResponse::<()>::error(e)),
                    }
                }
                Err(e) => json_response(ApiResponse::<()>::error(e)),
            }
        }

        // Not found
        _ => {
            let response = ApiResponse::<()>::error(format!("Not found: {} {}", req.method(), path));
            let mut resp = json_response(response);
            *resp.status_mut() = StatusCode::NOT_FOUND;
            resp
        }
    };

    Ok(cors_headers(result))
}

/// Parse JSON request body
async fn parse_body<T: for<'de> Deserialize<'de>>(req: Request<Incoming>) -> Result<T, String> {
    let body_bytes = req.collect().await
        .map_err(|e| format!("Failed to read body: {}", e))?
        .to_bytes();

    serde_json::from_slice(&body_bytes)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Create JSON response
fn json_response<T: Serialize>(data: T) -> Response<Full<Bytes>> {
    let json = serde_json::to_string(&data).unwrap_or_else(|_| r#"{"success":false,"error":"Serialization failed"}"#.to_string());
    Response::new(Full::new(Bytes::from(json)))
}

/// Global HTTP API instance
static BROWSER_HTTP_API: std::sync::OnceLock<Arc<BrowserHttpApi>> = std::sync::OnceLock::new();

/// Get or create the global HTTP API server
pub fn get_browser_http_api() -> Arc<BrowserHttpApi> {
    BROWSER_HTTP_API.get_or_init(|| Arc::new(BrowserHttpApi::new())).clone()
}
