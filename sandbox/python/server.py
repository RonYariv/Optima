"""
Optima Sandbox Agent Server
----------------------------
Framework-agnostic FastAPI server for running sandbox agents.
The React sandbox UI talks to this server; the LLM config is supplied
per-request from the UI. Each agent definition declares which
`framework` it uses, and the matching AgentAdapter handles execution.

Adding a new framework:
    1. Subclass AgentAdapter and implement `run()`.
    2. Call `register_adapter("your_framework_name", YourAdapter())`.
    3. Set `"framework": "your_framework_name"` on agent defs.

Start:
    cd sandbox/python
    uvicorn server:app --port 8765 --reload

Endpoints:
    GET  /v1/agents           – list available agents
    POST /v1/chat             – run one turn
    GET  /healthz             – liveness
"""
from __future__ import annotations

import asyncio
import importlib
import inspect
from functools import wraps
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from abc import ABC, abstractmethod
from typing import Annotated, Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from agent_framework import Agent
from agent_framework.openai import OpenAIChatCompletionClient, OpenAIChatCompletionOptions

try:
    _optima_mod = importlib.import_module("optima_sdk")
except ModuleNotFoundError:
    # Fallback for local development when the SDK package is not installed.
    sdk_src = Path(__file__).resolve().parents[2] / "packages" / "sdk-python" / "src"
    sys.path.insert(0, str(sdk_src))
    _optima_mod = importlib.import_module("optima_sdk")

OptimaClient = _optima_mod.OptimaClient

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Optima Sandbox Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ─── Request / response models ─────────────────────────────────────────────────

class LLMConfig(BaseModel):
    api_key: str
    model: str
    base_url: str = "https://api.groq.com/openai/v1"

class OptimaConfig(BaseModel):
    control_api_url: str = "http://localhost:3001"
    optima_api_url: str = "http://localhost:3000"
    project_id: str = "sandbox"
    token: str = ""

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    agent_id: str
    messages: list[ChatMessage]
    llm_config: LLMConfig
    optima_config: OptimaConfig = OptimaConfig()

