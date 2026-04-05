// ─── LLM wire types (OpenAI-compatible) ───────────────────────────────────────

export interface ToolCallRequest {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCallRequest[]
}

export interface LLMResponse {
  content: string | null
  toolCalls?: ToolCallRequest[]
  usage?: { inputTokens: number; outputTokens: number }
}

// ─── Tool ──────────────────────────────────────────────────────────────────────

export interface Tool<TArgs = Record<string, unknown>> {
  name: string
  description: string
  /** JSON Schema for the arguments object */
  parameters: Record<string, unknown>
  run(args: TArgs): Promise<unknown>
}

// ─── Adapter interface ─────────────────────────────────────────────────────────

export interface LLMAdapter {
  chat(messages: LLMMessage[], tools?: Tool[]): Promise<LLMResponse>
}

// ─── Agent definition ──────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string
  name: string
  description: string
  systemPrompt: string
  tools?: Tool[]
}

// ─── LLM provider config ───────────────────────────────────────────────────────

export type LLMProvider = 'groq' | 'openai' | 'custom'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model: string
  baseUrl?: string // required for 'custom', ignored for groq / openai
}

export const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; defaultModel: string }> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  custom: {
    baseUrl: '',
    defaultModel: '',
  },
}

// ─── Chat message (UI-facing) ──────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
