// LLM types

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
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

export type LLMProviderType = 'claude' | 'openai' | 'ollama';

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
