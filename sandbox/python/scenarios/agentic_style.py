"""
Agentic-framework style multi-agent handoff scenario.
Simulates how a real agentic-framework listener would emit audit events.
"""
from __future__ import annotations

import time
import uuid
import random
from typing import Any

from optima_sdk import OptimaClient
from lib.tracer import SandboxTracer
from mock_tools import run_tool


def _sleep(ms: float) -> None:
    time.sleep(ms / 1000)


def run_agentic_style(client: OptimaClient, project_id: str) -> None:
    trace_id = str(uuid.uuid4())

    orchestrator = SandboxTracer(client, project_id, trace_id, "orchestrator")
    researcher = SandboxTracer(client, project_id, trace_id, "researcher")
    writer = SandboxTracer(client, project_id, trace_id, "writer")

    print(f"[agentic-style] starting trace {trace_id}")

    # 1. Orchestrator starts
    orchestrator.event(
        "agent_start",
        name="Orchestrator",
        input={"task": "Draft a market analysis report for Q1 2025"},
    )

    # 2. Orchestrator → researcher handoff
    _sleep(80 + random.random() * 120)
    orchestrator.event(
        "agent_handoff",
        actor_id="orchestrator",
        name="researcher",
        input={"query": "Q1 2025 AI market data"},
    )

    # 3. Researcher: agent_start + model_call
    researcher.event(
        "agent_start",
        name="Researcher",
        input={"query": "Q1 2025 AI market data"},
    )
    _sleep(300 + random.random() * 300)
    researcher.event(
        "model_call",
        name="claude-3-5-sonnet",
        input={"messages": [{"role": "user", "content": "Retrieve Q1 2025 AI market data"}]},
        output={"content": "Q1 2025 saw 40% growth in enterprise AI adoption…"},
        latency_ms=int(320 + random.random() * 200),
        metadata={"inputTokens": 200, "outputTokens": 150, "model": "claude-3-5-sonnet"},
    )
    researcher.event(
        "agent_end",
        name="Researcher",
        output={"findings": "40% YoY growth in enterprise AI"},
        success=True,
    )

    # 4. Orchestrator → writer handoff
    _sleep(60)
    orchestrator.event(
        "agent_handoff",
        actor_id="orchestrator",
        name="writer",
        input={"findings": "40% YoY growth in enterprise AI", "format": "executive report"},
    )

    # 5. Writer: agent_start + model_call + summariser tool
    writer.event(
        "agent_start",
        name="Writer",
        input={"findings": "40% YoY growth", "format": "executive report"},
    )
    _sleep(400 + random.random() * 400)
    writer.event(
        "model_call",
        name="claude-3-5-sonnet",
        input={"messages": [{"role": "user", "content": "Write executive market report"}]},
        output={"content": "## Q1 2025 AI Market Analysis\n\nKey findings…"},
        latency_ms=int(480 + random.random() * 200),
        metadata={"inputTokens": 400, "outputTokens": 600, "model": "claude-3-5-sonnet"},
    )

    success, output, latency_ms, _ = run_tool("summariser", {"text": "## Q1 2025 AI Market Analysis"})
    writer.event(
        "tool_call",
        name="summariser",
        input={"text": "## Q1 2025 AI Market Analysis"},
        output=output,
        latency_ms=latency_ms,
        success=True,
    )

    writer.event(
        "agent_end",
        name="Writer",
        output={"report": "Q1 2025 AI Market Analysis — complete"},
        success=True,
    )

    # 6. Orchestrator ends
    orchestrator.event(
        "agent_end",
        name="Orchestrator",
        output={"status": "Report delivered"},
        success=True,
    )

    print(f"[agentic-style] done — trace {trace_id}")