class ChatResponse(BaseModel):
    text: str
    # Full conversation history (user+assistant only) for the next turn
    messages: list[ChatMessage]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class OptimaSdkTracer:
    """Lightweight wrapper around the Optima Python SDK for sandbox traces."""

    def __init__(self, cfg: OptimaConfig, agent_id: str) -> None:
        self._enabled = bool(cfg.token)
        self._project_id = cfg.project_id
        self._agent_id = agent_id
        self.trace_id = str(uuid4())
        self._seq = 0
        self._client = (
            OptimaClient(url=cfg.optima_api_url, token=cfg.token, silent=True)
            if self._enabled
            else None
        )

    def _next_seq(self) -> int:
        current = self._seq
        self._seq += 1
        return current

    async def _run_sync(self, fn: Any, /, *args: Any, **kwargs: Any) -> None:
        if not self._enabled:
            return
        await asyncio.to_thread(fn, *args, **kwargs)

    async def audit(
        self,
        kind: str,
        *,
        actor_id: str | None = None,
        name: str | None = None,
        input_data: dict[str, Any] | None = None,
        output_data: dict[str, Any] | None = None,
        latency_ms: int | None = None,
        success: bool | None = None,
        error: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if not self._enabled or self._client is None:
            return
        await self._run_sync(
            self._client.ingest.audit_event,
            project_id=self._project_id,
            trace_id=self.trace_id,
            agent_id=self._agent_id,
            sequence_no=self._next_seq(),
            kind=kind,
            occurred_at=_now_iso(),
            actor_id=actor_id,
            name=name,
            input=input_data,
            output=output_data,
            latency_ms=latency_ms,
            success=success,
            error=error,
            metadata=metadata or {},
        )

    async def tool_call(
        self,
        *,
        tool_name: str,
        latency_ms: int,
        success: bool,
        error_type: str | None = None,
    ) -> None:
        if not self._enabled or self._client is None:
            return
        now = _now_iso()
        await self._run_sync(
            self._client.ingest.tool_call,
            project_id=self._project_id,
            trace_id=self.trace_id,
            step_id=str(uuid4()),
            agent_id=self._agent_id,
            tool_name=tool_name,
            success=success,
            latency_ms=latency_ms,
            request_at=now,
            response_at=now,
            error_type=error_type,
            metadata={},
        )


def _instrument_tools_with_sdk(
    tools: dict[str, Any],
    tracer: OptimaSdkTracer,
) -> dict[str, Any]:
    instrumented: dict[str, Any] = {}
    mcp_tools = {
        "web_search": "mcp-web-search",
        "list_dir": "mcp-filesystem",
    }

    for tool_name, tool_fn in tools.items():
        @wraps(tool_fn)
        async def wrapped_tool(*args: Any, _fn: Any = tool_fn, _name: str = tool_name, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                result = _fn(*args, **kwargs)
                if inspect.isawaitable(result):
                    result = await result
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                await tracer.tool_call(tool_name=_name, latency_ms=elapsed_ms, success=True)
                if _name in mcp_tools:
                    await tracer.audit(
                        "mcp_call",
                        actor_id=mcp_tools[_name],
                        name=_name,
                        input_data={"args": args, "kwargs": kwargs},
                        output_data={"result": str(result)[:500]},
                        latency_ms=elapsed_ms,
                        success=True,
                    )
                else:
                    await tracer.audit(
                        "tool_call",
                        name=_name,
                        input_data={"args": args, "kwargs": kwargs},
                        output_data={"result": str(result)[:500]},
                        latency_ms=elapsed_ms,
                        success=True,
                    )
                return result
            except Exception as exc:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                await tracer.tool_call(
                    tool_name=_name,
                    latency_ms=elapsed_ms,
                    success=False,
                    error_type=type(exc).__name__,
                )
                if _name in mcp_tools:
                    await tracer.audit(
                        "mcp_call",
                        actor_id=mcp_tools[_name],
                        name=_name,
                        input_data={"args": args, "kwargs": kwargs},
                        latency_ms=elapsed_ms,
                        success=False,
                        error={"type": type(exc).__name__, "message": str(exc)},
                    )
                else:
                    await tracer.audit(
                        "tool_call",
                        name=_name,
                        input_data={"args": args, "kwargs": kwargs},
                        latency_ms=elapsed_ms,
                        success=False,
                        error={"type": type(exc).__name__, "message": str(exc)},
                    )
                raise

        # Keep the original callable contract visible to the agent framework
        # so tool argument schemas remain accurate after wrapping.
        wrapped_tool.__signature__ = inspect.signature(tool_fn)
        wrapped_tool.__annotations__ = getattr(tool_fn, "__annotations__", {})
        instrumented[tool_name] = wrapped_tool

    return instrumented

# ─── Agent adapter framework ───────────────────────────────────────────────────

class AgentAdapter(ABC):
    """Base class for agent framework adapters.

    To add support for a new framework:
      1. Subclass AgentAdapter and implement `run()`.
      2. Call `register_adapter("your_framework_name", YourAdapter())` below.
      3. Set `"framework": "your_framework_name"` on the agent defs.
    """

    @abstractmethod
    async def run(
        self,
        agent_def: dict[str, Any],
        messages: list[ChatMessage],
        llm_config: LLMConfig,
        tools: dict[str, Any],
        tracer: OptimaSdkTracer,
    ) -> str:
        """Execute one conversation turn and return the assistant reply text."""
        ...


_ADAPTERS: dict[str, AgentAdapter] = {}


def register_adapter(name: str, adapter: AgentAdapter) -> None:
    _ADAPTERS[name] = adapter


def get_adapter(name: str) -> AgentAdapter:
    if name not in _ADAPTERS:
        available = list(_ADAPTERS)
        raise HTTPException(
            status_code=400,
            detail=f"No adapter registered for framework '{name}'. Available: {available}",
        )
    return _ADAPTERS[name]


# ─── MS Agent Framework adapter ────────────────────────────────────────────────

class MsAgentFrameworkAdapter(AgentAdapter):
    """Adapter for the Microsoft Agent Framework (pip install agent-framework)."""

    async def run(
        self,
        agent_def: dict[str, Any],
        messages: list[ChatMessage],
        llm_config: LLMConfig,
        tools: dict[str, Any],
        tracer: OptimaSdkTracer,
    ) -> str:
        llm_client = OpenAIChatCompletionClient(
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            model=llm_config.model,
        )

        tool_fns = [tools[name] for name in agent_def.get("tool_names", []) if name in tools]

        agent = Agent(
            client=llm_client,
            name=agent_def["name"],
            instructions=agent_def["instructions"],
            tools=tool_fns,
            # Disable parallel tool calls — required for Groq and most non-OpenAI providers
            default_options=OpenAIChatCompletionOptions(parallel_tool_calls=False),
        )

        # Build input: prepend prior history as context, pass the last user message.
        prior = messages[:-1]
        user_input = messages[-1].content if messages else ""

        if prior:
            history_text = "\n".join(
                f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
                for m in prior
            )
            user_input = f"[Prior conversation]\n{history_text}\n\n[New message]\n{user_input}"

        # First attempt
        call_started = time.perf_counter()
        try:
            result = await agent.run(user_input)
            elapsed_ms = int((time.perf_counter() - call_started) * 1000)
            await tracer.audit(
                "model_call",
                name=llm_config.model,
                input_data={"message": user_input[:1000]},
                output_data={"text": str(result)[:2000]},
                latency_ms=elapsed_ms,
                success=True,
                metadata={"provider": llm_config.base_url},
            )
            return str(result)
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - call_started) * 1000)
            await tracer.audit(
                "model_call",
                name=llm_config.model,
                input_data={"message": user_input[:1000]},
                latency_ms=elapsed_ms,
                success=False,
                error={"type": type(exc).__name__, "message": str(exc)},
                metadata={"provider": llm_config.base_url},
            )
            # Some LLM providers (e.g. Groq + llama-3.3-70b) occasionally generate
            # tool calls in a non-JSON format (tool_use_failed).  Retry once with an
            # explicit prompt nudge to use proper JSON tool calling.
            if "tool_use_failed" in str(exc) or "failed_generation" in str(exc):
                nudge = (
                    "[IMPORTANT: You MUST call tools using the standard JSON function-calling "
                    "format provided by the API. Do NOT use XML or any other format. "
                    "Call one tool at a time.]\n\n"
                )
                try:
                    retry_started = time.perf_counter()
                    retry_prompt = nudge + user_input
                    result = await agent.run(retry_prompt)
                    retry_elapsed_ms = int((time.perf_counter() - retry_started) * 1000)
                    await tracer.audit(
                        "model_call",
                        name=llm_config.model,
                        input_data={"message": retry_prompt[:1000]},
                        output_data={"text": str(result)[:2000]},
                        latency_ms=retry_elapsed_ms,
                        success=True,
                        metadata={"provider": llm_config.base_url, "retry": True},
                    )
                    return str(result)
                except Exception:
                    pass  # fall through to re-raise original
            raise


