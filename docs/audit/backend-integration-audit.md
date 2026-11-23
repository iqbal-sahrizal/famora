# Famora — Backend Integration Audit

## Server Actions & API Routes
- **Server Actions**: All 20 feature domains implement Zod-validated Server Actions using `createSupabaseServerClient()` (`@supabase/ssr`), calling `requireAuthenticatedUser()` and checking `get_my_family_permissions` / active `family_members`.
- **RPC Exposure (`0029_public_rpc_wrappers.sql`)**: All 17 `famora.*` RPC functions called via `supabase.rpc(...)` now have `public.*` `SECURITY INVOKER` wrappers with `GRANT EXECUTE ... TO authenticated`.
- **API Routes**:
  - `GET /api/health`: returns `200 OK` `{ status: "ok", service: "famora", timestamp }`.
  - `POST /api/ai/stream`: checks `auth.getUser()`, `ai.assistant.use`, hourly rate limit, and streams authorized context responses.
- **Discrepancies Found**:
  1. `src/lib/pwa/sync-engine.ts` (`flushOfflineOutbox`, `enqueueOfflineMutation`) is not wired to UI actions (`AUD-001`, `AUD-003`).
  2. Missing backend actions for Delete Family (`AUD-004`), Edit/Delete Shopping List (`AUD-005`), Edit/Delete Announcement (`AUD-006`), Edit/Delete Finance Account (`AUD-007`), Delete Notification (`AUD-008`), Edit Habit/Memory (`AUD-009`).
  3. Live Supabase query execution against a live instance was not run via automated integration tests (`NOT_TESTED` / `BLOCKED`).
