import type { Trace, TraceStep, ModelCall, ToolCall, FailureEvent, AuditEvent } from '@agent-optima/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepWithDetails = TraceStep & {
  modelCalls: ModelCall[];
  toolCalls: ToolCall[];
  failureEvents: FailureEvent[];
};

type RFNode = {
  id: string;
  type: 'agent' | 'model_call' | 'tool_call';
  position: { x: number; y: number };
  data: Record<string, unknown>;
};
type RFEdge = { id: string; source: string; target: string };

export type TraceWithSteps = Trace & { steps: StepWithDetails[] };

// ── Constants ─────────────────────────────────────────────────────────────────

const GRAPH_STEP_HEIGHT_PX = 120;

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Converts a fully-hydrated trace into a React Flow–compatible node/edge graph
 * (CODE-4). Pure function — no DB I/O, easily unit-testable.
 */
export function buildTraceGraph(
  trace: TraceWithSteps,
  auditLog: AuditEvent[] = [],
): {
  nodes: RFNode[];
  edges: RFEdge[];
} {
  const nodes: RFNode[] = [];
  const edges: RFEdge[] = [];

  const rootId = `agent-${trace.agentId}`;
  nodes.push({
    id: rootId,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: { label: trace.agentId, status: trace.status },
  });

  trace.steps.forEach((step: StepWithDetails, i: number) => {
    const failure = step.failureEvents[0] ?? null;
    const stepStatus = failure ? 'failed' : 'success';
    const yPos = (i + 1) * GRAPH_STEP_HEIGHT_PX;

    if (step.type === 'model') {
      const mc = step.modelCalls[0] ?? null;
      nodes.push({
        id: step.id,
        type: 'model_call',
        position: { x: 0, y: yPos },
        data: {
          label: mc?.modelName ?? step.agentId,
          status: stepStatus,
          latencyMs: mc?.latencyMs ?? null,
          inputTokens: mc?.inputTokens ?? null,
          outputTokens: mc?.outputTokens ?? null,
          // Drizzle returns numeric columns as strings — convert to number for JSON
          costUsd: mc?.costUsd != null ? Number(mc.costUsd) : null,
          failureReason: failure?.reason ?? null,
        },
      });
    } else {
      const tc = step.toolCalls[0] ?? null;
      nodes.push({
        id: step.id,
        type: 'tool_call',
        position: { x: 0, y: yPos },
        data: {
          label: tc?.toolName ?? step.agentId,
          status: stepStatus,
          latencyMs: tc?.latencyMs ?? null,
          success: tc?.success ?? null,
          errorType: tc?.errorType ?? null,
          failureReason: failure?.reason ?? null,
        },
      });
    }

    const sourceId = i === 0 ? rootId : (trace.steps[i - 1] as StepWithDetails).id;
    edges.push({ id: `e-${sourceId}-${step.id}`, source: sourceId, target: step.id });
  });

  // For traces that were captured via audit events only (no trace_steps/model_calls/tool_calls rows),
  // synthesize a useful graph from ordered audit events so the UI is not empty.
  if (trace.steps.length === 0) {
    const graphEvents = auditLog.filter((ev) =>
      ev.kind === 'model_call' || ev.kind === 'tool_call' || ev.kind === 'mcp_call',
    );

    graphEvents.forEach((ev, i) => {
      const nodeId = `audit-${ev.id}`;
      const yPos = (i + 1) * GRAPH_STEP_HEIGHT_PX;
      const isModel = ev.kind === 'model_call';

      nodes.push({
        id: nodeId,
        type: isModel ? 'model_call' : 'tool_call',
        position: { x: 0, y: yPos },
        data: {
          label: ev.name ?? ev.actorId ?? ev.kind,
          status: ev.success === false ? 'failed' : 'success',
          latencyMs: ev.latencyMs ?? null,
          success: ev.success ?? null,
          errorType: ev.error && typeof ev.error === 'object' && 'type' in ev.error
            ? (ev.error.type as string | null)
            : null,
          failureReason: ev.error && typeof ev.error === 'object' && 'message' in ev.error
            ? (ev.error.message as string | null)
            : null,
        },
      });

      const sourceId = i === 0 ? rootId : `audit-${graphEvents[i - 1]!.id}`;
      edges.push({ id: `e-${sourceId}-${nodeId}`, source: sourceId, target: nodeId });
    });
  }

  return { nodes, edges };
}
