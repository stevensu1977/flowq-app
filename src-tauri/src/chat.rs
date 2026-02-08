//! Simple chat module for direct LLM API calls without Claude Code tools
//! Supports Anthropic (official, third-party proxy), AWS Bedrock, and OpenAI compatible APIs

use aws_config::BehaviorVersion;
use base64::Engine;
use aws_sdk_bedrockruntime::types::{
    ContentBlock as BedrockContent, ConversationRole, ImageBlock, ImageFormat,
    ImageSource as BedrockImageSource, Message as BedrockMessage, SystemContentBlock,
};
use aws_smithy_types::Blob;
use serde::{Deserialize, Serialize};

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
    stream: bool,
}

/// Anthropic message with multimodal support
#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicContent,
}

/// Anthropic content - can be string or array of content blocks
#[derive(Debug, Serialize)]
#[serde(untagged)]
enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
}

#[derive(Debug, Serialize)]
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
}

#[derive(Debug, Deserialize)]
struct AnthropicResponseContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
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
    async fn send_anthropic(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let base_url = request
            .config
            .base_url
            .unwrap_or_else(|| "https://api.anthropic.com".to_string());
        let model = request
            .config
            .model
            .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string());
        let api_key = request
            .config
            .api_key
            .ok_or("API key is required for Anthropic provider")?;

        let messages: Vec<AnthropicMessage> = request
            .messages
            .into_iter()
            .map(|m| {
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
            })
            .collect();

        let api_request = AnthropicRequest {
            model: model.clone(),
            max_tokens: request.max_tokens.unwrap_or(4096),
            system: request.system_prompt,
            messages,
            temperature: request.temperature,
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

        let content = api_response
            .content
            .into_iter()
            .filter_map(|c| c.text)
            .collect::<Vec<_>>()
            .join("");

        Ok(ChatResponse {
            content,
            model: api_response.model,
            usage: Some(TokenUsage {
                input_tokens: api_response.usage.input_tokens,
                output_tokens: api_response.usage.output_tokens,
            }),
        })
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
    async fn send_bedrock(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let region = request
            .config
            .region
            .unwrap_or_else(|| "us-east-1".to_string());

        let raw_model = request
            .config
            .model
            .unwrap_or_else(|| "us.anthropic.claude-sonnet-4-5-20250929-v1:0".to_string());
        let model_id = Self::map_to_bedrock_model(&raw_model);

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
        let messages: Vec<BedrockMessage> = request
            .messages
            .into_iter()
            .map(|m| {
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
                                let image_bytes = base64::Engine::decode(
                                    &base64::engine::general_purpose::STANDARD,
                                    &source.data,
                                )
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
            })
            .collect();

        // Build converse request
        let mut converse_request = client
            .converse()
            .model_id(&model_id)
            .set_messages(Some(messages));

        // Add system prompt if provided
        if let Some(system) = request.system_prompt {
            converse_request =
                converse_request.system(SystemContentBlock::Text(system));
        }

        // Add inference config
        let mut inference_config =
            aws_sdk_bedrockruntime::types::InferenceConfiguration::builder();
        if let Some(max_tokens) = request.max_tokens {
            inference_config = inference_config.max_tokens(max_tokens as i32);
        }
        if let Some(temp) = request.temperature {
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

        // Extract content from response
        let content = response
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
            .unwrap_or_default();

        // Extract token usage
        let usage = response.usage().map(|u| TokenUsage {
            input_tokens: u.input_tokens() as u32,
            output_tokens: u.output_tokens() as u32,
        });

        Ok(ChatResponse {
            content,
            model: model_id,
            usage,
        })
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
