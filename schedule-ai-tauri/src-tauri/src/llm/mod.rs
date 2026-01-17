use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMRequest {
    pub messages: Vec<LLMMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMResponse {
    pub content: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum LLMError {
    #[error("API error: {0}")]
    ApiError(String),
    #[error("Request error: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("Configuration error: {0}")]
    ConfigError(String),
}

#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn complete(&self, request: LLMRequest) -> Result<LLMResponse, LLMError>;
    fn name(&self) -> &str;
}

pub struct ClaudeProvider {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl ClaudeProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model: "claude-sonnet-4-20250514".to_string(),
        }
    }

    pub fn with_model(mut self, model: String) -> Self {
        self.model = model;
        self
    }

    /// Tool use 기반 structured output completion
    pub async fn complete_structured(
        &self,
        messages: Vec<LLMMessage>,
        schema: serde_json::Value,
        tool_name: &str,
    ) -> Result<String, LLMError> {
        #[derive(Serialize)]
        struct AnthropicRequest {
            model: String,
            max_tokens: u32,
            messages: Vec<AnthropicMessage>,
            tools: Vec<Tool>,
            tool_choice: ToolChoice,
        }

        #[derive(Serialize)]
        struct AnthropicMessage {
            role: String,
            content: String,
        }

        #[derive(Serialize)]
        struct Tool {
            name: String,
            description: String,
            input_schema: serde_json::Value,
        }

        #[derive(Serialize)]
        struct ToolChoice {
            #[serde(rename = "type")]
            choice_type: String,
            name: String,
        }

        let anthropic_messages: Vec<AnthropicMessage> = messages
            .into_iter()
            .map(|m| AnthropicMessage {
                role: m.role,
                content: m.content,
            })
            .collect();

        let tool = Tool {
            name: tool_name.to_string(),
            description: format!("Generate structured {} response", tool_name),
            input_schema: schema,
        };

        let anthropic_request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens: 1024,
            messages: anthropic_messages,
            tools: vec![tool],
            tool_choice: ToolChoice {
                choice_type: "tool".to_string(),
                name: tool_name.to_string(),
            },
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&anthropic_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(LLMError::ApiError(error_text));
        }

        // Parse response with tool_use content block
        #[derive(Deserialize)]
        struct AnthropicResponse {
            content: Vec<ContentBlock>,
        }

        #[derive(Deserialize)]
        #[serde(tag = "type")]
        enum ContentBlock {
            #[serde(rename = "tool_use")]
            ToolUse { input: serde_json::Value },
            #[serde(rename = "text")]
            Text { text: String },
        }

        let anthropic_response: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| LLMError::ParseError(e.to_string()))?;

        // Extract tool_use input
        for block in anthropic_response.content {
            if let ContentBlock::ToolUse { input } = block {
                return Ok(input.to_string());
            }
        }

        Err(LLMError::ParseError("No tool_use block in response".to_string()))
    }
}

#[async_trait]
impl LLMProvider for ClaudeProvider {
    async fn complete(&self, request: LLMRequest) -> Result<LLMResponse, LLMError> {
        #[derive(Serialize)]
        struct AnthropicRequest {
            model: String,
            max_tokens: u32,
            messages: Vec<AnthropicMessage>,
        }

        #[derive(Serialize)]
        struct AnthropicMessage {
            role: String,
            content: String,
        }

        #[derive(Deserialize)]
        struct AnthropicResponse {
            content: Vec<ContentBlock>,
            usage: Usage,
        }

        #[derive(Deserialize)]
        struct ContentBlock {
            text: String,
        }

        #[derive(Deserialize)]
        struct Usage {
            input_tokens: u32,
            output_tokens: u32,
        }

        let anthropic_messages: Vec<AnthropicMessage> = request
            .messages
            .into_iter()
            .map(|m| AnthropicMessage {
                role: m.role,
                content: m.content,
            })
            .collect();

        let anthropic_request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens: request.max_tokens.unwrap_or(4096),
            messages: anthropic_messages,
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&anthropic_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(LLMError::ApiError(error_text));
        }

        let anthropic_response: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| LLMError::ParseError(e.to_string()))?;

        let content = anthropic_response
            .content
            .into_iter()
            .map(|c| c.text)
            .collect::<Vec<_>>()
            .join("");

        Ok(LLMResponse {
            content,
            usage: Some(TokenUsage {
                input_tokens: anthropic_response.usage.input_tokens,
                output_tokens: anthropic_response.usage.output_tokens,
            }),
        })
    }

    fn name(&self) -> &str {
        "claude"
    }
}

pub struct LLMService {
    provider: Arc<dyn LLMProvider>,
}

impl LLMService {
    pub fn new(provider: Arc<dyn LLMProvider>) -> Self {
        Self { provider }
    }

    pub async fn complete(&self, request: LLMRequest) -> Result<LLMResponse, LLMError> {
        self.provider.complete(request).await
    }
}

