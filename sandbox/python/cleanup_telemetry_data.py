"""
Cleanup telemetry data (traces + related rows) for a given project.

This script deletes rows from:
- audit_events
- model_calls
- tool_calls
- failure_events
- trace_steps
- traces

Optionally, it can also purge ingest queue tables in pgmq schema.

Usage:
  python cleanup_telemetry_data.py --project-id sandbox --yes
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


def run_cmd(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        check=check,
        text=True,
        capture_output=True,
    )


def psql_exec(repo_root: Path, sql: str) -> subprocess.CompletedProcess[str]:
    return run_cmd(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "optima",
            "-d",
            "agentoptima",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            sql,
        ],
        cwd=repo_root,
        check=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Delete traces and related telemetry rows for a project.")
    parser.add_argument("--project-id", default="sandbox", help="Project ID to clean")
    parser.add_argument("--purge-queues", action="store_true", help="Also purge pgmq ingest queue tables")
    parser.add_argument("--yes", action="store_true", help="Required confirmation flag")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.yes:
        print("Refusing to run without --yes")
        return 2

    this_file = Path(__file__).resolve()
    repo_root = this_file.parents[2]
    project_id = args.project_id.replace("'", "''")

    print("Ensuring postgres container is running...")
    run_cmd(["docker", "compose", "up", "-d", "postgres"], cwd=repo_root, check=True)

    count_sql = f"""
SELECT
  (SELECT count(*) FROM traces t WHERE t.project_id = '{project_id}') AS traces,
  (SELECT count(*) FROM trace_steps s JOIN traces t ON t.id = s.trace_id WHERE t.project_id = '{project_id}') AS trace_steps,
  (SELECT count(*) FROM model_calls m JOIN traces t ON t.id = m.trace_id WHERE t.project_id = '{project_id}') AS model_calls,
  (SELECT count(*) FROM tool_calls c JOIN traces t ON t.id = c.trace_id WHERE t.project_id = '{project_id}') AS tool_calls,
  (SELECT count(*) FROM failure_events f JOIN traces t ON t.id = f.trace_id WHERE t.project_id = '{project_id}') AS failure_events,
  (SELECT count(*) FROM audit_events a JOIN traces t ON t.id = a.trace_id WHERE t.project_id = '{project_id}') AS audit_events;
"""

    print("Counting rows before cleanup...")
    before = psql_exec(repo_root, count_sql)
    print(before.stdout.strip())

    delete_sql = f"""
BEGIN;

DELETE FROM audit_events a
USING traces t
WHERE a.trace_id = t.id
  AND t.project_id = '{project_id}';

DELETE FROM model_calls m
USING traces t
WHERE m.trace_id = t.id
  AND t.project_id = '{project_id}';

DELETE FROM tool_calls c
USING traces t
WHERE c.trace_id = t.id
  AND t.project_id = '{project_id}';

DELETE FROM failure_events f
USING traces t
WHERE f.trace_id = t.id
  AND t.project_id = '{project_id}';

DELETE FROM trace_steps s
USING traces t
WHERE s.trace_id = t.id
  AND t.project_id = '{project_id}';

DELETE FROM traces t
WHERE t.project_id = '{project_id}';

COMMIT;
"""

    print(f"Deleting telemetry rows for project '{args.project_id}'...")
    deleted = psql_exec(repo_root, delete_sql)
    print(deleted.stdout.strip())

    if args.purge_queues:
        queue_sql = """
DO $$
BEGIN
  IF to_regclass('pgmq.q_model-call-ingest') IS NOT NULL THEN
    EXECUTE 'DELETE FROM pgmq."q_model-call-ingest"';
  END IF;
  IF to_regclass('pgmq.q_tool-call-ingest') IS NOT NULL THEN
    EXECUTE 'DELETE FROM pgmq."q_tool-call-ingest"';
  END IF;
  IF to_regclass('pgmq.q_audit-event-ingest') IS NOT NULL THEN
    EXECUTE 'DELETE FROM pgmq."q_audit-event-ingest"';
  END IF;
END $$;
"""
        print("Purging PGMQ ingest queues...")
        purged = psql_exec(repo_root, queue_sql)
        print(purged.stdout.strip())

    print("Counting rows after cleanup...")
    after = psql_exec(repo_root, count_sql)
    print(after.stdout.strip())

    print("Cleanup completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
