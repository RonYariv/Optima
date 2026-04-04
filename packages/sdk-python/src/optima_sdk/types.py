from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Literal, Optional


ModelProvider = Literal["openai", "anthropic", "azure-openai", "other"]
FailureSeverity = Literal["low", "medium", "high", "critical"]
FailureCategory = Literal[
    "tool_error", "provider_error", "logic_break", "handoff_error", "unknown"
]


@dataclass
class ModelCallPayload:
    tenant_id: str
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
            "tenantId": self.tenant_id,
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
    tenant_id: str
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
            "tenantId": self.tenant_id,
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
