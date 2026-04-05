"""
Thin wrapper around OptimaClient for sandbox use.
Auto-increments sequence_no and stamps occurredAt per trace.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from optima_sdk import OptimaClient


class SandboxTracer:
    def __init__(
        self,
        client: OptimaClient,
        tenant_id: str,
        project_id: str,
        trace_id: str,
        agent_id: str,
    ) -> None:
        self._client = client
        self._tenant_id = tenant_id
        self._project_id = project_id
        self._trace_id = trace_id
        self._agent_id = agent_id
        self._seq = 0

    @property
    def trace_id(self) -> str:
        return self._trace_id

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def event(
        self,
        kind: str,
        *,
        actor_id: Optional[str] = None,
        name: Optional[str] = None,
        input: Optional[Dict[str, Any]] = None,
        output: Optional[Dict[str, Any]] = None,
        latency_ms: Optional[int] = None,
        success: Optional[bool] = None,
        error: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        seq = self._seq
        self._seq += 1
        self._client.ingest.audit_event(
            tenant_id=self._tenant_id,
            project_id=self._project_id,
            trace_id=self._trace_id,
            agent_id=self._agent_id,
            sequence_no=seq,
            kind=kind,
            occurred_at=self._now(),
            actor_id=actor_id,
            name=name,
            input=input,
            output=output,
            latency_ms=latency_ms,
            success=success,
            error=error,
            metadata=metadata or {},
        )
