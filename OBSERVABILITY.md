# Observability Setup (Grafana + Loki + Prometheus)

This project now includes a local observability stack that provides:
- database/storage metrics,
- API/runtime metrics,
- backend request/error logs.

## 1. Start backend with logs enabled

Default behavior already writes JSON logs to `backend/logs/server.log`.

```powershell
npm run start:backend
```

Optional env vars:
- `LOG_TO_FILE=0` - disable file logging,
- `LOG_FILE_PATH=...` - custom log file path,
- `BACKEND_PORT` - backend port (default `8787`).

## 2. Start observability stack

```powershell
npm run obs:up
```

Services:
- Grafana: `http://localhost:3001` (`admin` / `admin`)
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`

Preloaded dashboard:
- `Vercord Backend Overview` (folder: `Vercord`)

## 3. Verify backend metrics

```powershell
curl http://localhost:8787/api/metrics
```

## 4. What to check in Grafana

Prometheus queries:
- `vercord_http_requests_total`
- `vercord_http_responses_by_status_total`
- `vercord_db_users_total`
- `vercord_db_storage_bytes`
- `vercord_rooms_active`

Loki query examples:
- `{job="vercord_backend"}`
- `{job="vercord_backend", level="error"}`
- `{job="vercord_backend", event="http_response"} |= "status":500`

## 5. Stop stack

```powershell
npm run obs:down
```

## Notes

- Prometheus scrapes `http://host.docker.internal:8787/api/metrics`.
- If backend is on another host/port, update `observability/prometheus/prometheus.yml`.
- Promtail reads logs from `backend/logs/*.log`.
- For reverse proxy under domain subpath, Grafana is configured to serve from `/monitor/`.

