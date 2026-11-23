# Famora Operations Runbook

## Health & Monitoring Checks
- **Liveness Endpoint**: `GET /api/health` returns `{ status: "ok", service: "famora", timestamp }` (`200 OK`). Monitor every 60 seconds with uptime alerts.
- **Database Health**: Monitor Supabase connection pool saturation, slow query logs, and RLS errors in Supabase Logs.
- **Notification Outbox**: Monitor `notification_outbox` rows where `status = 'failed'` or `attempts >= max_attempts` and `notification_delivery_logs` for `404`/`410` spikes.
- **AI Assistant Quota & Errors**: Monitor `ai_usage_logs` for `status = 'rate_limited'` or `'error'` spikes.
- **Offline Sync Failures**: Client `PwaStatusBar` surfaces pending/failed IndexedDB sync items with one-tap retry; never log sensitive payloads, tokens, or financial figures to external error trackers.

## Routine Maintenance
- **Backups**: Verify Supabase automated daily backups & monthly restore drill to staging.
- **Secret Rotation**: Rotate `VAPID_PRIVATE_KEY` or `OPENAI_API_KEY` only during planned maintenance windows; never commit secrets to git.
