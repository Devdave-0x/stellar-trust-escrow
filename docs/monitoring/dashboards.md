# Grafana Dashboards

## Connecting Prometheus to Grafana

1. Start the observability stack:
   ```bash
   docker compose -f backend/monitoring/docker-compose.yml up -d
   ```

2. Ensure the backend exposes metrics:
   ```bash
   curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:4000/metrics
   ```

3. In Grafana (http://localhost:3001), add Prometheus as a data source:
   - URL: `http://ste_prometheus:9090`
   - Access: Server (default)

4. Import the dashboard:
   - Dashboards → Import → Upload JSON → `backend/monitoring/grafana/provisioning/dashboards/ste-overview.json`

## STE Overview (ste-overview.json)

Auto-provisioned. Access: http://localhost:3001/d/ste-overview

**Panels**:

1. Request Rate (req/s): `sum(rate(http_requests_total[1m])) by (route)`
2. P95 Latency (ms): `histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))`
3. Error Rate (%): 5xx / total \* 100
4. DB Query P95 (ms): `histogram_quantile(0.95, sum(rate(db_query_duration_ms_bucket[5m])) by (le, model, operation))`
5. Cache Hit Rate (%)
6. In-Flight Requests
7. Active Escrows
8. Slow Queries (1h)
9. Node Heap Used (MB)
10. Event Loop Lag (ms)
11. DB Connection Errors
12. DB Pool Exhaustion Events
13. DB Active Connections
14. DB Query Rate by Model
15. Redis Memory Usage (bytes): `redis_memory_usage_bytes`
16. Redis Memory Usage (MB): `redis_memory_usage_bytes / 1024 / 1024`
17. Escrow State Transitions (1h): `sum(increase(escrow_state_transitions_total[1h])) by (from_state, to_state)`
18. Escrow Transitions by Type (1h): `sum(increase(escrow_state_transitions_total[1h])) by (to_state)`
19. Escrow Creation Rate (1h): `sum(increase(escrow_state_transitions_total{from_state="null",to_state="Active"}[1h]))`
20. Escrow Completion Rate (1h): `sum(increase(escrow_state_transitions_total{to_state="Completed"}[1h]))`

**Export**: Full JSON in `backend/monitoring/grafana/provisioning/dashboards/ste-overview.json`

## Recommended Additions

- **Indexer Lag**: `indexer_lag_seconds` (add gauge in services/escrowIndexer.js)
- **Contract Events**: `contract_events_processed_total{chain,contract}`
- **SLA Uptime**: `100 - (sum(rate(http_requests_total{status_code=~"5.."}[24h])) / sum(rate(http_requests_total[24h])))`

Import via Grafana UI → Dashboards → Import → Upload JSON.

## Metrics Endpoint Protection

The `/metrics` endpoint is protected by `METRICS_TOKEN` bearer auth. When set, configure Prometheus scraping with:

```yaml
# backend/monitoring/prometheus.yml
scrape_configs:
  - job_name: 'stellar-trust-escrow'
    static_configs:
      - targets: ['host.docker.internal:4000']
    metrics_path: '/metrics'
    bearer_token: 'your_metrics_token_here'
```

Set `METRICS_TOKEN` in `.env` to enable protection. Without it, the endpoint is open (suitable for internal-network-only deployments).
