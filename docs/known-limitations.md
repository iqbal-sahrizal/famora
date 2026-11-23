# Famora Known Limitations

1. **Live Database & Authenticated E2E Not Yet Executed in Local Environment**:
   - Docker Desktop is not running (`DOCKER_NOT_RUNNING`), and `supabase` CLI, `psql`, and `lighthouse` are not installed on this host. Live PostgreSQL RLS (`npm run test:rls` across migrations `0001`–`0034`), authenticated Playwright E2E (`aud-001`, `aud-002`, `aud-003`), and Lighthouse audits must be executed against staging before production cutover.
2. **Web Push Requires VAPID Keys, Live Subscription & HTTPS**:
   - RFC 8291 (`aes128gcm`) payload encryption is implemented and unit-tested (`vapid-rfc8291.test.ts`), but `VAPID_PRIVATE_KEY` is unset in `.env.local`, so live browser push delivery has not been tested against FCM/Apple/Mozilla endpoints.
   - Safari iOS Web Push requires iOS 16.4+ and launching from the installed Home Screen app.
3. **Best-Effort Storage Cleanup on Family Deletion**:
   - `deleteFamilyAction` cleans up `family-documents`, `family-memories`, `family-chat`, and `family-child-attachments` with 1 automatic retry per bucket after the atomic `delete_family_workspace` RPC commits; persistent storage outages could leave orphaned blobs requiring periodic reconciliation.
4. **AI External Provider Optional**:
   - If `OPENAI_API_KEY` is unset, Famora AI uses the deterministic local context engine fallback (`famora_local / context_engine_v1`).
5. **Offline Scope Boundaries**:
   - Financial transactions, permission changes, and sensitive document/media uploads intentionally require live connectivity and are never queued offline.
