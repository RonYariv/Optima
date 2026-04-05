"""
LangChain callback handler style scenario.
Simulates on_llm_start / on_tool_start / on_agent_finish mapped to audit events
the same way a real OptimaCallbackHandler adapter would.
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


def run_langchain_style(client: OptimaClient, project_id: str) -> None:
    trace_id = str(uuid.uuid4())
    t = SandboxTracer(client, project_id, trace_id, "langchain-agent")

    print(f"[langchain-style] starting trace {trace_id}")

    # on_agent_action — mapped to agent_start
    t.event(
        "agent_start",
        name="LangChain Agent",
        input={"input": "What is the top AI story of April 2026?"},
    )

    # on_llm_start — mapped to model_call (no output yet, so we combine with on_llm_end)
    _sleep(250 + random.random() * 350)
    t.event(
        "model_call",
        name="gpt-4o",
        input={"messages": [{"role": "user", "content": "What is the top AI story of April 2026?"}]},
        output={"content": "I need to search the web to answer this."},
        latency_ms=int(300 + random.random() * 200),
        metadata={"inputTokens": 80, "outputTokens": 25, "model": "gpt-4o"},
    )

    # on_tool_start / on_tool_end — mapped to tool_call
    success, output, latency_ms, _ = run_tool("calculator", {"expr": "1 + 1"})
    t.event(
        "tool_call",
        name="calculator",
        input={"expr": "1 + 1"},
        output=output,
        latency_ms=latency_ms,
        success=True,
    )

    # Second LLM call after tool
    _sleep(200 + random.random() * 300)
    t.event(
        "model_call",
        name="gpt-4o",
        input={"messages": [{"role": "user", "content": "Now synthesise the tool result"}]},
        output={"content": "Based on the data, the top AI story of April 2026 is…"},
        latency_ms=int(380 + random.random() * 200),
        metadata={"inputTokens": 200, "outputTokens": 120, "model": "gpt-4o"},
    )

    # mcp_call (simulated web search via MCP)
    t.event(
        "mcp_call",
        actor_id="mcp-web-search",
        name="search",
        input={"q": "top AI story April 2026"},
        output={"content": [{"type": "text", "text": "mock search result"}]},
        latency_ms=int(350 + random.random() * 150),
        success=True,
    )

    # on_agent_finish — mapped to agent_end
    t.event(
        "agent_end",
        name="LangChain Agent",
        output={"output": "The top AI story of April 2026 is the release of…"},
        success=True,
    )

    print(f"[langchain-style] done — trace {trace_id}")
