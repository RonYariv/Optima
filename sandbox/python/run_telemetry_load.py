"""
Generate sandbox telemetry by sending many chat requests through existing agents.

This script:
1) Ensures required services are up (docker stack, mock MCP servers, sandbox agent server)
2) Sends N unique questions across multiple agents and models
3) Verifies traces were created and cost fields are populated

Usage:
  python run_telemetry_load.py --questions 200
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import random
import shutil
import subprocess
import sys
import time
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv


@dataclass
class RunItem:
    index: int
    agent_id: str
    model: str
    question: str


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _create_hs256_jwt(secret: str, project_id: str, sub: str = "sandbox-load-runner") -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "sub": sub,
        "role": "writer",
        "projects": [project_id],
        "iss": "agent-optima",
        "aud": "agent-optima-api",
        "iat": now,
        "exp": int((datetime.now(timezone.utc) + timedelta(days=365)).timestamp()),
    }
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = f"{_b64url(json.dumps(header, separators=(',', ':')).encode())}.{_b64url(json.dumps(payload, separators=(',', ':')).encode())}"
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(signature)}"


def run_cmd(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        check=check,
        text=True,
        capture_output=True,
    )


def spawn_background(cmd: list[str], cwd: Path, log_file: Path) -> subprocess.Popen[Any]:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    out = open(log_file, "a", encoding="utf-8")
    resolved_cmd = list(cmd)
    if resolved_cmd:
        exe = resolved_cmd[0]
        if os.name == "nt":
            # On Windows, npm is usually exposed as npm.cmd; resolve it explicitly.
            if exe.lower() == "npm":
                resolved_cmd[0] = shutil.which("npm.cmd") or shutil.which("npm") or exe
            else:
                resolved_cmd[0] = shutil.which(exe) or exe
        else:
            resolved_cmd[0] = shutil.which(exe) or exe
    return subprocess.Popen(
        resolved_cmd,
        cwd=str(cwd),
        stdout=out,
        stderr=subprocess.STDOUT,
        text=True,
    )


def wait_for_http(url: str, timeout_sec: int, interval_sec: float = 2.0) -> bool:
    deadline = time.time() + timeout_sec
    with httpx.Client(timeout=5.0) as client:
        while time.time() < deadline:
            try:
                resp = client.get(url)
                if resp.status_code < 500:
                    return True
            except Exception:
                pass
            time.sleep(interval_sec)
    return False


def ping_mcp_tool(url: str, tool_name: str, arguments: dict[str, Any]) -> bool:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code == 200:
                return True
            # Backward compatibility: some mock MCP servers expose /mcp only.
            if not url.rstrip("/").endswith("/mcp"):
                resp2 = client.post(f"{url.rstrip('/')}/mcp", json=payload)
                return resp2.status_code == 200
            return False
    except Exception:
        return False


def ensure_services(repo_root: Path, sandbox_py_dir: Path, startup_timeout_sec: int) -> tuple[bool, bool]:
    print("[1/5] Ensuring docker services are up...")
    run_cmd(
        ["docker", "compose", "up", "-d", "postgres", "analytics-workers", "api-gateway", "control-api"],
        cwd=repo_root,
        check=True,
    )

    if not wait_for_http("http://localhost:3000/healthz", timeout_sec=startup_timeout_sec):
        raise RuntimeError("api-gateway did not become healthy on http://localhost:3000/healthz")
    if not wait_for_http("http://localhost:3001/healthz", timeout_sec=startup_timeout_sec):
        raise RuntimeError("control-api did not become healthy on http://localhost:3001/healthz")

    print("[2/5] Ensuring mock MCP servers are up...")
    started_mcp = False
    mcp_ok = ping_mcp_tool("http://localhost:4011", "search", {"query": "agent observability"})
    if not mcp_ok:
        spawn_background(
            ["npm", "run", "--workspace=@agent-optima/sandbox", "dev"],
            cwd=repo_root,
            log_file=repo_root / "sandbox" / "mcp-servers.log",
        )
        started_mcp = True

    deadline = time.time() + startup_timeout_sec
    while time.time() < deadline:
        web_ok = ping_mcp_tool("http://localhost:4011", "search", {"query": "test"})
        fs_ok = ping_mcp_tool("http://localhost:4010", "list_dir", {"path": "."})
        if web_ok and fs_ok:
            break
        time.sleep(2.0)
    else:
        raise RuntimeError("Mock MCP servers did not become ready on ports 4010/4011")

    print("[3/5] Ensuring sandbox agent server is up...")
    started_sandbox = False
    if not wait_for_http("http://localhost:8765/healthz", timeout_sec=2):
        spawn_background(
            [sys.executable, "-m", "uvicorn", "agentic_server:app", "--port", "8765"],
            cwd=sandbox_py_dir,
            log_file=repo_root / "sandbox" / "python" / "sandbox-agent.log",
        )
        started_sandbox = True

    if not wait_for_http("http://localhost:8765/healthz", timeout_sec=startup_timeout_sec):
        raise RuntimeError("sandbox agent server did not become ready on http://localhost:8765/healthz")

    if not wait_for_http("http://localhost:8765/v1/agents", timeout_sec=10):
        raise RuntimeError("sandbox /v1/agents endpoint is not responding")

    return started_mcp, started_sandbox


def fetch_all_traces(control_api_url: str, token: str, project_id: str, max_pages: int = 30) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    with httpx.Client(timeout=15.0) as client:
        for _ in range(max_pages):
            params: dict[str, Any] = {"projectId": project_id, "limit": 100}
            if cursor:
                params["cursor"] = cursor
            resp = client.get(
                f"{control_api_url.rstrip('/')}/v1/traces",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            payload = resp.json()
            page_data = payload.get("data", []) if isinstance(payload, dict) else []
            rows.extend(page_data)
            cursor = payload.get("nextCursor") if isinstance(payload, dict) else None
            if not cursor:
                break
    return rows


def build_run_items(total_questions: int, models: list[str]) -> list[RunItem]:
    agents = [
        "research-bot-ms",
        "calculator-ms",
        "optima-inspector-ms",
        "research-bot-langgraph",
        "calculator-langgraph",
        "optima-inspector-langgraph",
    ]

    topics = [
        "prompt injection defense",
        "retrieval quality metrics",
        "agent memory pruning",
        "tool timeout strategies",
        "trace sampling tradeoffs",
        "cost anomaly detection",
        "token budgeting",
        "evaluation rubric design",
        "hallucination mitigation",
        "multi-agent delegation",
        "MCP server reliability",
        "JSON schema validation",
        "latency percentile tuning",
        "queue backpressure",
        "incident triage flow",
        "context window management",
        "structured output guards",
        "sandboxing tool execution",
        "model routing policy",
        "fallback orchestration",
        "knowledge freshness checks",
        "audit policy design",
        "root-cause labeling",
        "failure taxonomy",
        "service health SLOs",
    ]

    question_styles = [
        "Give a concise explanation with one practical checklist.",
        "Compare two approaches and recommend one with reasons.",
        "Explain tradeoffs for a startup team with limited resources.",
        "Provide a short policy draft and one anti-pattern to avoid.",
        "Give a step-by-step plan and include a quick validation test.",
        "Explain this as if onboarding a new engineer next week.",
        "Provide a risk matrix with likelihood and impact labels.",
        "Summarize with 3 bullet points and one measurable KPI.",
    ]

    run_items: list[RunItem] = []
    for i in range(total_questions):
        index = i + 1
        agent_id = agents[i % len(agents)]
        model = models[i % len(models)]
        topic = topics[i % len(topics)]
        style = question_styles[(i // len(topics)) % len(question_styles)]

        if "research-bot" in agent_id:
            question = (
                f"[Q{index:03d}] For topic '{topic}', use web_search first, then summarize findings, "
                f"and compute one numeric estimate with calculator for expected effort. {style}"
            )
        elif "calculator" in agent_id:
            a = 17 + (i * 3) % 97
            b = 11 + (i * 5) % 89
            c = 3 + (i % 9)
            d = 2 + (i % 7)
            question = (
                f"[Q{index:03d}] Solve this expression exactly using your calculator tool: "
                f"(({a} * {b}) + ({c} ** 2) - {d}) / {c}. Then explain the result in one sentence."
            )
        else:
            question = (
                f"[Q{index:03d}] Inspect live Optima data for project activity and provide insights. "
                f"Use get_traces, get_failures, and get_cost_summary, then report anomalies related to '{topic}'. {style}"
            )

        run_items.append(RunItem(index=index, agent_id=agent_id, model=model, question=question))

    return run_items


def post_chat(
    server_url: str,
    item: RunItem,
    groq_api_key: str,
    optima_token: str,
    project_id: str,
    timeout_sec: int,
    max_retries: int,
) -> tuple[bool, dict[str, Any]]:
    payload = {
        "agent_id": item.agent_id,
        "messages": [{"role": "user", "content": item.question}],
        "llm_config": {
            "api_key": groq_api_key,
            "model": item.model,
            "base_url": "https://api.groq.com/openai/v1",
        },
        "optima_config": {
            "project_id": project_id,
            "token": optima_token,
        },
    }

    err_msg = "unknown"
    with httpx.Client(timeout=timeout_sec) as client:
        for attempt in range(1, max_retries + 1):
            try:
                resp = client.post(f"{server_url.rstrip('/')}/v1/chat", json=payload)
                if resp.status_code >= 400:
                    err_msg = f"HTTP {resp.status_code}: {resp.text[:500]}"
                    raise RuntimeError(err_msg)
                body = resp.json()
                return True, body
            except Exception as exc:
                err_msg = str(exc)
                retry_after_match = re.search(r"try again in\s+(\d+)ms", err_msg, flags=re.IGNORECASE)
                if retry_after_match:
                    sleep_sec = max(1.0, int(retry_after_match.group(1)) / 1000.0)
                elif "429" in err_msg or "rate_limit_exceeded" in err_msg:
                    sleep_sec = min(2**attempt, 15)
                elif "tool_use_failed" in err_msg or "failed_generation" in err_msg:
                    sleep_sec = min(1 + attempt, 5)
                else:
                    sleep_sec = min(2**attempt, 10)
                time.sleep(sleep_sec)
    return False, {"error": err_msg}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run sandbox load to generate traces/audits/tool+MCP calls.")
    parser.add_argument("--questions", type=int, default=200, help="Number of unique questions to run")
    parser.add_argument("--project-id", default="sandbox", help="Project ID to ingest under")
    parser.add_argument("--timeout", type=int, default=90, help="Per-chat timeout in seconds")
    parser.add_argument("--max-retries", type=int, default=3, help="Retries per chat request")
    parser.add_argument("--startup-timeout", type=int, default=240, help="Startup wait timeout in seconds")
    parser.add_argument("--server-url", default="http://localhost:8765", help="Sandbox agent server URL")
    parser.add_argument("--control-api-url", default="http://localhost:3001", help="Control API URL")
    parser.add_argument(
        "--models",
        default="llama-3.1-8b-instant,llama-3.3-70b-versatile,openai/gpt-oss-20b,openai/gpt-oss-120b",
        help="Comma-separated Groq model IDs",
    )
    parser.add_argument(
        "--results-file",
        default="sandbox/python/telemetry-load-results.json",
        help="Output JSON file with run details",
    )
    parser.add_argument(
        "--skip-service-start",
        action="store_true",
        help="Skip auto-starting docker/services and only run requests",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    this_file = Path(__file__).resolve()
    sandbox_py_dir = this_file.parent
    repo_root = sandbox_py_dir.parents[1]

    load_dotenv(repo_root / ".env")
    load_dotenv(repo_root / "sandbox" / ".env")

    groq_api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_api_key:
        print("ERROR: GROQ_API_KEY is missing. Set it in sandbox/.env or environment.")
        return 1

    project_id = args.project_id.strip()
    optima_token = os.environ.get("OPTIMA_TOKEN", "").strip()
    if not optima_token:
        jwt_secret = os.environ.get("JWT_SECRET", "").strip()
        if not jwt_secret:
            print("ERROR: OPTIMA_TOKEN missing and JWT_SECRET not found to auto-generate one.")
            return 1
        optima_token = _create_hs256_jwt(jwt_secret, project_id)
        print("Generated scoped OPTIMA token from JWT_SECRET.")

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    if not models:
        print("ERROR: No models configured.")
        return 1

    if not args.skip_service_start:
        ensure_services(repo_root, sandbox_py_dir, args.startup_timeout)

    print("[4/5] Capturing baseline trace set...")
    baseline = fetch_all_traces(args.control_api_url, optima_token, project_id)
    baseline_ids = {row.get("id") for row in baseline if row.get("id")}

    print("[5/5] Sending questions...")
    run_items = build_run_items(args.questions, models)

    random.shuffle(run_items)
    successes = 0
    failures = 0
    results: list[dict[str, Any]] = []

    for idx, item in enumerate(run_items, start=1):
        ok, body = post_chat(
            server_url=args.server_url,
            item=item,
            groq_api_key=groq_api_key,
            optima_token=optima_token,
            project_id=project_id,
            timeout_sec=args.timeout,
            max_retries=args.max_retries,
        )

        if ok:
            successes += 1
            text = str(body.get("text", ""))
            results.append(
                {
                    "index": item.index,
                    "agent_id": item.agent_id,
                    "model": item.model,
                    "ok": True,
                    "response_preview": text[:400],
                }
            )
        else:
            failures += 1
            results.append(
                {
                    "index": item.index,
                    "agent_id": item.agent_id,
                    "model": item.model,
                    "ok": False,
                    "error": body.get("error", "unknown"),
                }
            )

        if idx % 10 == 0 or idx == len(run_items):
            print(f"Progress: {idx}/{len(run_items)} | success={successes} fail={failures}")

        # Smooth token demand to reduce Groq TPM spikes during long batches.
        time.sleep(0.35)

    print("Waiting for workers to process and aggregate costs...")
    deadline = time.time() + 180
    new_rows: list[dict[str, Any]] = []
    while time.time() < deadline:
        all_rows = fetch_all_traces(args.control_api_url, optima_token, project_id)
        new_rows = [r for r in all_rows if r.get("id") not in baseline_ids]
        if len(new_rows) >= successes:
            break
        time.sleep(3)

    cost_populated_count = sum(
        1
        for row in new_rows
        if row.get("totalCostUsd") is not None and row.get("totalTokens") is not None
    )

    summary = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "project_id": project_id,
        "requested_questions": args.questions,
        "successful_requests": successes,
        "failed_requests": failures,
        "new_trace_count": len(new_rows),
        "cost_populated_trace_count": cost_populated_count,
        "models_used": sorted(set(item.model for item in run_items)),
        "agents_used": sorted(set(item.agent_id for item in run_items)),
        "results": results,
    }

    output_path = repo_root / args.results_file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\nRun completed.")
    print(f"- Successful requests: {successes}")
    print(f"- Failed requests: {failures}")
    print(f"- New traces observed: {len(new_rows)}")
    print(f"- Traces with populated cost+tokens fields: {cost_populated_count}")
    print(f"- Results file: {output_path}")

    if successes == 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
