# Agentic Framework Bridge Refactor Plan

## Goal

Remove the Optima SDK from sandbox agent integrations and replace it with a shared HTTP bridge that sends telemetry directly to Optima ingest endpoints.

Initial framework support:

- Microsoft Agent Framework
- LangGraph

## Why This Change

- Customers should not manually emit audit/model/tool events.
- Customers should not need to install or import the Optima SDK for framework integrations.
- Telemetry should be framework-native, automatic, and consistent.
- A shared HTTP bridge makes future framework support cheaper to add.

## Target Architecture

### 1. Shared HTTP Bridge

Create a Python bridge layer responsible for:

- trace ID creation
- sequence numbering
- posting to `/v1/ingest/audit-event`
- posting to `/v1/ingest/model-call`
- posting to `/v1/ingest/tool-call`
- swallowing telemetry failures so agent execution is not broken

### 2. Automatic Lifecycle Instrumentation

The route should no longer emit audit events directly.

Instead, the bridge should manage:

- `agent_start`
- `agent_end`
- error capture on failed runs

This should happen via a context manager or equivalent framework runner wrapper.

### 3. Framework-Specific Adapters

#### MS Agent Framework

- Wrap `OpenAIChatCompletionClient.get_response()` to auto-capture model calls
- Wrap tools once before agent construction to auto-capture tool calls
- Keep retry logic for malformed tool-call generations
- Keep customer-facing agent code free of manual telemetry calls

#### LangGraph

- Use LangGraph with `create_react_agent`
- Use LangChain callback hooks for automatic model and tool telemetry
- Reuse the same shared HTTP bridge for lifecycle events

## Sandbox Changes

### Python sandbox server

- Rename entry module to `agentic_server.py`
- Remove SDK imports and SDK fallback path
- Support both `ms_agent_framework` and `langgraph`
- Return framework metadata from `/v1/agents`

### Web sandbox UI

- Show each agent's framework in the UI
- Update startup command to `uvicorn agentic_server:app --port 8765 --reload`
- Keep the existing sandbox flow unchanged for users

### Python dependencies

- Remove legacy sandbox SDK dependency from requirements
- Add `langgraph`
- Add `langchain-openai`

## Current Changes To Revert

These changes are not part of the final no-SDK Python framework plan and should be removed:

- TypeScript AAF bridge export additions in `packages/agentic`
- TypeScript sandbox dependency additions
- temporary debug JSON files
- generated `.pyc` files
- TypeScript bridge docs/examples created for the earlier partial approach

## Implementation Order

1. Revert unrelated TypeScript/debug artifacts
2. Replace the broken Python server with a clean bridge-based implementation
3. Add LangGraph adapter support
4. Update sandbox UI for multi-framework visibility
5. Update Python requirements
6. Install missing Python dependencies
7. Run manual sandbox tests against Optima ingest/control APIs

## Acceptance Criteria

- No Optima SDK import or usage remains in the sandbox server path
- MS Agent Framework agents emit telemetry automatically
- LangGraph agents emit telemetry automatically
- No manual audit event emission is required in customer agent code
- Sandbox UI can run agents from both frameworks
- Audit log entries appear correctly in Optima