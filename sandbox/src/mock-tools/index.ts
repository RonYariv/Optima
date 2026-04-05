export interface ToolResult {
  output: Record<string, unknown>;
  latencyMs: number;
  success: boolean;
  errorType?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  const start = Date.now();

  switch (name) {
    case 'calculator': {
      await sleep(5 + Math.random() * 15);
      return { output: { result: 42 }, latencyMs: Date.now() - start, success: true };
    }
    case 'code_executor': {
      await sleep(100 + Math.random() * 200);
      return {
        output: { stdout: `// executed: ${JSON.stringify(input)}`, exitCode: 0 },
        latencyMs: Date.now() - start,
        success: true,
      };
    }
    case 'summariser': {
      await sleep(30 + Math.random() * 50);
      return {
        output: { summary: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit…', tokens: 128 },
        latencyMs: Date.now() - start,
        success: true,
      };
    }
    case 'email_sender': {
      await sleep(50);
      return {
        output: {},
        latencyMs: Date.now() - start,
        success: false,
        errorType: 'RateLimitError',
      };
    }
    default:
      return { output: {}, latencyMs: Date.now() - start, success: false, errorType: 'UnknownTool' };
  }
}
