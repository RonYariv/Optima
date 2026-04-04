import type { IProviderAdapter, ProviderRequest, ProviderResponse } from './adapter.interface.js';

/**
 * MockAdapter — returns deterministic fake responses.
 * Safe to use in development and testing without spending real tokens.
 */
export class MockAdapter implements IProviderAdapter {
  readonly name = 'mock';

  async call(req: ProviderRequest): Promise<ProviderResponse> {
    const start = Date.now();

    // Simulate network delay in dev
    await new Promise<void>((res) => setTimeout(res, 10 + Math.random() * 40));

    const inputTokens = estimateTokens(req.payload);
    const outputTokens = Math.floor(50 + Math.random() * 150);

    return {
      body: {
        id: `mock-${Date.now()}`,
        object: 'chat.completion',
        model: req.modelName,
        choices: [
          {
            message: {
              role: 'assistant',
              content: `[Mock response for model ${req.modelName}]`,
            },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      },
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - start,
    };
  }
}

function estimateTokens(payload: Record<string, unknown>): number {
  // Rough estimate: 4 chars ≈ 1 token
  return Math.max(1, Math.floor(JSON.stringify(payload).length / 4));
}
