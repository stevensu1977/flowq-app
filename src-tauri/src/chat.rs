//! Simple chat module for direct LLM API calls without Claude Code tools
//! Supports Anthropic (official, third-party proxy), AWS Bedrock, and OpenAI compatible APIs

use aws_config::BehaviorVersion;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as Base64Engine;
use aws_sdk_bedrockruntime::types::{
    ContentBlock as BedrockContent, ConversationRole, ImageBlock, ImageFormat,
    ImageSource as BedrockImageSource, Message as BedrockMessage, SystemContentBlock,
    Tool as BedrockTool, ToolConfiguration, ToolInputSchema, ToolSpecification,
    ToolResultBlock, ToolResultContentBlock, StopReason as BedrockStopReason,
};
use aws_smithy_types::{Blob, Document};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::memory_tool::MemoryTool;

/// Content block for multimodal messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: ImageSource },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSource {
    #[serde(rename = "type")]
    pub source_type: String, // "base64"
    pub media_type: String,  // "image/png", "image/jpeg", etc.
    pub data: String,        // base64 encoded image data
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    /// Content can be either a simple string or multimodal content blocks
    #[serde(deserialize_with = "deserialize_content")]
    pub content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

/// Custom deserializer to handle both string and array content
fn deserialize_content<'de, D>(deserializer: D) -> Result<MessageContent, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de;

    struct ContentVisitor;

    impl<'de> de::Visitor<'de> for ContentVisitor {
        type Value = MessageContent;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or array of content blocks")
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(MessageContent::Text(v.to_string()))
        }

        fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(MessageContent::Text(v))
        }

        fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
        where
            A: de::SeqAccess<'de>,
        {
            let blocks: Vec<ContentBlock> =
                de::Deserialize::deserialize(de::value::SeqAccessDeserializer::new(seq))?;
            Ok(MessageContent::Blocks(blocks))
        }
    }

    deserializer.deserialize_any(ContentVisitor)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    /// Provider type: "anthropic" | "bedrock" | "openai" | "azure" | "custom"
    pub provider: String,
    /// API key (not needed for bedrock, uses AWS credentials)
    pub api_key: Option<String>,
    /// Base URL for anthropic/openai (supports third-party proxies)
    pub base_url: Option<String>,
    /// Model ID
    pub model: Option<String>,
    /// AWS region for bedrock
    pub region: Option<String>,
    /// AWS profile for bedrock (optional, uses default if not specified)
    pub aws_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub config: ApiConfig,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    /// Workspace path for memory tool operations
    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

// Anthropic API types
#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    stream: bool,
}

/// Anthropic tool definition
#[derive(Debug, Clone, Serialize)]
pub struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

/// Memory Tool - provides file operations for persistent memory
fn create_memory_tool() -> AnthropicTool {
    AnthropicTool {
        name: "memory".to_string(),
        description: "Manage persistent memory files. Use this to save, update, or read information that should persist across conversations. Memory files are stored in .flowq/memories/ directory.".to_string(),
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["view", "create", "str_replace", "insert", "delete"],
                    "description": "The operation to perform"
                },
                "path": {
                    "type": "string",
                    "description": "File path relative to memories directory (e.g., 'notes.md', 'projects/work.md')"
                },
                "file_text": {
                    "type": "string",
                    "description": "For 'create': the content of the new file"
                },
                "old_str": {
                    "type": "string",
                    "description": "For 'str_replace': the text to find"
                },
                "new_str": {
                    "type": "string",
                    "description": "For 'str_replace' or 'insert': the new text"
                },
                "insert_line": {
                    "type": "integer",
                    "description": "For 'insert': line number to insert at (1-indexed)"
                },
                "view_range": {
                    "type": "array",
                    "items": { "type": "integer" },
                    "description": "For 'view': optional [start_line, end_line] range"
                }
            },
            "required": ["command", "path"]
        }),
    }
}

/// Anthropic message with multimodal support
#[derive(Debug, Clone, Serialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicContent,
}

/// Anthropic content - can be string or array of content blocks
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
    /// For assistant messages containing tool_use responses
    ResponseBlocks(Vec<AnthropicResponseContentBlock>),
    /// For user messages containing tool_result
    ToolResults(Vec<AnthropicToolResultBlock>),
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
}

/// Content block for assistant response (used in tool use loop)
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
enum AnthropicResponseContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

