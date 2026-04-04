export type ProviderRequest = {
  modelProvider: string;
  modelName: string;
  /** Opaque pass-through payload (messages array, functions, etc.) */
  payload: Record<string, unknown>;
  /** Maximum tokens the caller expects */
  maxTokens?: number;
};

export type ProviderResponse = {
  /** Raw provider response body */
  body: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export interface IProviderAdapter {
  readonly name: string;
  call(req: ProviderRequest): Promise<ProviderResponse>;
}
