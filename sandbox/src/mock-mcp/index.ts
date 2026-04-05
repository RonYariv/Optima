import type { Server } from 'http';
import { startFilesystemMcp } from './filesystem.js';
import { startWebSearchMcp } from './web-search.js';

export interface MockMcpHandle {
  stop(): void;
}

export async function startMockMcpServers(): Promise<MockMcpHandle> {
  const fs: Server = await startFilesystemMcp(4010);
  const ws: Server = await startWebSearchMcp(4011);
  return {
    stop() {
      fs.close();
      ws.close();
    },
  };
}

// ── Typed MCP call helper ─────────────────────────────────────────────────────

export interface McpCallResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
  latencyMs: number;
}

export async function callMcp(
  url: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<McpCallResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: toolInput },
      }),
    });
    const json = (await res.json()) as { result?: Record<string, unknown>; error?: { message: string } };
    const latencyMs = Date.now() - start;
    if (json.error) {
      return { ok: false, error: json.error.message, latencyMs };
    }
    return { ok: true, result: json.result, latencyMs };
  } catch (err) {
    return { ok: false, error: String(err), latencyMs: Date.now() - start };
  }
}