/// Tool result block for user message
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename = "tool_result")]
struct AnthropicToolResultBlock {
    tool_use_id: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseContent>,
    model: String,
    usage: AnthropicUsage,
    stop_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicResponseContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
    // Tool use fields
    id: Option<String>,
    name: Option<String>,
    input: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

// OpenAI API types
#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    model: String,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessageContent,
}

#[derive(Debug, Deserialize)]
struct OpenAIMessageContent {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}

pub struct ChatClient {
    http_client: reqwest::Client,
}

impl ChatClient {
    pub fn new() -> Self {
        Self {
            http_client: reqwest::Client::new(),
        }
    }

    pub async fn send(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        match request.config.provider.as_str() {
            "anthropic" => self.send_anthropic(request).await,
            "bedrock" => self.send_bedrock(request).await,
            "openai" | "azure" | "custom" => self.send_openai(request).await,
            _ => Err(format!("Unsupported provider: {}", request.config.provider)),
        }
    }

    /// Send message using Anthropic API (supports official and third-party proxies)
    /// Implements tool use loop for memory operations when workspace is provided
    async fn send_anthropic(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let base_url = request
            .config
            .base_url
            .unwrap_or_else(|| "https://api.anthropic.com".to_string());
        let model = request
            .config
            .model
            .clone()
            .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string());
        let api_key = request
            .config
            .api_key
            .clone()
            .ok_or("API key is required for Anthropic provider")?;
        let system_prompt = request.system_prompt.clone();
        let max_tokens = request.max_tokens.unwrap_or(4096);
        let temperature = request.temperature;

        // Convert initial messages to Anthropic format
        let mut messages: Vec<AnthropicMessage> = request
            .messages
            .into_iter()
            .map(|m| Self::convert_to_anthropic_message(m))
            .collect();

        // Set up memory tool if workspace is provided
        let tools = request.workspace.as_ref().map(|_| vec![create_memory_tool()]);
        let memory_tool = request.workspace.as_ref().map(|ws| MemoryTool::new(Path::new(ws)));

        // Track total usage across the loop
        let mut total_input_tokens = 0u32;
        let mut total_output_tokens = 0u32;
        let mut final_text = String::new();
        let mut final_model = model.clone();

