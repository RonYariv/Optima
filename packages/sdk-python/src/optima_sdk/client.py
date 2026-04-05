"""
Sync OptimaClient — zero dependencies, uses stdlib urllib only.
"""
from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

from .types import AuditEventPayload, ModelCallPayload, ToolCallPayload


class _SyncIngest:
    def __init__(self, client: "OptimaClient") -> None:
        self._client = client

    def model_call(
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
        self._client._post("/v1/ingest/model-call", payload.to_dict())

    def tool_call(
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
        self._client._post("/v1/ingest/tool-call", payload.to_dict())

    def audit_event(
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
        self._client._post("/v1/ingest/audit-event", payload.to_dict())


class OptimaClient:
    """
    Synchronous Optima ingest client.

    Uses Python stdlib (urllib) — zero external dependencies.

    Args:
        url:    Base URL of the api-gateway, e.g. ``http://optima-gateway:3000``
        token:  Bearer token issued at deploy time.
        silent: When True (default) network errors are swallowed so your agent
                never crashes due to observability failures.
    """

    def __init__(self, url: str, token: str, silent: bool = True) -> None:
        self._url = url.rstrip("/")
        self._token = token
        self._silent = silent
        self.ingest = _SyncIngest(self)

    def _post(self, path: str, body: Dict[str, Any]) -> None:
        try:
            data = json.dumps(body).encode("utf-8")
            req = urllib.request.Request(
                url=f"{self._url}{path}",
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self._token}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status >= 400:
                    raise RuntimeError(f"Optima ingest failed ({resp.status})")
        except Exception:
            if not self._silent:
                raise
