"""
Python sandbox runner (deprecated).

Usage:
    python run.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Add lib dir to path so relative imports work
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")

print("\n=== Optima Python Sandbox ===")
print("Scenario scripts were removed.")
print("Use the API server instead:")
print("  cd sandbox/python")
print("  uvicorn agentic_server:app --port 8765 --reload")
sys.exit(0)
