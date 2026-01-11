# LLM 통합 설계

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│                         │                                │
│                    invoke('process_with_llm')            │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                    Rust Backend                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              LLM Service                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────┐  │    │
│  │  │ Claude  │  │ OpenAI  │  │ Ollama (Local)  │  │    │
│  │  │ Client  │  │ Client  │  │    Client       │  │    │
│  │  └────┬────┘  └────┬────┘  └────────┬────────┘  │    │
│  │       └────────────┼────────────────┘           │    │
│  │                    ▼                             │    │
│  │         LLMProvider Trait (공통 인터페이스)       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Rust LLM Provider 추상화

```rust
// src-tauri/src/llm/mod.rs

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMMessage {
    pub role: String,      // "user", "assistant", "system"
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMRequest {
    pub messages: Vec<LLMMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMResponse {
    pub content: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn complete(&self, request: LLMRequest) -> Result<LLMResponse, LLMError>;
    fn name(&self) -> &str;
}

// Claude 구현
pub struct ClaudeProvider {
    api_key: String,
    model: String,
}

impl ClaudeProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            model: "claude-sonnet-4-20250514".to_string(),
        }
    }
}

#[async_trait]
impl LLMProvider for ClaudeProvider {
    async fn complete(&self, request: LLMRequest) -> Result<LLMResponse, LLMError> {
        // Anthropic API 호출 구현
        todo!()
    }

    fn name(&self) -> &str {
        "claude"
    }
}

// Ollama 구현 (추후)
pub struct OllamaProvider {
    base_url: String,
    model: String,
}

#[async_trait]
impl LLMProvider for OllamaProvider {
    async fn complete(&self, request: LLMRequest) -> Result<LLMResponse, LLMError> {
        // Ollama API 호출 구현
        todo!()
    }

    fn name(&self) -> &str {
        "ollama"
    }
}
```

## 주요 LLM 기능

### 1. Plan 파싱
사용자 입력을 구조화된 Plan으로 변환

```rust
// src-tauri/src/llm/prompts.rs

pub const PARSE_PLAN_SYSTEM: &str = r#"
당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
사용자의 계획을 분석하여 구조화된 JSON으로 변환해주세요.

응답 형식:
{
  "title": "계획 제목",
  "goals": ["목표1", "목표2"],
  "milestones": [
    {
      "title": "마일스톤",
      "targetDate": "2024-12-31",
      "tasks": ["세부 태스크1", "세부 태스크2"]
    }
  ],
  "suggestedTasks": [
    {
      "title": "일일 태스크",
      "estimatedDuration": 30,
      "priority": 1,
      "frequency": { "type": "daily" }
    }
  ]
}
"#;
```

### 2. 일일 태스크 생성
Plan 기반으로 오늘의 TODO 생성

```rust
pub const GENERATE_DAILY_TASKS_SYSTEM: &str = r#"
오늘 날짜와 사용자의 Plan을 기반으로 적절한 일일 태스크를 생성해주세요.

고려사항:
- 사용자의 현재 진행 상황
- 마감일과의 거리
- 이전 태스크 완료율
- ADHD 친화적인 작은 단위로 분해

응답 형식:
{
  "tasks": [
    {
      "title": "태스크 제목",
      "description": "설명",
      "estimatedDuration": 25,
      "priority": 1,
      "scheduledTime": "09:00"
    }
  ],
  "summary": "오늘의 개요 설명"
}
"#;
```

### 3. 태스크 분해
큰 태스크를 작은 서브태스크로 분해

```rust
pub const SPLIT_TASK_SYSTEM: &str = r#"
주어진 태스크를 ADHD 친화적인 작은 단위(5-15분)로 분해해주세요.

원칙:
- 각 서브태스크는 명확하고 구체적으로
- 시작하기 쉬운 작은 첫 단계
- 완료 기준이 명확해야 함

응답 형식:
{
  "subtasks": [
    { "title": "서브태스크", "estimatedMinutes": 10 }
  ]
}
"#;
```

### 4. 적응형 알림 메시지
현재 상황에 맞는 알림 생성

```rust
pub const GENERATE_NOTIFICATION_SYSTEM: &str = r#"
현재 태스크 상황을 보고 적절한 알림 메시지를 생성해주세요.
ADHD 환자에게 도움이 되도록:
- 부담스럽지 않게
- 구체적으로
- 격려하는 톤으로

응답 형식:
{
  "title": "알림 제목",
  "body": "알림 본문",
  "urgency": "low" | "medium" | "high"
}
"#;
```

## TypeScript 클라이언트 (packages/llm-client)

```typescript
// packages/llm-client/src/types.ts

export interface LLMProvider {
  name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// packages/llm-client/src/tauri-bridge.ts
// Tauri 커맨드를 통해 Rust 백엔드의 LLM 호출

import { invoke } from '@tauri-apps/api/core';

export async function processWithLLM(
  prompt: string,
  context: Record<string, unknown>
): Promise<LLMResponse> {
  return invoke('process_with_llm', { prompt, context });
}
```

## 보안 고려사항

1. **API 키 관리**: Rust 백엔드에서만 처리, 프론트엔드에 노출 안함
2. **로컬 저장**: `tauri-plugin-store` 또는 시스템 키체인 사용
3. **로컬 LLM 옵션**: 민감한 데이터는 로컬에서만 처리 가능
