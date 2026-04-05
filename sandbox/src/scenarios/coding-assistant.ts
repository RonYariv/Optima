import type { OptimaClient } from '@agent-optima/sdk-node';
import { makeTraceId } from '../lib/ids.js';
import { createSandboxTracer } from '../lib/client.js';
import { runTool } from '../mock-tools/index.js';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function runCodingAssistant(
  client: OptimaClient,
  tenantId: string,
  projectId: string,
): Promise<void> {
  const traceId = makeTraceId();
  const t = createSandboxTracer(client, tenantId, projectId, traceId, 'code-assistant');

  console.log(`[coding-assistant] starting trace ${traceId}`);

  // 1. Agent starts
  await t.event('agent_start', {
    name: 'Coding Assistant',
    input: { task: 'Write a fibonacci function in Python and email the result' },
  });

  // 2. Model decides to write and run code
  await sleep(200 + Math.random() * 300);
  await t.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Write fibonacci function in Python' }] },
    output: { content: 'def fib(n): return n if n <= 1 else fib(n-1) + fib(n-2)' },
    latencyMs: 280,
    metadata: { inputTokens: 90, outputTokens: 60, model: 'gpt-4o' },
  });

  // 3. tool: code_executor — success
  const codeResult = await runTool('code_executor', { code: 'def fib(n): ...' });
  await t.event('tool_call', {
    name: 'code_executor',
    input: { code: 'def fib(n): return n if n <= 1 else fib(n-1) + fib(n-2)' },
    output: codeResult.output,
    latencyMs: codeResult.latencyMs,
    success: true,
  });

  // 4. Model decides to email the result
  await sleep(150 + Math.random() * 200);
  await t.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Now email this result to the team' }] },
    output: { content: 'I will use the email_sender tool.' },
    latencyMs: 195,
    metadata: { inputTokens: 120, outputTokens: 30, model: 'gpt-4o' },
  });

  // 5. tool: email_sender — FAILS with RateLimitError
  const emailResult = await runTool('email_sender', { to: 'team@example.com', body: 'Here is the fib function…' });
  await t.event('tool_call', {
    name: 'email_sender',
    input: { to: 'team@example.com', body: 'Here is the fib function…' },
    output: emailResult.output,
    latencyMs: emailResult.latencyMs,
    success: false,
    error: { type: emailResult.errorType, message: 'Email rate limit exceeded' },
  });

  // 6. Agent ends with failure
  await t.event('agent_end', {
    name: 'Coding Assistant',
    output: { error: 'Failed to deliver result via email' },
    success: false,
    error: { type: 'RateLimitError', message: 'email_sender rate limit exceeded' },
  });

  console.log(`[coding-assistant] done (failed) — trace ${traceId}`);
}
