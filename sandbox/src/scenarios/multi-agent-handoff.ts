import type { OptimaClient } from '@agent-optima/sdk-node';
import { makeTraceId } from '../lib/ids.js';
import { createSandboxTracer } from '../lib/client.js';
import { callMcp } from '../mock-mcp/index.js';
import { runTool } from '../mock-tools/index.js';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function runMultiAgentHandoff(
  client: OptimaClient,
  projectId: string,
): Promise<void> {
  const traceId = makeTraceId();

  // Three tracers share the same traceId but different agentIds
  const orchestrator = createSandboxTracer(client, projectId, traceId, 'orchestrator');
  const researcher = createSandboxTracer(client, projectId, traceId, 'researcher');
  const writer = createSandboxTracer(client, projectId, traceId, 'writer');

  console.log(`[multi-agent-handoff] starting trace ${traceId}`);

  // 1. Orchestrator starts
  await orchestrator.event('agent_start', {
    name: 'Orchestrator',
    input: { task: 'Research and write a blog post about AI in 2025' },
  });

  // 2. Orchestrator hands off to researcher
  await sleep(100 + Math.random() * 100);
  await orchestrator.event('agent_handoff', {
    actorId: 'orchestrator',
    name: 'researcher',
    input: { task: 'Research AI trends 2025' },
  });

  // 3. Researcher starts, reads file via MCP
  await researcher.event('agent_start', {
    name: 'Researcher',
    input: { task: 'Research AI trends 2025' },
  });

  await sleep(50);
  const fsResult = await callMcp('http://localhost:4010/mcp', 'read_file', { path: '/data/ai-trends.txt' });
  await researcher.event('mcp_call', {
    actorId: 'mcp-filesystem',
    name: 'read_file',
    input: { path: '/data/ai-trends.txt' },
    output: fsResult.ok ? fsResult.result : undefined,
    latencyMs: fsResult.latencyMs,
    success: fsResult.ok,
    error: fsResult.ok ? undefined : { type: 'PermissionDenied', message: fsResult.error },
  });

  // 4. Researcher model call
  await sleep(200 + Math.random() * 300);
  await researcher.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Summarise AI trends for 2025' }] },
    output: { content: 'Key AI trends: multimodal models, agentic workflows, reasoning models…' },
    latencyMs: 350,
    metadata: { inputTokens: 400, outputTokens: 180, model: 'gpt-4o' },
  });

  // 5. Researcher ends
  await researcher.event('agent_end', {
    name: 'Researcher',
    output: { research: 'AI trends 2025 summary complete' },
    success: true,
  });

  // 6. Orchestrator hands off to writer
  await sleep(100);
  await orchestrator.event('agent_handoff', {
    actorId: 'orchestrator',
    name: 'writer',
    input: { research: 'AI trends 2025 summary', format: 'blog post' },
  });

  // 7. Writer starts
  await writer.event('agent_start', {
    name: 'Writer',
    input: { research: 'AI trends 2025 summary', format: 'blog post' },
  });

  // 8. Writer model call
  await sleep(300 + Math.random() * 400);
  await writer.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Write a blog post about AI in 2025' }] },
    output: { content: '# AI in 2025: The Year of Agents\n\nThis year…' },
    latencyMs: 520,
    metadata: { inputTokens: 600, outputTokens: 800, model: 'gpt-4o' },
  });

  // 9. Writer uses summariser tool
  const summary = await runTool('summariser', { text: '# AI in 2025…' });
  await writer.event('tool_call', {
    name: 'summariser',
    input: { text: '# AI in 2025…' },
    output: summary.output,
    latencyMs: summary.latencyMs,
    success: true,
  });

  // 10. Writer ends
  await writer.event('agent_end', {
    name: 'Writer',
    output: { post: 'AI in 2025: The Year of Agents' },
    success: true,
  });

  // 11. Orchestrator ends
  await orchestrator.event('agent_end', {
    name: 'Orchestrator',
    output: { status: 'Blog post published' },
    success: true,
  });

  console.log(`[multi-agent-handoff] done — trace ${traceId}`);
}
