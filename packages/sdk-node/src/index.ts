// ─── Payload types (mirrors packages/schemas, zero runtime deps) ─────────────

export type ModelProvider = 'openai' | 'anthropic' | 'azure-openai' | 'other';
export type FailureSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FailureCategory =
  | 'tool_error'
  | 'provider_error'
  | 'logic_break'
  | 'handoff_error'
  | 'unknown';

export interface ModelCallPayload {
  tenantId: string;
  projectId: string;
  traceId: string;
  stepId: string;
  agentId: string;
  modelProvider: ModelProvider;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** ISO 8601 datetime string */
  requestAt: string;
  /** ISO 8601 datetime string */
  responseAt: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallPayload {
  tenantId: string;
  projectId: string;
  traceId: string;
  stepId: string;
  agentId: string;
  toolName: string;
  success: boolean;
  latencyMs: number;
  errorType?: string;
  /** ISO 8601 datetime string */
  requestAt: string;
  /** ISO 8601 datetime string */
  responseAt: string;
  metadata?: Record<string, unknown>;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export interface OptimaClientOptions {
  /** Base URL of the api-gateway, e.g. http://optima-gateway:3000 */
  url: string;
  /** Bearer token issued by the gateway */
  token: string;
  /** When true, swallows network errors so your agent never crashes. Default: true */
  silent?: boolean;
}

export class OptimaClient {
  private readonly url: string;
  private readonly token: string;
  private readonly silent: boolean;

  constructor(options: OptimaClientOptions) {
    this.url = options.url.replace(/\/$/, '');
    this.token = options.token;
    this.silent = options.silent ?? true;
  }

  readonly ingest = {
    modelCall: (payload: ModelCallPayload): Promise<void> =>
      this.post('/v1/ingest/model-call', payload),

    toolCall: (payload: ToolCallPayload): Promise<void> =>
      this.post('/v1/ingest/tool-call', payload),
  };

  private async post(path: string, body: unknown): Promise<void> {
    try {
      const res = await fetch(`${this.url}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Optima ingest failed (${res.status}): ${text}`);
      }
    } catch (err) {
      if (!this.silent) throw err;
      // silent mode: fire-and-forget, never crash the agent
    }
  }
}
