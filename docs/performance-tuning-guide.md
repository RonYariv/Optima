# Performance Tuning Guide

This guide covers the A2 observability layer: latency histograms, queue health, and operational stats.

## Metrics Endpoints

- API Gateway Prometheus scrape: `GET /metrics` on port `3000`
- Control API Prometheus scrape: `GET /metrics` on port `3001`
- Analytics Workers Prometheus scrape: `GET /metrics` on port `9465` (configurable)

## Key Metrics

- `tool_call_latency_ms` histogram
- `model_call_latency_ms` histogram
- `queue_depth{queue=...}` gauge
- `ingest_requests_total{endpoint,status}` counter
- `failures_total{category}` counter

Failure categories are normalized to:
- `timeout`
- `auth`
- `validation`
- `provider`

## Dashboard Widgets

The Traces page includes two live widgets backed by `GET /v1/stats`:

- Tail Latencies: p95/p99 for model and tool calls
- Queue Health: pending depth, throughput, estimated drain time

You can switch window aggregation between `1h`, `24h`, and `7d`.

## CLI Stats

Use the CLI to query the same aggregate view:

```bash
OPTIMA_TOKEN=<jwt> optima-ctl stats --window 24h
```

Optional flags:

- `--window 1h|24h|7d`
- `--api http://localhost:3001`

## Baseline Targets

- Tool call p99 < 500ms
- Model call p99 < 2000ms

If p99 exceeds target:

1. Check `queue_depth` trend.
2. Compare `eventsPerSecond` and `drainTimeSec` in `/v1/stats`.
3. Inspect `failures_total` category growth.
4. Scale workers or reduce ingest burst size.

## Environment Variables

Control API:

- `GATEWAY_METRICS_URL` (default `http://localhost:3000/metrics`)
- `WORKER_METRICS_URL` (default `http://localhost:9465/metrics`)

Analytics workers:

- `METRICS_HOST` (default `0.0.0.0`)
- `METRICS_PORT` (default `9465`)
