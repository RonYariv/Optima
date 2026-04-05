-- Pure-SQL PGMQ compatibility layer.
-- Implements the same pgmq.* function signatures as the real extension so
-- that all application code works unchanged with a stock postgres:16-alpine image.
-- Uses SKIP LOCKED — available in PostgreSQL 9.5+.

CREATE SCHEMA IF NOT EXISTS pgmq;

-- pgmq.create(queue_name) — creates the queue table (idempotent)
CREATE OR REPLACE FUNCTION pgmq.create(queue_name text) RETURNS void AS $$
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS pgmq.%I (
       msg_id      BIGSERIAL PRIMARY KEY,
       vt          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
       enqueued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
       read_ct     INTEGER NOT NULL DEFAULT 0,
       message     JSONB NOT NULL
     )', 'q_' || queue_name);
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON pgmq.%I (vt)',
    'q_' || queue_name || '_vt_idx',
    'q_' || queue_name);
END;
$$ LANGUAGE plpgsql;

-- pgmq.send(queue_name, msg) — enqueue one message; returns msg_id
CREATE OR REPLACE FUNCTION pgmq.send(queue_name text, msg jsonb) RETURNS bigint AS $$
DECLARE result bigint;
BEGIN
  EXECUTE format(
    'INSERT INTO pgmq.%I (message) VALUES ($1) RETURNING msg_id',
    'q_' || queue_name
  ) USING msg INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- pgmq.send_batch(queue_name, msgs) — enqueue many; returns SETOF msg_id
CREATE OR REPLACE FUNCTION pgmq.send_batch(queue_name text, msgs jsonb[]) RETURNS SETOF bigint AS $$
DECLARE
  msg    jsonb;
  result bigint;
BEGIN
  FOREACH msg IN ARRAY msgs LOOP
    EXECUTE format(
      'INSERT INTO pgmq.%I (message) VALUES ($1) RETURNING msg_id',
      'q_' || queue_name
    ) USING msg INTO result;
    RETURN NEXT result;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- pgmq.read(queue_name, vt_seconds, qty) — claim up to qty messages
CREATE OR REPLACE FUNCTION pgmq.read(
  queue_name text, vt_seconds int, qty int
) RETURNS TABLE (
  msg_id      bigint,
  message     jsonb,
  enqueued_at timestamptz,
  read_ct     int
) AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'UPDATE pgmq.%I
     SET    vt      = NOW() + ($1 || '' seconds'')::interval,
            read_ct = read_ct + 1
     WHERE  msg_id IN (
       SELECT msg_id
       FROM   pgmq.%I
       WHERE  vt <= NOW()
       ORDER  BY msg_id
       LIMIT  $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING msg_id, message, enqueued_at, read_ct',
    'q_' || queue_name, 'q_' || queue_name
  ) USING vt_seconds, qty;
END;
$$ LANGUAGE plpgsql;

-- pgmq.delete(queue_name, msg_id) — acknowledge / delete one message
CREATE OR REPLACE FUNCTION pgmq.delete(queue_name text, msg_id bigint) RETURNS boolean AS $$
DECLARE rows_deleted int;
BEGIN
  EXECUTE format(
    'DELETE FROM pgmq.%I WHERE msg_id = $1',
    'q_' || queue_name
  ) USING msg_id;
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted > 0;
END;
$$ LANGUAGE plpgsql;

-- pgmq.archive(queue_name, msg_id) — move message to archive (we just delete it)
CREATE OR REPLACE FUNCTION pgmq.archive(queue_name text, msg_id bigint) RETURNS boolean AS $$
DECLARE rows_deleted int;
BEGIN
  EXECUTE format(
    'DELETE FROM pgmq.%I WHERE msg_id = $1',
    'q_' || queue_name
  ) USING msg_id;
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RETURN rows_deleted > 0;
END;
$$ LANGUAGE plpgsql;
