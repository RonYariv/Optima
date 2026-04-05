"""
Optima Sandbox Agent Server
----------------------------
Framework-agnostic FastAPI server for running sandbox agents.
The React sandbox UI talks to this server; the LLM config is supplied
per-request from the UI. Each agent definition declares which
`framework` it uses, and the matching AgentAdapter handles execution.

Adding a new framework:
    1. Subclass AgentAdapter and implement `run()`.
    2. Call `register_adapter("your_framework_name", YourAdapter()).
    3. Set `"framework": "your_framework_name"` on agent defs.

Start:
    cd sandbox/python
    uvicorn agentic_server:app --port 8765 --reload

Endpoints:
    GET  /v1/agents           - list available agents
    POST /v1/chat             - run one turn
    GET  /healthz             - liveness
"""
from __future__ import annotations

import ast
import inspect
import logging
import math
import operator as op
import os
import time
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from functools import wraps
from typing import Annotated, Any, AsyncIterator
from uuid import uuid4

import httpx
from agent_framework.openai import OpenAIChatCompletionClient
from adapters.langgraph_adapter import LangGraphAdapter
from adapters.ms_agent_framework_adapter import MsAgentFrameworkAdapter
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(title="Optima Sandbox Agent Server", version="2.0.0")

logger = logging.getLogger(__name__)

