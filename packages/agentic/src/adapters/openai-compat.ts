import type { LLMAdapter, LLMMessage, LLMResponse, Tool, ToolCallRequest } from '../types.js'
import { PROVIDER_DEFAULTS, type LLMConfig } from '../types.js'

/**
 * OpenAI-compatible LLM adapter.
 *
 * Works with any provider that implements the OpenAI chat-completions API:
 *   - Groq      → baseUrl: 'https://api.groq.com/openai/v1'
 *   - OpenAI    → baseUrl: 'https://api.openai.com/v1'
 *   - Ollama    → baseUrl: 'http://localhost:11434/v1'
 *   - Together  → baseUrl: 'https://api.together.xyz/v1'
 */
export class OpenAICompatAdapter implements LLMAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(config: { baseUrl: string; apiKey: string; model: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.model = config.model
  }

  async chat(messages: LLMMessage[], tools?: Tool[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    }

    if (tools && tools.length > 0) {
      body['tools'] = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
      body['tool_choice'] = 'auto'
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`LLM API error ${res.status}: ${text}`)
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: {
          content: string | null
          tool_calls?: ToolCallRequest[]
        }
      }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    const choice = data.choices[0]
    if (!choice) throw new Error('LLM returned no choices')

    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
    }
  }
}

/** Create an adapter from a LLMConfig (resolves baseUrl from provider preset). */
export function createAdapterFromConfig(config: LLMConfig): OpenAICompatAdapter {
  const preset = PROVIDER_DEFAULTS[config.provider]
  const baseUrl = config.provider === 'custom' ? (config.baseUrl ?? '') : preset.baseUrl

  if (!baseUrl) throw new Error('baseUrl is required for custom provider')
  if (!config.apiKey) throw new Error('apiKey is required')
  if (!config.model) throw new Error('model is required')

  return new OpenAICompatAdapter({ baseUrl, apiKey: config.apiKey, model: config.model })
}
