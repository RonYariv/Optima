"""Pure-function mock tools for Python scenarios."""
from __future__ import annotations

import time
import random
from typing import Any, Dict, Tuple


def run_tool(name: str, input: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], int, str | None]:
    """
    Returns (success, output, latency_ms, error_type).
    """
    start = time.time()

    if name == "calculator":
        time.sleep(0.005 + random.random() * 0.015)
        return True, {"result": 42}, int((time.time() - start) * 1000), None

    elif name == "code_executor":
        time.sleep(0.1 + random.random() * 0.2)
        return True, {"stdout": "// executed", "exit_code": 0}, int((time.time() - start) * 1000), None

    elif name == "summariser":
        time.sleep(0.03 + random.random() * 0.05)
        return True, {"summary": "Lorem ipsum dolor sit amet…", "tokens": 128}, int((time.time() - start) * 1000), None

    elif name == "email_sender":
        time.sleep(0.05)
        return False, {}, int((time.time() - start) * 1000), "RateLimitError"

    else:
        return False, {}, int((time.time() - start) * 1000), "UnknownTool"
