import type { IProviderAdapter, ProviderRequest, ProviderResponse } from './adapter.interface.js';
import type { Config } from '../config.js';

/**
 * OpenAIAdapter — thin wrapper over the OpenAI chat completions endpoint.
 * In Phase 1 this is a "stub" that demonstrates the adapter contract;
 * full streaming and function-call support come in Phase 2.
 */
export class OpenAIAdapter implements IProviderAdapter {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(cfg: Pick<Config, 'OPENAI_API_KEY' | 'OPENAI_BASE_URL'>) {
    if (!cfg.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when using the openai provider adapter');
    }
    this.apiKey = cfg.OPENAI_API_KEY;
    this.baseUrl = cfg.OPENAI_BASE_URL;
  }

  async call(req: ProviderRequest): Promise<ProviderResponse> {
    const start = Date.now();

    const url = `${this.baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.modelName,
        max_tokens: req.maxTokens ?? 1024,
        ...req.payload,
      }),
    });

    if (!res.ok) {
      const error = await res.text().catch(() => 'unknown error');
      throw new Error(`OpenAI call failed [${res.status}]: ${error}`);
    }

    const body = (await res.json()) as Record<string, unknown>;
    const usage = body['usage'] as Record<string, number> | undefined;

    return {
      body,
      inputTokens: usage?.['prompt_tokens'] ?? 0,
      outputTokens: usage?.['completion_tokens'] ?? 0,
      latencyMs: Date.now() - start,
    };
  }
}