        // Tool use loop - continue until end_turn
        const MAX_ITERATIONS: u32 = 10;
        for iteration in 0..MAX_ITERATIONS {
            log::info!("Anthropic request iteration {}", iteration + 1);

            let api_request = AnthropicRequest {
                model: model.clone(),
                max_tokens,
                system: system_prompt.clone(),
                messages: messages.clone(),
                temperature,
                tools: tools.clone(),
                stream: false,
            };

            let response = self
                .http_client
                .post(format!("{}/v1/messages", base_url))
                .header("Content-Type", "application/json")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&api_request)
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(format!("API error ({}): {}", status, text));
            }

            let api_response: AnthropicResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            // Accumulate usage
            total_input_tokens += api_response.usage.input_tokens;
            total_output_tokens += api_response.usage.output_tokens;
            final_model = api_response.model.clone();

            // Check stop reason
            let stop_reason = api_response.stop_reason.as_deref().unwrap_or("end_turn");
            log::info!("Stop reason: {}", stop_reason);

            if stop_reason == "end_turn" {
                // Final response - extract text and return
                final_text = api_response
                    .content
                    .iter()
                    .filter_map(|c| c.text.clone())
                    .collect::<Vec<_>>()
                    .join("");
                break;
            } else if stop_reason == "tool_use" {
                // Handle tool use
                if let Some(ref tool) = memory_tool {
                    // Add assistant message with tool use to conversation
                    let assistant_content: Vec<AnthropicResponseContentBlock> = api_response
                        .content
                        .iter()
                        .map(|c| {
                            if c.content_type == "text" {
                                AnthropicResponseContentBlock::Text {
                                    text: c.text.clone().unwrap_or_default(),
                                }
                            } else if c.content_type == "tool_use" {
                                AnthropicResponseContentBlock::ToolUse {
                                    id: c.id.clone().unwrap_or_default(),
                                    name: c.name.clone().unwrap_or_default(),
                                    input: c.input.clone().unwrap_or(serde_json::json!({})),
                                }
                            } else {
                                AnthropicResponseContentBlock::Text {
                                    text: String::new(),
                                }
                            }
                        })
                        .collect();

                    messages.push(AnthropicMessage {
                        role: "assistant".to_string(),
                        content: AnthropicContent::ResponseBlocks(assistant_content),
                    });

                    // Process tool uses and collect results
                    let mut tool_results: Vec<AnthropicToolResultBlock> = Vec::new();

                    for content_block in &api_response.content {
                        if content_block.content_type == "tool_use" {
                            if let (Some(id), Some(name), Some(input)) =
                                (&content_block.id, &content_block.name, &content_block.input)
                            {
                                log::info!("Executing memory tool: {} with input: {:?}", name, input);

                                if name == "memory" {
                                    // Parse and execute memory command
                                    let result = Self::execute_memory_command(tool, input);
                                    tool_results.push(AnthropicToolResultBlock {
                                        tool_use_id: id.clone(),
                                        content: result,
                                    });
                                } else {
                                    tool_results.push(AnthropicToolResultBlock {
                                        tool_use_id: id.clone(),
                                        content: format!("Unknown tool: {}", name),
                                    });
                                }
                            }
                        }
                    }

                    // Add user message with tool results
                    if !tool_results.is_empty() {
                        messages.push(AnthropicMessage {
                            role: "user".to_string(),
                            content: AnthropicContent::ToolResults(tool_results),
                        });
                    }
                } else {
                    // No memory tool available, but got tool_use - extract any text and return
                    log::warn!("Got tool_use but no memory tool available");
                    final_text = api_response
                        .content
                        .iter()
                        .filter_map(|c| c.text.clone())
                        .collect::<Vec<_>>()
                        .join("");
                    break;
                }
            } else {
                // Unknown stop reason - extract text and return
                final_text = api_response
                    .content
                    .iter()
                    .filter_map(|c| c.text.clone())
                    .collect::<Vec<_>>()
                    .join("");
                break;
            }
        }

        Ok(ChatResponse {
            content: final_text,
            model: final_model,
            usage: Some(TokenUsage {
                input_tokens: total_input_tokens,
                output_tokens: total_output_tokens,
            }),
        })
    }

    /// Convert a ChatMessage to AnthropicMessage
    fn convert_to_anthropic_message(m: ChatMessage) -> AnthropicMessage {
        let content = match m.content {
            MessageContent::Text(text) => AnthropicContent::Text(text),
            MessageContent::Blocks(blocks) => {
                let anthropic_blocks: Vec<AnthropicContentBlock> = blocks
                    .into_iter()
                    .map(|b| match b {
                        ContentBlock::Text { text } => AnthropicContentBlock::Text { text },
                        ContentBlock::Image { source } => AnthropicContentBlock::Image {
                            source: AnthropicImageSource {
                                source_type: source.source_type,
                                media_type: source.media_type,
                                data: source.data,
                            },
                        },
                    })
                    .collect();
                AnthropicContent::Blocks(anthropic_blocks)
            }
        };
        AnthropicMessage {
            role: m.role,
            content,
        }
    }

    /// Execute a memory tool command
    fn execute_memory_command(tool: &MemoryTool, input: &serde_json::Value) -> String {
        // Parse command from input
        let command = input.get("command").and_then(|v| v.as_str()).unwrap_or("");
        let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");

        use crate::memory_tool::MemoryToolCommand;

        let cmd = match command {
            "view" => {
                let view_range = input.get("view_range").and_then(|v| {
                    let arr = v.as_array()?;
                    if arr.len() >= 2 {
                        Some((arr[0].as_u64()? as u32, arr[1].as_u64()? as u32))
                    } else {
                        None
                    }
                });
                MemoryToolCommand::View {
                    path: path.to_string(),
                    view_range,
                }
            }
            "create" => {
                let file_text = input
                    .get("file_text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                MemoryToolCommand::Create {
                    path: path.to_string(),
                    file_text: file_text.to_string(),
                }
            }
            "str_replace" => {
                let old_str = input.get("old_str").and_then(|v| v.as_str()).unwrap_or("");
                let new_str = input.get("new_str").and_then(|v| v.as_str()).unwrap_or("");
                MemoryToolCommand::StrReplace {
                    path: path.to_string(),
                    old_str: old_str.to_string(),
                    new_str: new_str.to_string(),
                }
            }
            "insert" => {
                let insert_line = input
                    .get("insert_line")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1) as u32;
                let new_str = input.get("new_str").and_then(|v| v.as_str()).unwrap_or("");
                MemoryToolCommand::Insert {
                    path: path.to_string(),
                    insert_line,
                    new_str: new_str.to_string(),
                }
            }
            "delete" => MemoryToolCommand::Delete {
                path: path.to_string(),
            },
            "rename" => {
                let new_path = input.get("new_path").and_then(|v| v.as_str()).unwrap_or("");
                MemoryToolCommand::Rename {
                    old_path: path.to_string(),
                    new_path: new_path.to_string(),
                }
            }
            _ => {
                return format!("Unknown memory command: {}", command);
            }
        };

        let result = tool.execute(cmd);
        if result.success {
            result.output
        } else {
            result.error.unwrap_or_else(|| "Unknown error".to_string())
        }
    }

    /// Map Anthropic model ID to Bedrock model ID
    fn map_to_bedrock_model(model: &str) -> String {
        match model {
            // Claude 4.5 models (cross-region inference)
            "claude-sonnet-4-20250514" => "us.anthropic.claude-sonnet-4-5-20250929-v1:0".to_string(),
            "claude-opus-4-20250514" => "global.anthropic.claude-opus-4-5-20251101-v1:0".to_string(),
            // Claude 3.5 models
            "claude-3-5-sonnet-20241022" => "us.anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            "claude-3-5-haiku-20241022" => "us.anthropic.claude-3-5-haiku-20241022-v1:0".to_string(),
            // Claude 3 models
            "claude-3-sonnet-20240229" => "us.anthropic.claude-3-sonnet-20240229-v1:0".to_string(),
            "claude-3-haiku-20240307" => "us.anthropic.claude-3-haiku-20240307-v1:0".to_string(),
            "claude-3-opus-20240229" => "us.anthropic.claude-3-opus-20240229-v1:0".to_string(),
            // If already in bedrock format, use as-is
            _ => {
                if model.starts_with("anthropic.")
                    || model.starts_with("us.anthropic.")
                    || model.starts_with("global.anthropic.")
                {
                    model.to_string()
                } else {
                    // Default to cross-region inference format
                    format!("us.anthropic.{}-v1:0", model)
                }
            }
        }
    }

    /// Send message using AWS Bedrock Converse API
    /// Implements tool use loop for memory operations when workspace is provided
    async fn send_bedrock(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let region = request
            .config
            .region
            .unwrap_or_else(|| "us-east-1".to_string());

        let raw_model = request
            .config
            .model
            .clone()
            .unwrap_or_else(|| "us.anthropic.claude-sonnet-4-5-20250929-v1:0".to_string());
        let model_id = Self::map_to_bedrock_model(&raw_model);
        let system_prompt = request.system_prompt.clone();
        let max_tokens = request.max_tokens;
        let temperature = request.temperature;

        log::info!("Bedrock request: region={}, model_id={}", region, model_id);

        // Build AWS config
        let mut config_loader = aws_config::defaults(BehaviorVersion::latest())
            .region(aws_sdk_bedrockruntime::config::Region::new(region.clone()));

        // Use specific profile if provided
        if let Some(profile) = &request.config.aws_profile {
            config_loader = config_loader.profile_name(profile);
        }

        let aws_config = config_loader.load().await;
        let client = aws_sdk_bedrockruntime::Client::new(&aws_config);

        // Convert messages to Bedrock format with multimodal support
        let mut messages: Vec<BedrockMessage> = request
            .messages
            .into_iter()
            .map(|m| Self::convert_to_bedrock_message(m))
            .collect();

        // Set up memory tool if workspace is provided
        let tool_config = request.workspace.as_ref().map(|_| Self::create_bedrock_memory_tool());
        let memory_tool = request.workspace.as_ref().map(|ws| MemoryTool::new(Path::new(ws)));

        // Track total usage across the loop
        let mut total_input_tokens = 0u32;
        let mut total_output_tokens = 0u32;
        let mut final_text = String::new();

        // Tool use loop - continue until end_turn
        const MAX_ITERATIONS: u32 = 10;
        for iteration in 0..MAX_ITERATIONS {
            log::info!("Bedrock request iteration {}", iteration + 1);

            // Build converse request
            let mut converse_request = client
                .converse()
                .model_id(&model_id)
                .set_messages(Some(messages.clone()));

            // Add system prompt if provided
            if let Some(ref system) = system_prompt {
                converse_request =
                    converse_request.system(SystemContentBlock::Text(system.clone()));
            }

            // Add tool configuration if available
            if let Some(ref tc) = tool_config {
                converse_request = converse_request.tool_config(tc.clone());
            }

            // Add inference config
            let mut inference_config =
                aws_sdk_bedrockruntime::types::InferenceConfiguration::builder();
            if let Some(mt) = max_tokens {
                inference_config = inference_config.max_tokens(mt as i32);
            }
            if let Some(temp) = temperature {
                inference_config = inference_config.temperature(temp);
            }
            converse_request = converse_request.inference_config(inference_config.build());

            // Send request
            let response = converse_request
                .send()
                .await
                .map_err(|e| {
                    log::error!("Bedrock converse error: {:?}", e);
                    format!("Bedrock request failed (model: {}): {}", model_id, e)
                })?;

            // Accumulate usage
            if let Some(u) = response.usage() {
                total_input_tokens += u.input_tokens() as u32;
                total_output_tokens += u.output_tokens() as u32;
            }

            // Check stop reason - returns &StopReason
            let stop_reason = response.stop_reason();
            log::info!("Bedrock stop reason: {:?}", stop_reason);

            let is_tool_use = *stop_reason == BedrockStopReason::ToolUse;
            let is_end_turn = *stop_reason == BedrockStopReason::EndTurn;

            if is_end_turn {
                // Final response - extract text and return
                final_text = Self::extract_bedrock_text(&response);
                break;
            } else if is_tool_use {
                // Handle tool use
                if let Some(ref tool) = memory_tool {
                    // Get content blocks from response
                    let content_blocks = Self::extract_bedrock_content_blocks(&response);

                    // Add assistant message with tool use to conversation
                    let mut assistant_builder = BedrockMessage::builder()
                        .role(ConversationRole::Assistant);
                    for block in &content_blocks {
                        assistant_builder = assistant_builder.content(block.clone());
                    }
                    messages.push(assistant_builder.build().unwrap());

                    // Process tool uses and collect results
                    let mut tool_results: Vec<BedrockContent> = Vec::new();

                    for block in &content_blocks {
                        if let BedrockContent::ToolUse(tool_use) = block {
                            let tool_use_id = tool_use.tool_use_id();
                            let tool_name = tool_use.name();
                            let input = tool_use.input();

                            log::info!("Executing Bedrock memory tool: {} with input: {:?}", tool_name, input);

                            if tool_name == "memory" {
                                // Parse and execute memory command
                                let result = Self::execute_memory_command_from_document(tool, input);
                                tool_results.push(BedrockContent::ToolResult(
                                    ToolResultBlock::builder()
                                        .tool_use_id(tool_use_id)
                                        .content(ToolResultContentBlock::Text(result))
                                        .build()
                                        .unwrap(),
                                ));
                            } else {
                                tool_results.push(BedrockContent::ToolResult(
                                    ToolResultBlock::builder()
                                        .tool_use_id(tool_use_id)
                                        .content(ToolResultContentBlock::Text(format!("Unknown tool: {}", tool_name)))
                                        .build()
                                        .unwrap(),
                                ));
                            }
                        }
                    }

                    // Add user message with tool results
                    if !tool_results.is_empty() {
                        let mut user_builder = BedrockMessage::builder()
                            .role(ConversationRole::User);
                        for result in tool_results {
                            user_builder = user_builder.content(result);
                        }
                        messages.push(user_builder.build().unwrap());
                    }
                } else {
                    // No memory tool available - extract text and return
                    log::warn!("Got tool_use but no memory tool available");
                    final_text = Self::extract_bedrock_text(&response);
                    break;
                }
            } else {
                // Other stop reasons - extract text and return
                final_text = Self::extract_bedrock_text(&response);
                break;
            }
        }

        Ok(ChatResponse {
            content: final_text,
            model: model_id,
            usage: Some(TokenUsage {
                input_tokens: total_input_tokens,
                output_tokens: total_output_tokens,
            }),
        })
    }

    /// Convert ChatMessage to Bedrock Message
    fn convert_to_bedrock_message(m: ChatMessage) -> BedrockMessage {
        let role = match m.role.as_str() {
            "user" => ConversationRole::User,
            "assistant" => ConversationRole::Assistant,
            _ => ConversationRole::User,
        };

        let content_blocks: Vec<BedrockContent> = match m.content {
            MessageContent::Text(text) => vec![BedrockContent::Text(text)],
            MessageContent::Blocks(blocks) => blocks
                .into_iter()
                .map(|b| match b {
                    ContentBlock::Text { text } => BedrockContent::Text(text),
                    ContentBlock::Image { source } => {
                        // Decode base64 to bytes
                        let image_bytes = BASE64_STANDARD
                            .decode(&source.data)
                            .unwrap_or_default();

                        // Determine image format from media type
                        let format = match source.media_type.as_str() {
                            "image/png" => ImageFormat::Png,
                            "image/jpeg" | "image/jpg" => ImageFormat::Jpeg,
                            "image/gif" => ImageFormat::Gif,
                            "image/webp" => ImageFormat::Webp,
                            _ => ImageFormat::Png,
                        };

                        BedrockContent::Image(
                            ImageBlock::builder()
                                .source(
                                    BedrockImageSource::Bytes(Blob::new(image_bytes)),
                                )
                                .format(format)
                                .build()
                                .unwrap(),
                        )
                    }
                })
                .collect(),
        };

        let mut builder = BedrockMessage::builder().role(role);
        for block in content_blocks {
            builder = builder.content(block);
        }
        builder.build().unwrap()
    }

    /// Create Bedrock memory tool configuration
    fn create_bedrock_memory_tool() -> ToolConfiguration {
        let input_schema = Document::Object(
            [
                ("type".to_string(), Document::String("object".to_string())),
                ("properties".to_string(), Document::Object(
                    [
                        ("command".to_string(), Document::Object(
                            [
                                ("type".to_string(), Document::String("string".to_string())),
                                ("enum".to_string(), Document::Array(vec![
                                    Document::String("view".to_string()),
                                    Document::String("create".to_string()),
                                    Document::String("str_replace".to_string()),
                                    Document::String("insert".to_string()),
                                    Document::String("delete".to_string()),
                                ])),
                                ("description".to_string(), Document::String("The operation to perform".to_string())),
                            ].into_iter().collect()
                        )),
                        ("path".to_string(), Document::Object(
                            [
                                ("type".to_string(), Document::String("string".to_string())),
                                ("description".to_string(), Document::String("File path relative to memories directory".to_string())),
                            ].into_iter().collect()
                        )),
                        ("file_text".to_string(), Document::Object(
                            [
                                ("type".to_string(), Document::String("string".to_string())),
                                ("description".to_string(), Document::String("For 'create': content of the new file".to_string())),
                            ].into_iter().collect()
                        )),
                        ("old_str".to_string(), Document::Object(
                            [
                                ("type".to_string(), Document::String("string".to_string())),
                                ("description".to_string(), Document::String("For 'str_replace': text to find".to_string())),
                            ].into_iter().collect()
                        )),
                        ("new_str".to_string(), Document::Object(
                            [
                                ("type".to_string(), Document::String("string".to_string())),
                                ("description".to_string(), Document::String("For 'str_replace' or 'insert': new text".to_string())),
                            ].into_iter().collect()
                        )),
                        ("insert_line".to_string(), Document::Object(
                            [
                                ("type".to_string(), Document::String("integer".to_string())),
                                ("description".to_string(), Document::String("For 'insert': line number (1-indexed)".to_string())),
                            ].into_iter().collect()
                        )),
                    ].into_iter().collect()
                )),
                ("required".to_string(), Document::Array(vec![
                    Document::String("command".to_string()),
                    Document::String("path".to_string()),
                ])),
            ].into_iter().collect()
        );

        let tool_spec = ToolSpecification::builder()
            .name("memory")
            .description("Manage persistent memory files. Use this to save, update, or read information that should persist across conversations.")
            .input_schema(ToolInputSchema::Json(input_schema))
            .build()
            .unwrap();

        ToolConfiguration::builder()
            .tools(BedrockTool::ToolSpec(tool_spec))
            .build()
            .unwrap()
    }

    /// Extract text content from Bedrock response
    fn extract_bedrock_text(response: &aws_sdk_bedrockruntime::operation::converse::ConverseOutput) -> String {
        response
            .output()
            .and_then(|output| {
                if let aws_sdk_bedrockruntime::types::ConverseOutput::Message(msg) = output {
                    Some(
                        msg.content()
                            .iter()
                            .filter_map(|c| {
                                if let BedrockContent::Text(text) = c {
                                    Some(text.clone())
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join(""),
                    )
                } else {
                    None
                }
            })
            .unwrap_or_default()
    }

    /// Extract content blocks from Bedrock response
    fn extract_bedrock_content_blocks(response: &aws_sdk_bedrockruntime::operation::converse::ConverseOutput) -> Vec<BedrockContent> {
        response
            .output()
            .map(|output| {
                if let aws_sdk_bedrockruntime::types::ConverseOutput::Message(msg) = output {
                    msg.content().to_vec()
                } else {
                    Vec::new()
                }
            })
            .unwrap_or_default()
    }

    /// Execute memory command from Bedrock Document input
    fn execute_memory_command_from_document(tool: &MemoryTool, input: &Document) -> String {
        use crate::memory_tool::MemoryToolCommand;

        // Helper to extract string from Document
        fn get_str(doc: &Document, key: &str) -> Option<String> {
            if let Document::Object(map) = doc {
                map.get(key).and_then(|v| {
                    if let Document::String(s) = v {
                        Some(s.clone())
                    } else {
                        None
                    }
                })
            } else {
                None
            }
        }

        fn get_int(doc: &Document, key: &str) -> Option<u32> {
            if let Document::Object(map) = doc {
                map.get(key).and_then(|v| {
                    if let Document::Number(n) = v {
                        // Convert through f64
                        Some(n.to_f64_lossy() as u32)
                    } else {
                        None
                    }
                })
            } else {
                None
            }
        }

        let command = get_str(input, "command").unwrap_or_default();
        let path = get_str(input, "path").unwrap_or_default();

        let cmd = match command.as_str() {
            "view" => MemoryToolCommand::View {
                path,
                view_range: None,
            },
            "create" => {
                let file_text = get_str(input, "file_text").unwrap_or_default();
                MemoryToolCommand::Create { path, file_text }
            }
            "str_replace" => {
                let old_str = get_str(input, "old_str").unwrap_or_default();
                let new_str = get_str(input, "new_str").unwrap_or_default();
                MemoryToolCommand::StrReplace { path, old_str, new_str }
            }
            "insert" => {
                let insert_line = get_int(input, "insert_line").unwrap_or(1);
                let new_str = get_str(input, "new_str").unwrap_or_default();
                MemoryToolCommand::Insert { path, insert_line, new_str }
            }
            "delete" => MemoryToolCommand::Delete { path },
            "rename" => {
                let new_path = get_str(input, "new_path").unwrap_or_default();
                MemoryToolCommand::Rename { old_path: path, new_path }
            }
            _ => {
                return format!("Unknown memory command: {}", command);
            }
        };

        let result = tool.execute(cmd);
        if result.success {
            result.output
        } else {
            result.error.unwrap_or_else(|| "Unknown error".to_string())
        }
    }

    /// Send message using OpenAI-compatible API
    async fn send_openai(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let base_url = request
            .config
            .base_url
            .unwrap_or_else(|| "https://api.openai.com".to_string());
        let model = request
            .config
            .model
            .unwrap_or_else(|| "gpt-4o".to_string());
        let api_key = request
            .config
            .api_key
            .ok_or("API key is required for OpenAI provider")?;

        // Build messages with optional system prompt
        let mut messages: Vec<OpenAIMessage> = Vec::new();

        if let Some(system) = request.system_prompt {
            messages.push(OpenAIMessage {
                role: "system".to_string(),
                content: system,
            });
        }

        messages.extend(request.messages.into_iter().map(|m| {
            // OpenAI multimodal support is limited, convert to text for now
            let content = match m.content {
                MessageContent::Text(text) => text,
                MessageContent::Blocks(blocks) => blocks
                    .into_iter()
                    .filter_map(|b| match b {
                        ContentBlock::Text { text } => Some(text),
                        ContentBlock::Image { .. } => Some("[Image attached - OpenAI vision API not fully supported yet]".to_string()),
                    })
                    .collect::<Vec<_>>()
                    .join("\n"),
            };
            OpenAIMessage {
                role: m.role,
                content,
            }
        }));

        let api_request = OpenAIRequest {
            model: model.clone(),
            messages,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
            stream: false,
        };

        let response = self
            .http_client
            .post(format!("{}/v1/chat/completions", base_url))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&api_request)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("API error ({}): {}", status, text));
        }

        let api_response: OpenAIResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let content = api_response
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        let usage = api_response.usage.map(|u| TokenUsage {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
        });

        Ok(ChatResponse {
            content,
            model: api_response.model,
            usage,
        })
    }
}

impl Default for ChatClient {
    fn default() -> Self {
        Self::new()
    }
}
