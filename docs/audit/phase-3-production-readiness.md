# Famora — Phase 3 Production Readiness Review

**Date:** 2026-11-23
**Overall Readiness:** **Code & Static Security Ready (`UNIT_VERIFIED + BUILD_VERIFIED`); Pre-Launch Live Staging Gate Required (`BLOCKED` in local environment without Docker/Supabase CLI)**

---

## 1. PWA & Notification Readiness Review (Task 3)

- **Service Worker (`public/sw.js`):**
  - Static assets (`/_next/static/`, `/icons/`) use cache-first in production and bypass cache-first on `localhost` dev chunks.
  - Private/dynamic paths (`/api/`, `/auth/`, `supabase.co`, `?_rsc`) are excluded from caching (`isPrivateOrDynamicRequest`).
  - Navigation requests fall back to `/offline.html`.
  - `push` and `notificationclick` listeners handle JSON/text payloads and focus/open target URLs.
- **Offline Outbox (`src/lib/pwa/sync-engine.ts`, `domain-sync.ts`, `use-pwa-sync.ts`):**
  - Unified IndexedDB store (`famora-pwa-db`), concurrent flush lock, auth-expiry pause (`401`/`403`/auth error), and `retrySync()` wired to `PwaStatusBar`.
- **Web Push / VAPID & Delivery (`src/features/notifications/vapid.ts`, `outbox.ts`):**
  - `vapid.ts` generates ES256 VAPID JWTs using `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` and encrypts payloads per **RFC 8291 (`aes128gcm`)** and **RFC 8188** (`encryptWebPushPayload`) using ephemeral P-256 ECDH, 16-byte random salt, and HKDF-SHA-256 (`Content-Encoding: aes128gcm`, `Content-Type: application/octet-stream`, `TTL: 86400`).
  - Fails closed when `p256dh` or `auth` subscriber keys are missing or invalid (never falls back to unencrypted JSON).
  - `outbox.ts` selects `push_p256dh` and `push_auth` from `user_devices` and passes them to `dispatchVapidPushNotification`.
  - **Verification Scope:** Implementation, encryption round-trip decryption, required headers, 404/410 expiration handling, and failure handling are **UNIT_VERIFIED** (`src/features/notifications/__tests__/vapid-rfc8291.test.ts`, 4/4 passed). **Actual browser push delivery is `BLOCKED`** (`VAPID_PRIVATE_KEY` is not configured in `.env.local` and no live browser push subscription / local Supabase instance is running).
  - Outbox deduplication (`idempotency_key,channel`), quiet hours (`isWithinQuietHours`), privacy-sanitized push payloads (`sanitizePushPayload`), and exponential retry backoff (`computeNextRetryDelaySeconds`) are implemented and unit-tested.

---

## 2. `AUD-004` Family Deletion Safety Review (Task 4)

- **Authorization:** Enforced at three layers — UI (`family.delete` permission check), Server Action (`assertServerPermission(familyId, "family.delete")`), and `SECURITY DEFINER` RPC `famora.delete_family_workspace` (checks `famora.has_permission(p_family_id, 'family.delete')` AND active `owner` role in `family_members`).
- **Accidental Deletion Prevention:** Requires exact case-sensitive match of `family.name` on both client dialog and server action (`parsed.data.confirmationName !== family.name`).
- **Atomic Cascade & Financial History Handling:** RPC deletes `debt_payments`, `finance_transactions`, and `finance_accounts` in dependency order inside a single transaction before deleting `public.families`, preventing `ON DELETE RESTRICT` foreign-key failures and guaranteeing zero orphaned DB records.
- **Storage Cleanup & Remaining Risks:**
  - Server action collects `document_files.storage_path`, `memory_items.storage_path`/`thumbnail_path`, and `chat_messages.attachment_path` before the RPC executes, then deletes them from `family-documents`, `family-memories`, and `family-chat` with 1 automatic retry per bucket (`removeBucketWithRetry`).
  - **Remaining Risk:** Storage cleanup runs after the DB commit as best-effort; if all retry attempts fail during a storage outage, orphaned files could remain in Supabase Storage buckets (mitigable via a periodic storage reconciliation job). Additionally, `0034` (`family-child-attachments`) paths should be included in `deleteFamilyAction` if child attachments exist; let's note this or ensure `child_attachments` paths are cleaned up too in a follow-up before production launch.

---

## 3. Pre-Launch Checklist Before Production Cutover

1. Start Docker / provision staging Supabase and apply migrations `0001`–`0034`.
2. Execute `npm run test:rls` against staging/local PostgreSQL (`TEST_DATABASE_URL`).
3. Execute all 6 Playwright E2E specs with `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY`.
4. Configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in staging/production and verify live browser push delivery end-to-end.
