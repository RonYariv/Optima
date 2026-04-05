"""
Async OptimaClient — requires aiohttp (pip install optima-sdk[async]).
Falls back gracefully if aiohttp is not installed (raises ImportError with a
clear message rather than a confusing AttributeError).
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from .types import AuditEventPayload, ModelCallPayload, ToolCallPayload


class _AsyncIngest:
    def __init__(self, client: "AsyncOptimaClient") -> None:
        self._client = client

    async def model_call(
        self,
        tenant_id: str,
        project_id: str,
        trace_id: str,
        step_id: str,
        agent_id: str,
        model_provider: str,
        model_name: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        request_at: str,
        response_at: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload = ModelCallPayload(
            tenant_id=tenant_id,
            project_id=project_id,
            trace_id=trace_id,
            step_id=step_id,
            agent_id=agent_id,
            model_provider=model_provider,  # type: ignore[arg-type]
            model_name=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            request_at=request_at,
            response_at=response_at,
            metadata=metadata or {},
        )
        await self._client._post("/v1/ingest/model-call", payload.to_dict())

    async def tool_call(
        self,
        tenant_id: str,
        project_id: str,
        trace_id: str,
        step_id: str,
        agent_id: str,
        tool_name: str,
        success: bool,
        latency_ms: int,
        request_at: str,
        response_at: str,
        error_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload = ToolCallPayload(
            tenant_id=tenant_id,
            project_id=project_id,
            trace_id=trace_id,
            step_id=step_id,
            agent_id=agent_id,
            tool_name=tool_name,
            success=success,
            latency_ms=latency_ms,
            request_at=request_at,
            response_at=response_at,
            error_type=error_type,
            metadata=metadata or {},
        )
        await self._client._post("/v1/ingest/tool-call", payload.to_dict())

    async def audit_event(
        self,
        tenant_id: str,
        project_id: str,
        trace_id: str,
        agent_id: str,
        sequence_no: int,
        kind: str,
        occurred_at: str,
        actor_id: Optional[str] = None,
        name: Optional[str] = None,
        input: Optional[Dict[str, Any]] = None,
        output: Optional[Dict[str, Any]] = None,
        latency_ms: Optional[int] = None,
        success: Optional[bool] = None,
        error: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload = AuditEventPayload(
            tenant_id=tenant_id,
            project_id=project_id,
            trace_id=trace_id,
            agent_id=agent_id,
            sequence_no=sequence_no,
            kind=kind,  # type: ignore[arg-type]
            occurred_at=occurred_at,
            actor_id=actor_id,
            name=name,
            input=input,
            output=output,
            latency_ms=latency_ms,
            success=success,
            error=error,
            metadata=metadata or {},
        )
        await self._client._post("/v1/ingest/audit-event", payload.to_dict())


class AsyncOptimaClient:
    """
    Async Optima ingest client.

    Requires ``aiohttp``: pip install optima-sdk[async]

    Args:
        url:    Base URL of the api-gateway, e.g. ``http://optima-gateway:3000``
        token:  Bearer token issued at deploy time.
        silent: When True (default) network errors are swallowed so your agent
                never crashes due to observability failures.
    """

    def __init__(self, url: str, token: str, silent: bool = True) -> None:
        try:
            import aiohttp as _aiohttp  # noqa: F401
        except ImportError as exc:
            raise ImportError(
                "AsyncOptimaClient requires aiohttp. "
                "Install it with: pip install optima-sdk[async]"
            ) from exc

        self._url = url.rstrip("/")
        self._token = token
        self._silent = silent
        self.ingest = _AsyncIngest(self)

    async def _post(self, path: str, body: Dict[str, Any]) -> None:
        import aiohttp

        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._token}",
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self._url}{path}",
                    data=json.dumps(body),
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status >= 400:
                        raise RuntimeError(f"Optima ingest failed ({resp.status})")
        except Exception:
            if not self._silent:
                raise
