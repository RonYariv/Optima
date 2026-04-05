from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Literal, Optional


ModelProvider = Literal["openai", "anthropic", "azure-openai", "other"]
FailureSeverity = Literal["low", "medium", "high", "critical"]
FailureCategory = Literal[
    "tool_error", "provider_error", "logic_break", "handoff_error", "unknown"
]
AuditEventKind = Literal[
    "agent_start", "agent_end", "agent_handoff", "model_call", "tool_call", "mcp_call", "custom"
]


@dataclass
class ModelCallPayload:
    project_id: str
    trace_id: str
    step_id: str
    agent_id: str
    model_provider: ModelProvider
    model_name: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    request_at: str  # ISO 8601
    response_at: str  # ISO 8601
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "projectId": self.project_id,
            "traceId": self.trace_id,
            "stepId": self.step_id,
            "agentId": self.agent_id,
            "modelProvider": self.model_provider,
            "modelName": self.model_name,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "latencyMs": self.latency_ms,
            "requestAt": self.request_at,
            "responseAt": self.response_at,
            "metadata": self.metadata,
        }


@dataclass
class ToolCallPayload:
    project_id: str
    trace_id: str
    step_id: str
    agent_id: str
    tool_name: str
    success: bool
    latency_ms: int
    request_at: str  # ISO 8601
    response_at: str  # ISO 8601
    error_type: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "projectId": self.project_id,
            "traceId": self.trace_id,
            "stepId": self.step_id,
            "agentId": self.agent_id,
            "toolName": self.tool_name,
            "success": self.success,
            "latencyMs": self.latency_ms,
            "requestAt": self.request_at,
            "responseAt": self.response_at,
            "metadata": self.metadata,
        }
        if self.error_type is not None:
            d["errorType"] = self.error_type
        return d


@dataclass
class AuditEventPayload:
    project_id: str
    trace_id: str
    agent_id: str
    sequence_no: int
    kind: AuditEventKind
    occurred_at: str  # ISO 8601
    actor_id: Optional[str] = None
    name: Optional[str] = None
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
    latency_ms: Optional[int] = None
    success: Optional[bool] = None
    error: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "projectId": self.project_id,
            "traceId": self.trace_id,
            "agentId": self.agent_id,
            "sequenceNo": self.sequence_no,
            "kind": self.kind,
            "occurredAt": self.occurred_at,
            "metadata": self.metadata,
        }
        if self.actor_id is not None:
            d["actorId"] = self.actor_id
        if self.name is not None:
            d["name"] = self.name
        if self.input is not None:
            d["input"] = self.input
        if self.output is not None:
            d["output"] = self.output
        if self.latency_ms is not None:
            d["latencyMs"] = self.latency_ms
        if self.success is not None:
            d["success"] = self.success
        if self.error is not None:
            d["error"] = self.error
        return d
