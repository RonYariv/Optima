-- Enable PGMQ extension for async event queues.
-- This script runs once when the Postgres container is first initialised.
CREATE EXTENSION IF NOT EXISTS pgmq;