register_adapter("ms_agent_framework", MsAgentFrameworkAdapter())


# ─── Safe math evaluator ───────────────────────────────────────────────────────

_SAFE_MATH = re.compile(r'^[\d\s+\-*/.()%^]+$')

def _safe_eval(expression: str) -> float:
    if not _SAFE_MATH.match(expression):
        raise ValueError("Expression contains invalid characters")
    if len(expression) > 200:
        raise ValueError("Expression too long")
    result = eval(  # noqa: S307 — validated above
        expression,
        {"__builtins__": {}},
        {},
    )
    if not isinstance(result, (int, float)) or not __import__("math").isfinite(result):
        raise ValueError("Expression did not produce a finite number")
    return float(result)


# ─── Tool factories ────────────────────────────────────────────────────────────

def _make_tools(optima_cfg: OptimaConfig) -> dict[str, Any]:
    """Return a dict of tool functions keyed by name."""

    def calculator(
        expression: Annotated[str, Field(description="Math expression to evaluate, e.g. '(10 * 3) / 2'")],
    ) -> str:
        """Evaluate a mathematical expression and return the numeric result."""
        try:
            result = _safe_eval(expression)
            return f"{expression} = {result}"
        except Exception as exc:
            return f"Error: {exc}"

    def summarizer(
        text: Annotated[str, Field(description="The text to summarize")],
    ) -> str:
        """Return a short summary of long text (mock — returns first 200 chars + ellipsis)."""
        trimmed = text[:200].rstrip()
        return f"Summary: {trimmed}{'…' if len(text) > 200 else ''}"

    async def get_traces(
        limit: Annotated[int, Field(description="Max number of traces to return (1-50)", ge=1, le=50)] = 10,
    ) -> str:
        """Fetch recent traces from the Optima control API."""
        url = f"{optima_cfg.control_api_url}/v1/traces?limit={limit}"
        headers = {"Authorization": f"Bearer {optima_cfg.token}"} if optima_cfg.token else {}
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(url, headers=headers)
                r.raise_for_status()
                data = r.json()
            traces = data if isinstance(data, list) else data.get("data", data)
            if not traces:
                return "No traces found in Optima."
            lines = [f"- [{t.get('status','?')}] {t.get('id','')} agent={t.get('agent_id','?')}" for t in traces[:limit]]
            return f"Found {len(lines)} trace(s):\n" + "\n".join(lines)
        except Exception as exc:
            return f"Could not reach Optima control API: {exc}"

    async def get_failures(
        limit: Annotated[int, Field(description="Max number of failure events to return (1-50)", ge=1, le=50)] = 10,
    ) -> str:
        """Fetch recent failure events from the Optima control API."""
        url = f"{optima_cfg.control_api_url}/v1/failures?limit={limit}"
        headers = {"Authorization": f"Bearer {optima_cfg.token}"} if optima_cfg.token else {}
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(url, headers=headers)
                r.raise_for_status()
                data = r.json()
            items = data if isinstance(data, list) else data.get("data", data)
            if not items:
                return "No failures found in Optima."
            lines = [
                f"- [{f.get('severity','?')}] {f.get('category','?')}: {f.get('reason','?')}"
                for f in items[:limit]
            ]
            return f"Found {len(lines)} failure(s):\n" + "\n".join(lines)
        except Exception as exc:
            return f"Could not reach Optima control API: {exc}"

    async def get_cost_summary() -> str:
        """Fetch token cost summary from the Optima control API."""
        url = f"{optima_cfg.control_api_url}/v1/cost/summary"
        headers = {"Authorization": f"Bearer {optima_cfg.token}"} if optima_cfg.token else {}
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(url, headers=headers)
                r.raise_for_status()
                data = r.json()
            rows = data if isinstance(data, list) else data.get("data", [])
            if not rows:
                return "No cost data found in Optima."
            lines = [
                f"- {row.get('model_name','?')} ({row.get('model_provider','?')}): "
                f"${row.get('total_cost_usd', '?')} total, "
                f"{row.get('total_calls', '?')} calls"
                for row in rows
            ]
            return "Cost summary:\n" + "\n".join(lines)
        except Exception as exc:
            return f"Could not reach Optima control API: {exc}"

    async def web_search(
        query: Annotated[str, Field(description="The search query")],
    ) -> str:
        """Search the web using the mock MCP web-search server (must be running on :4011)."""
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "search", "arguments": {"query": query}},
            }
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.post("http://localhost:4011", json=payload)
                r.raise_for_status()
                result = r.json()
            content = result.get("result", {}).get("content", [])
            text = " ".join(c.get("text", "") for c in content if c.get("type") == "text")
            return text or str(result)
        except Exception as exc:
            return f"Mock web-search server unavailable: {exc}"

    async def list_dir(
        path: Annotated[str, Field(description="Directory path to list")],
    ) -> str:
        """List directory contents using the mock MCP filesystem server (must be running on :4010)."""
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "list_dir", "arguments": {"path": path}},
            }
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.post("http://localhost:4010", json=payload)
                r.raise_for_status()
                result = r.json()
            content = result.get("result", {}).get("content", [])
            text = " ".join(c.get("text", "") for c in content if c.get("type") == "text")
            return text or str(result)
        except Exception as exc:
            return f"Mock filesystem server unavailable: {exc}"

    return {
        "calculator": calculator,
        "summarizer": summarizer,
        "get_traces": get_traces,
        "get_failures": get_failures,
        "get_cost_summary": get_cost_summary,
        "web_search": web_search,
        "list_dir": list_dir,
    }


