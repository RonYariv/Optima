type StatsWindow = '1h' | '24h' | '7d';

interface StatsResponse {
  window: StatsWindow;
  modelCall: {
    count: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  toolCall: {
    count: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  queue: {
    depth: number;
    eventsPerSecond: number;
    drainTimeSec: number | null;
  };
  failures: {
    timeout: number;
    auth: number;
    validation: number;
    provider: number;
  };
}

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

function parseWindow(args: string[]): StatsWindow {
  const windowFlag = getFlag(args, '--window') ?? '1h';
  if (windowFlag === '1h' || windowFlag === '24h' || windowFlag === '7d') return windowFlag;
  console.error('ERROR: --window must be one of: 1h, 24h, 7d');
  process.exit(1);
}

function parseApiBase(args: string[]): string {
  const base =
    getFlag(args, '--api') ??
    process.env['OPTIMA_API_URL'] ??
    'http://localhost:3001';
  return base.replace(/\/$/, '');
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'n/a';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = seconds / 60;
  if (mins < 60) return `${mins.toFixed(1)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export async function showStats(args: string[]): Promise<void> {
  const window = parseWindow(args);
  const apiBase = parseApiBase(args);
  const token = process.env['OPTIMA_TOKEN'];

  const res = await fetch(`${apiBase}/v1/stats?window=${encodeURIComponent(window)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stats request failed: ${res.status} ${res.statusText}\n${body}`);
  }

  const stats = (await res.json()) as StatsResponse;

  console.log(`Window: ${stats.window}`);
  console.log('');
  console.log('Tail Latencies (ms)');
  console.log(`  tool  p50=${stats.toolCall.p50Ms}  p95=${stats.toolCall.p95Ms}  p99=${stats.toolCall.p99Ms}`);
  console.log(`  model p50=${stats.modelCall.p50Ms} p95=${stats.modelCall.p95Ms} p99=${stats.modelCall.p99Ms}`);
  console.log('');
  console.log('Queue Health');
  console.log(`  depth=${stats.queue.depth} events/s=${stats.queue.eventsPerSecond} drain=${formatDuration(stats.queue.drainTimeSec)}`);
  console.log('');
  console.log('Failures Total');
  console.log(`  timeout=${stats.failures.timeout} auth=${stats.failures.auth} validation=${stats.failures.validation} provider=${stats.failures.provider}`);
}
