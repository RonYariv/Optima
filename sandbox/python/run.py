"""
Python sandbox runner.

Usage:
    python run.py            # run all scenarios
    python run.py agentic    # run agentic-style only
    python run.py langchain  # run langchain-style only
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Add lib dir to path so relative imports work
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")

from optima_sdk import OptimaClient  # noqa: E402
from scenarios.agentic_style import run_agentic_style  # noqa: E402
from scenarios.langchain_style import run_langchain_style  # noqa: E402

OPTIMA_URL = os.environ.get("OPTIMA_URL", "http://localhost:3000")
OPTIMA_TOKEN = os.environ.get("OPTIMA_TOKEN", "")
TENANT_ID = os.environ.get("TENANT_ID", "sandbox")
PROJECT_ID = os.environ.get("PROJECT_ID", "demo")

if not OPTIMA_TOKEN:
    print("ERROR: OPTIMA_TOKEN is not set. Copy sandbox/.env.example to sandbox/.env and fill in the token.")
    sys.exit(1)

client = OptimaClient(url=OPTIMA_URL, token=OPTIMA_TOKEN, silent=False)

scenario = sys.argv[1] if len(sys.argv) > 1 else "all"

print(f"\n=== Optima Python Sandbox ===")
print(f"URL:      {OPTIMA_URL}")
print(f"Tenant:   {TENANT_ID}")
print(f"Project:  {PROJECT_ID}")
print(f"Scenario: {scenario}\n")

if scenario in ("all", "agentic"):
    run_agentic_style(client, TENANT_ID, PROJECT_ID)

if scenario in ("all", "langchain"):
    run_langchain_style(client, TENANT_ID, PROJECT_ID)

print("\nPython sandbox complete.")