# ─── Agent registry ────────────────────────────────────────────────────────────

AGENT_DEFS: list[dict[str, Any]] = [
    {
        "id": "echo",
        "framework": "ms_agent_framework",
        "name": "Echo Agent",
        "description": "Repeats back what you say. Good for testing LLM connectivity.",
        "instructions": "You are a helpful echo assistant. Acknowledge what the user says and repeat it back clearly.",
        "tool_names": [],
    },
    {
        "id": "calculator",
        "framework": "ms_agent_framework",
        "name": "Calculator Agent",
        "description": "Solves math problems using the calculator tool.",
        "instructions": (
            "You are a math assistant. When the user asks a math question, "
            "use the calculator tool to compute the answer precisely. Always show your reasoning."
        ),
        "tool_names": ["calculator"],
    },
    {
        "id": "optima-inspector",
        "framework": "ms_agent_framework",
        "name": "Optima Inspector",
        "description": "Queries your live Optima instance — traces, failures, and cost data.",
        "instructions": (
            "You are an AI assistant specialized in analyzing Optima observability data. "
            "Use get_traces, get_failures, and get_cost_summary tools to retrieve live data "
            "from the connected Optima instance, then provide insightful analysis."
        ),
        "tool_names": ["get_traces", "get_failures", "get_cost_summary"],
    },
    {
        "id": "research-bot",
        "framework": "ms_agent_framework",
        "name": "Research Bot",
        "description": "Uses mock web-search + summarizer tools. Requires mock MCP servers running.",
        "instructions": (
            "You are a research assistant. Use web_search to find information and "
            "summarizer to condense long results. Always cite where the information came from."
        ),
        "tool_names": ["web_search", "summarizer", "calculator"],
    },
    {
        "id": "full-demo",
        "framework": "ms_agent_framework",
        "name": "Full Demo Agent",
        "description": "All tools: calculator, summarizer, Optima data, web-search, filesystem.",
        "instructions": (
            "You are a powerful multi-tool assistant with access to math, web search, "
            "file system, and the live Optima observability platform. "
            "Use the right tool for each part of the user's request."
        ),
        "tool_names": ["calculator", "summarizer", "get_traces", "get_failures", "get_cost_summary", "web_search", "list_dir"],
    },
]

