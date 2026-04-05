import type { OptimaClient } from '@agent-optima/sdk-node';
import { makeTraceId } from '../lib/ids.js';
import { createSandboxTracer } from '../lib/client.js';
import { callMcp } from '../mock-mcp/index.js';
import { runTool } from '../mock-tools/index.js';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function runResearchBot(
  client: OptimaClient,
  projectId: string,
): Promise<void> {
  const traceId = makeTraceId();
  const t = createSandboxTracer(client, projectId, traceId, 'research-orchestrator');

  console.log(`[research-bot] starting trace ${traceId}`);

  // 1. Agent starts
  await t.event('agent_start', {
    name: 'Research Orchestrator',
    input: { query: 'Best LLM papers 2025' },
  });

  // 2. Model decides to search
  await sleep(200 + Math.random() * 400);
  await t.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Research LLM papers 2025' }] },
    output: { content: 'I will search the web first.' },
    latencyMs: 320,
    metadata: { inputTokens: 120, outputTokens: 45, model: 'gpt-4o' },
  });

  // 3. MCP web_search
  const searchResult = await callMcp('http://localhost:4011/mcp', 'search', { q: 'LLM papers 2025' });
  await t.event('mcp_call', {
    actorId: 'mcp-web-search',
    name: 'search',
    input: { q: 'LLM papers 2025' },
    output: searchResult.ok ? searchResult.result : undefined,
    latencyMs: searchResult.latencyMs,
    success: searchResult.ok,
    error: searchResult.ok ? undefined : { type: 'RateLimitError', message: searchResult.error },
  });

  // 4. Built-in: calculator (cost estimate)
  const calc = await runTool('calculator', { expr: '3 * 7' });
  await t.event('tool_call', {
    name: 'calculator',
    input: { expr: '3 * 7' },
    output: calc.output,
    latencyMs: calc.latencyMs,
    success: true,
  });

  // 5. Final model call to synthesise
  await sleep(300 + Math.random() * 300);
  await t.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Synthesise findings' }] },
    output: { content: 'Here is the research summary: Top LLM papers of 2025 include…' },
    latencyMs: 410,
    metadata: { inputTokens: 800, outputTokens: 320, model: 'gpt-4o' },
  });

  // 6. Agent ends
  await t.event('agent_end', {
    name: 'Research Orchestrator',
    output: { summary: 'Research complete' },
    success: true,
  });

  console.log(`[research-bot] done — trace ${traceId}`);
}