CONTROL_API_URL = os.environ.get("CONTROL_API_URL", "http://localhost:3001")
OPTIMA_API_URL = os.environ.get("OPTIMA_API_URL", "http://localhost:3000")
SANDBOX_CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("SANDBOX_CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

HTTP_CLIENT = httpx.AsyncClient(timeout=5.0)

app.add_middleware(
    CORSMiddleware,
    allow_origins=SANDBOX_CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


class LLMConfig(BaseModel):
    api_key: str
    model: str
    base_url: str = "https://api.groq.com/openai/v1"


class OptimaConfig(BaseModel):
    project_id: str = "sandbox"
    token: str = ""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    agent_id: str
    messages: list[ChatMessage]
    llm_config: LLMConfig
    optima_config: OptimaConfig = OptimaConfig()


class ChatResponse(BaseModel):
    text: str
    messages: list[ChatMessage]


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _safe_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        if isinstance(dumped, dict):
            return dumped
    if hasattr(value, "to_dict"):
        dumped = value.to_dict()
        if isinstance(dumped, dict):
            return dumped
    if hasattr(value, "__dict__"):
        return {
            key: raw
            for key, raw in vars(value).items()
            if not key.startswith("_")
        }
    return {}


def _drop_none_values(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if value is not None
    }


def _extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            else:
                content = getattr(item, "text", None)
                if isinstance(content, str):
                    parts.append(content)
        return "\n".join(part for part in parts if part)
    content = getattr(value, "content", None)
    if content is not None:
        return _extract_text(content)
    return str(value)


def _extract_token_usage(payload: Any) -> tuple[int, int]:
    candidates: list[dict[str, Any]] = []
    root = _safe_dict(payload)
    if root:
        candidates.append(root)
        for nested_key in ("usage", "llm_output", "response_metadata", "response", "raw_response"):
            nested = root.get(nested_key)
            if isinstance(nested, dict):
                candidates.append(nested)
                token_usage = nested.get("token_usage")
                if isinstance(token_usage, dict):
                    candidates.append(token_usage)

    for attr_name in ("usage", "llm_output", "response_metadata", "raw_response", "response"):
        attr_value = getattr(payload, attr_name, None)
        if attr_value is not None:
            candidates.append(_safe_dict(attr_value))

    input_keys = ("inputTokens", "input_tokens", "prompt_tokens")
    output_keys = ("outputTokens", "output_tokens", "completion_tokens")
    for candidate in candidates:
        if not candidate:
            continue
        input_tokens = next((candidate.get(key) for key in input_keys if candidate.get(key) is not None), None)
        output_tokens = next((candidate.get(key) for key in output_keys if candidate.get(key) is not None), None)
        if input_tokens is not None or output_tokens is not None:
            return int(input_tokens or 0), int(output_tokens or 0)

    return 0, 0


def _detect_provider(base_url: str, model: str) -> str:
    lowered_url = base_url.lower()
    lowered_model = model.lower()
    if "openai" in lowered_url or lowered_model.startswith("gpt") or lowered_model.startswith("o1"):
        return "openai"
    if "anthropic" in lowered_url or "claude" in lowered_model:
        return "anthropic"
    if "azure" in lowered_url:
        return "azure-openai"
    return "other"


class AgentRunScope:
    def __init__(self) -> None:
        self.output_data: dict[str, Any] | None = None

    def set_output(self, output_data: dict[str, Any]) -> None:
        self.output_data = output_data


class OptimaIngestBridge:
    def __init__(
        self,
        cfg: OptimaConfig,
        agent_id: str,
        framework: str,
        http_client: httpx.AsyncClient,
    ) -> None:
        self._enabled = bool(cfg.token)
        self._token = cfg.token
        self._ingest_url = OPTIMA_API_URL.rstrip("/")
        self._project_id = cfg.project_id
        self._agent_id = agent_id
        self._framework = framework
        self._sequence_no = 0
        self._step_index = 0
        self._http_client = http_client
        self.trace_id = str(uuid4())

    def _next_sequence(self) -> int:
        current = self._sequence_no
        self._sequence_no += 1
        return current

    def _next_step(self) -> tuple[str, int]:
        current = self._step_index
        self._step_index += 1
        return f"step-{current}", current

    async def _post(self, path: str, payload: dict[str, Any]) -> None:
        if not self._enabled:
            return
        try:
            response = await self._http_client.post(
                f"{self._ingest_url}{path}",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
        except Exception:
            return

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
        payload = {
            "projectId": self._project_id,
            "traceId": self.trace_id,
            "agentId": self._agent_id,
            "sequenceNo": self._next_sequence(),
            "kind": kind,
            "actorId": actor_id,
            "name": name,
            "input": input_data,
            "output": output_data,
            "latencyMs": latency_ms,
            "success": success,
            "error": error,
            "occurredAt": _now_iso(),
            "metadata": {
                "framework": self._framework,
                "bridge": "python-http-bridge",
                **(metadata or {}),
            },
        }
        await self._post("/v1/ingest/audit-event", _drop_none_values(payload))

    async def tool_call(
        self,
        *,
        tool_name: str,
        latency_ms: int,
        success: bool,
        error_type: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        step_id, step_index = self._next_step()
        request_at = _now_iso()
        payload = {
            "projectId": self._project_id,
            "traceId": self.trace_id,
            "stepId": step_id,
            "stepIndex": step_index,
            "agentId": self._agent_id,
            "toolName": tool_name,
            "success": success,
            "latencyMs": latency_ms,
            "errorType": error_type,
            "requestAt": request_at,
            "responseAt": request_at,
            "metadata": {
                "framework": self._framework,
                "bridge": "python-http-bridge",
                **(metadata or {}),
            },
        }
        await self._post("/v1/ingest/tool-call", _drop_none_values(payload))

    async def model_call(
        self,
        *,
        model_name: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        provider: str,
        error: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        step_id, step_index = self._next_step()
        request_at = _now_iso()
        payload = {
            "projectId": self._project_id,
            "traceId": self.trace_id,
            "stepId": step_id,
            "stepIndex": step_index,
            "agentId": self._agent_id,
            "modelProvider": provider,
            "modelName": model_name,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "latencyMs": latency_ms,
            "requestAt": request_at,
            "responseAt": request_at,
            "metadata": {
                "framework": self._framework,
                "bridge": "python-http-bridge",
                **(metadata or {}),
                **({"error": error} if error else {}),
            },
        }
        await self._post("/v1/ingest/model-call", _drop_none_values(payload))

    async def handoff(self, *, to_agent: str, input_data: dict[str, Any] | None = None) -> None:
        await self.audit(
            "agent_handoff",
            actor_id=self._agent_id,
            name=to_agent,
            input_data=input_data,
        )

    @asynccontextmanager
    async def agent_run(
        self,
        *,
        agent_name: str,
        input_data: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AsyncIterator[AgentRunScope]:
        started = time.perf_counter()
        scope = AgentRunScope()
        await self.audit(
            "agent_start",
            name=agent_name,
            input_data=input_data,
            metadata=metadata,
        )
        try:
            yield scope
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            await self.audit(
                "agent_end",
                name=agent_name,
                latency_ms=elapsed_ms,
                success=False,
                error={"type": type(exc).__name__, "message": str(exc)},
                metadata=metadata,
            )
            raise
        else:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            await self.audit(
                "agent_end",
                name=agent_name,
                output_data=scope.output_data,
                latency_ms=elapsed_ms,
                success=True,
                metadata=metadata,
            )


def _instrument_tools_with_bridge(
    tools: dict[str, Any],
    bridge: OptimaIngestBridge,
) -> dict[str, Any]:
    instrumented: dict[str, Any] = {}
    mcp_tools = {
        "web_search": "mcp-web-search",
        "list_dir": "mcp-filesystem",
    }

    for tool_name, tool_fn in tools.items():
        @wraps(tool_fn)
        async def wrapped_tool(*args: Any, _fn: Any = tool_fn, _name: str = tool_name, **kwargs: Any) -> Any:
            started = time.perf_counter()
            try:
                result = _fn(*args, **kwargs)
                if inspect.isawaitable(result):
                    result = await result
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                await bridge.tool_call(tool_name=_name, latency_ms=elapsed_ms, success=True)
                if _name in mcp_tools:
                    await bridge.audit(
                        "mcp_call",
                        actor_id=mcp_tools[_name],
                        name=_name,
                        input_data={"args": args, "kwargs": kwargs},
                        output_data={"result": str(result)[:500]},
                        latency_ms=elapsed_ms,
                        success=True,
                    )
                else:
                    await bridge.audit(
                        "tool_call",
                        name=_name,
                        input_data={"args": args, "kwargs": kwargs},
                        output_data={"result": str(result)[:500]},
                        latency_ms=elapsed_ms,
                        success=True,
                    )
                return result
            except Exception as exc:
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                await bridge.tool_call(
                    tool_name=_name,
                    latency_ms=elapsed_ms,
                    success=False,
                    error_type=type(exc).__name__,
                )
                await bridge.audit(
                    "mcp_call" if _name in mcp_tools else "tool_call",
                    actor_id=mcp_tools.get(_name),
                    name=_name,
                    input_data={"args": args, "kwargs": kwargs},
                    latency_ms=elapsed_ms,
                    success=False,
                    error={"type": type(exc).__name__, "message": str(exc)},
                )
                raise

        wrapped_tool.__signature__ = inspect.signature(tool_fn)
        wrapped_tool.__annotations__ = getattr(tool_fn, "__annotations__", {})
        instrumented[tool_name] = wrapped_tool

    return instrumented


class BridgedOpenAIChatCompletionClient(OpenAIChatCompletionClient):
    def __init__(self, llm_config: LLMConfig, bridge: OptimaIngestBridge) -> None:
        super().__init__(
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            model=llm_config.model,
        )
        self._bridge = bridge
        self._model_name = llm_config.model
        self._provider = _detect_provider(llm_config.base_url, llm_config.model)

    async def get_response(self, *args: Any, **kwargs: Any) -> Any:
        started = time.perf_counter()
        try:
            response = await super().get_response(*args, **kwargs)
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            input_tokens, output_tokens = _extract_token_usage(response)
            await self._bridge.model_call(
                model_name=self._model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=elapsed_ms,
                provider=self._provider,
            )
            return response
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            await self._bridge.model_call(
                model_name=self._model_name,
                input_tokens=0,
                output_tokens=0,
                latency_ms=elapsed_ms,
                provider=self._provider,
                error={"type": type(exc).__name__, "message": str(exc)},
            )
            raise


class AgentAdapter(ABC):
    @abstractmethod
    async def run(
        self,
        agent_def: dict[str, Any],
        messages: list[ChatMessage],
        llm_config: LLMConfig,
        tools: dict[str, Any],
        bridge: OptimaIngestBridge,
    ) -> str:
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


def _build_ms_user_input(messages: list[ChatMessage]) -> str:
    prior = messages[:-1]
    user_input = messages[-1].content if messages else ""
    if not prior:
        return user_input
    history_text = "\n".join(
        f"{'User' if message.role == 'user' else 'Assistant'}: {message.content}"
        for message in prior
    )
    return f"[Prior conversation]\n{history_text}\n\n[New message]\n{user_input}"


register_adapter(
    "ms_agent_framework",
    MsAgentFrameworkAdapter(
        client_factory=BridgedOpenAIChatCompletionClient,
        build_user_input=_build_ms_user_input,
    ),
)
register_adapter(
    "langgraph",
    LangGraphAdapter(
        detect_provider=_detect_provider,
        extract_token_usage=_extract_token_usage,
        extract_text=_extract_text,
    ),
)


_ALLOWED_BINARY_OPS = {
    ast.Add: op.add,
    ast.Sub: op.sub,
    ast.Mult: op.mul,
    ast.Div: op.truediv,
    ast.Mod: op.mod,
}


def _safe_eval(expression: str) -> float:
    if len(expression) > 200:
        raise ValueError("Expression too long")

    node = ast.parse(expression, mode="eval")

    def _eval_ast(current: ast.AST) -> float:
        if isinstance(current, ast.Expression):
            return _eval_ast(current.body)
        if isinstance(current, ast.Constant) and isinstance(current.value, (int, float)):
            return float(current.value)
        if isinstance(current, ast.UnaryOp) and isinstance(current.op, (ast.UAdd, ast.USub)):
            value = _eval_ast(current.operand)
            return value if isinstance(current.op, ast.UAdd) else -value
        if isinstance(current, ast.BinOp):
            op_fn = _ALLOWED_BINARY_OPS.get(type(current.op))
            if op_fn is None:
                raise ValueError("Unsupported operator")
            return float(op_fn(_eval_ast(current.left), _eval_ast(current.right)))
        raise ValueError("Expression contains unsupported syntax")

    result = _eval_ast(node)
    if not math.isfinite(result):
        raise ValueError("Expression did not produce a finite number")
    return float(result)


def _make_tools(optima_cfg: OptimaConfig) -> dict[str, Any]:
    def calculator(
        expression: Annotated[str, Field(description="Math expression to evaluate, e.g. '(10 * 3) / 2'")],
    ) -> str:
        try:
            result = _safe_eval(expression)
            return f"{expression} = {result}"
        except Exception as exc:
            return f"Error: {exc}"

    def summarizer(
        text: Annotated[str, Field(description="The text to summarize")],
    ) -> str:
        trimmed = text[:200].rstrip()
        suffix = "..." if len(text) > 200 else ""
        return f"Summary: {trimmed}{suffix}"

    async def get_traces(
        limit: Annotated[int, Field(description="Max number of traces to return (1-50)", ge=1, le=50)] = 10,
    ) -> str:
        url = f"{CONTROL_API_URL}/v1/traces?limit={limit}"
        headers = {"Authorization": f"Bearer {optima_cfg.token}"} if optima_cfg.token else {}
        try:
            response = await HTTP_CLIENT.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            traces = data if isinstance(data, list) else data.get("data", data)
            if not traces:
                return "No traces found in Optima."
            lines = [
                f"- [{trace.get('status', '?')}] {trace.get('id', '')} agent={trace.get('agentId', '?')}"
                for trace in traces[:limit]
            ]
            return f"Found {len(lines)} trace(s):\n" + "\n".join(lines)
        except Exception as exc:
            return f"Could not reach Optima control API: {exc}"

    async def get_failures(
        limit: Annotated[int, Field(description="Max number of failure events to return (1-50)", ge=1, le=50)] = 10,
    ) -> str:
        url = f"{CONTROL_API_URL}/v1/failures?limit={limit}"
        headers = {"Authorization": f"Bearer {optima_cfg.token}"} if optima_cfg.token else {}
        try:
            response = await HTTP_CLIENT.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            failures = data if isinstance(data, list) else data.get("data", data)
            if not failures:
                return "No failures found in Optima."
            lines = [
                f"- [{failure.get('severity', '?')}] {failure.get('category', '?')}: {failure.get('reason', '?')}"
                for failure in failures[:limit]
            ]
            return f"Found {len(lines)} failure(s):\n" + "\n".join(lines)
        except Exception as exc:
            return f"Could not reach Optima control API: {exc}"

    async def get_cost_summary() -> str:
        url = f"{CONTROL_API_URL}/v1/cost/summary"
        headers = {"Authorization": f"Bearer {optima_cfg.token}"} if optima_cfg.token else {}
        try:
            response = await HTTP_CLIENT.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            rows = data if isinstance(data, list) else data.get("data", [])
            if not rows:
                return "No cost data found in Optima."
            lines = [
                f"- {row.get('model_name', '?')} ({row.get('model_provider', '?')}): ${row.get('total_cost_usd', '?')} total, {row.get('total_calls', '?')} calls"
                for row in rows
            ]
            return "Cost summary:\n" + "\n".join(lines)
        except Exception as exc:
            return f"Could not reach Optima control API: {exc}"

    async def web_search(
        query: Annotated[str, Field(description="The search query")],
    ) -> str:
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "search", "arguments": {"query": query}},
            }
            response = await HTTP_CLIENT.post("http://localhost:4011", json=payload)
            response.raise_for_status()
            result = response.json()
            content = result.get("result", {}).get("content", [])
            text = " ".join(item.get("text", "") for item in content if item.get("type") == "text")
            return text or str(result)
        except Exception as exc:
            return f"Mock web-search server unavailable: {exc}"

    async def list_dir(
        path: Annotated[str, Field(description="Directory path to list")],
    ) -> str:
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "list_dir", "arguments": {"path": path}},
            }
            response = await HTTP_CLIENT.post("http://localhost:4010", json=payload)
            response.raise_for_status()
            result = response.json()
            content = result.get("result", {}).get("content", [])
            text = " ".join(item.get("text", "") for item in content if item.get("type") == "text")
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


def _agent_def(
    *,
    agent_id: str,
    framework: str,
    name: str,
    description: str,
    instructions: str,
    tool_names: list[str],
) -> dict[str, Any]:
    return {
        "id": agent_id,
        "framework": framework,
        "name": name,
        "description": description,
        "instructions": instructions,
        "tool_names": tool_names,
    }


AGENT_DEFS: list[dict[str, Any]] = [
    _agent_def(
        agent_id="echo-ms",
        framework="ms_agent_framework",
        name="Echo Agent",
        description="Repeats back what you say.",
        instructions="You are a helpful echo assistant. Acknowledge what the user says and repeat it back clearly.",
        tool_names=[],
    ),
    _agent_def(
        agent_id="calculator-ms",
        framework="ms_agent_framework",
        name="Calculator Agent",
        description="Solves math using a calculator tool.",
        instructions="You are a math assistant. Use the calculator tool to solve math problems precisely and explain the result.",
        tool_names=["calculator"],
    ),
    _agent_def(
        agent_id="research-bot-ms",
        framework="ms_agent_framework",
        name="Research Bot",
        description="Uses mock web-search + summarizer tools.",
        instructions="You are a research assistant. Use web_search and summarizer to gather and condense information. Cite sources clearly.",
        tool_names=["web_search", "summarizer", "calculator"],
    ),
    _agent_def(
        agent_id="optima-inspector-ms",
        framework="ms_agent_framework",
        name="Optima Inspector",
        description="Queries live traces, failures, and cost data.",
        instructions="You analyze Optima observability data. Use get_traces, get_failures, and get_cost_summary to retrieve live data and provide insight.",
        tool_names=["get_traces", "get_failures", "get_cost_summary"],
    ),
    _agent_def(
        agent_id="echo-langgraph",
        framework="langgraph",
        name="Echo Agent",
        description="Repeats back what you say.",
        instructions="You are a helpful echo assistant. Acknowledge what the user says and repeat it back clearly.",
        tool_names=[],
    ),
    _agent_def(
        agent_id="calculator-langgraph",
        framework="langgraph",
        name="Calculator Agent",
        description="Solves math using a calculator tool.",
        instructions="You are a math assistant. Use the calculator tool to solve math problems precisely and explain the result.",
        tool_names=["calculator"],
    ),
    _agent_def(
        agent_id="research-bot-langgraph",
        framework="langgraph",
        name="Research Bot",
        description="Uses mock web-search + summarizer tools.",
        instructions="You are a research assistant. Use web_search and summarizer to gather and condense information. Cite sources clearly.",
        tool_names=["web_search", "summarizer", "calculator"],
    ),
    _agent_def(
        agent_id="optima-inspector-langgraph",
        framework="langgraph",
        name="Optima Inspector",
        description="Queries live traces, failures, and cost data.",
        instructions="You analyze Optima observability data. Use get_traces, get_failures, and get_cost_summary to retrieve live data and provide insight.",
        tool_names=["get_traces", "get_failures", "get_cost_summary"],
    ),
]

AGENT_DEF_MAP = {agent["id"]: agent for agent in AGENT_DEFS}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/agents")
def list_agents() -> list[dict[str, Any]]:
    return [
        {
            "id": agent["id"],
            "name": agent["name"],
            "description": agent["description"],
            "framework": agent["framework"],
        }
        for agent in AGENT_DEFS
    ]


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    agent_def = AGENT_DEF_MAP.get(body.agent_id) or AGENT_DEF_MAP["echo-ms"]
    framework = agent_def["framework"]
    bridge = OptimaIngestBridge(body.optima_config, agent_def["id"], framework, HTTP_CLIENT)
    adapter = get_adapter(framework)
    base_tools = _make_tools(body.optima_config)
    tools = base_tools if framework == "langgraph" else _instrument_tools_with_bridge(base_tools, bridge)

    user_input = body.messages[-1].content if body.messages else ""
    try:
        async with bridge.agent_run(
            agent_name=agent_def["name"],
            input_data={"message": user_input},
            metadata={"framework": framework},
        ) as run_scope:
            assistant_text = await adapter.run(
                agent_def,
                body.messages,
                body.llm_config,
                tools,
                bridge,
            )
            run_scope.set_output({"text": assistant_text})
    except Exception as exc:
        logger.exception("sandbox chat failed")
        raise HTTPException(status_code=500, detail="Chat execution failed") from exc

    updated_messages = list(body.messages) + [ChatMessage(role="assistant", content=assistant_text)]
    return ChatResponse(text=assistant_text, messages=updated_messages)