AGENT_DEF_MAP = {a["id"]: a for a in AGENT_DEFS}


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/agents")
def list_agents() -> list[dict[str, Any]]:
    return [
        {"id": a["id"], "name": a["name"], "description": a["description"]}
        for a in AGENT_DEFS
    ]


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    agent_def = AGENT_DEF_MAP.get(body.agent_id)
    if agent_def is None:
        agent_def = AGENT_DEF_MAP["echo"]

    tracer = OptimaSdkTracer(body.optima_config, agent_def["id"])

    framework = agent_def.get("framework", "ms_agent_framework")
    adapter = get_adapter(framework)

    user_input = body.messages[-1].content if body.messages else ""
    await tracer.audit(
        "agent_start",
        name=agent_def["name"],
        input_data={"message": user_input},
        metadata={"framework": framework},
    )

    all_tools = _instrument_tools_with_sdk(_make_tools(body.optima_config), tracer)
    try:
        assistant_text = await adapter.run(agent_def, body.messages, body.llm_config, all_tools, tracer)
        await tracer.audit(
            "agent_end",
            name=agent_def["name"],
            output_data={"text": assistant_text},
            success=True,
            metadata={"framework": framework},
        )
    except Exception as exc:
        await tracer.audit(
            "agent_end",
            name=agent_def["name"],
            success=False,
            error={"type": type(exc).__name__, "message": str(exc)},
            metadata={"framework": framework},
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    updated_messages = list(body.messages) + [
        ChatMessage(role="assistant", content=assistant_text)
    ]

    return ChatResponse(text=assistant_text, messages=updated_messages)
