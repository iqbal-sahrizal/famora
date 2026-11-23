# Famora — PWA & External Integrations Audit

---

## 1. Service Worker, Manifest & Offline Shell

- **Manifest (`src/app/manifest.ts`):** Serves `/manifest.webmanifest` (`display: "standalone"`, `start_url: "/"`, `theme_color: "#2F6B4E"`, `background_color: "#F8F6F1"`, 192px & 512px SVG icons).
- **Service Worker (`public/sw.js`):**
  - Caches: `famora-shell-v2` and `famora-static-v2`; precaches `/offline.html`, `/icons/icon-192.svg`, `/icons/icon-512.svg`.
  - Bypasses `/api/`, `/auth/`, `supabase.co`, and `?_rsc` (`isPrivateOrDynamicRequest`).
  - Cache-First for `/_next/static/` (skipped in local dev) and `/icons/`; Network-First with `/offline.html` fallback for `navigate` requests.
  - Handles `push` (JSON `{ title, body, url }` or plain text) and `notificationclick` events.
- **`next.config.ts` Headers:** Sets `Cache-Control: no-cache, no-store, must-revalidate` and `Service-Worker-Allowed: /` on `/sw.js`.

---

## 2. Offline Cache & Mutation Outbox (`src/lib/pwa/`)

- **IndexedDB (`src/lib/pwa/indexeddb.ts`):** `famora-pwa-db` v1 (`offline_cache`, `mutation_outbox`) with in-memory fallback for Node/SSR tests.
- **Sync Engine (`src/lib/pwa/sync-engine.ts`):**
  - Blocks sensitive domains (`finance`, `permissions`, `sensitive_uploads`); deduplicates by `idempotencyKey`.
  - Domain conflict rules: `shopping` (`apply_client`), `tasks`/`calendar` (server wins if completed/newer), `drafts` (`manual_review` if server newer).
  - Exponential backoff (`[2s, 5s, 15s, 45s, 120s]`, max 5 attempts); preserves mutations on `authExpired`.
- **Domain Executors (`src/lib/pwa/domain-sync.ts`):**
  - Wired to real Server Actions for `shopping` (`add_item`, `toggle_check`, `update_quantity`), `tasks` (`save_task`, `toggle_status`), and `calendar` (`save_event`, `rsvp_event`).
  - **Defect:** `drafts` domain (`:183–185`) is a no-op stub returning `{ ok: true }` without persisting to the server.

---

## 3. External Integrations

| Integration | Implementation | Production Readiness |
| :--- | :--- | :--- |
| **Supabase (Auth, Postgres, Storage, Realtime)** | `@supabase/ssr` + `@supabase/supabase-js` | Configured via `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Live staging/prod verification blocked without credentials. |
| **Web Push (VAPID + RFC 8291)** | `src/features/notifications/vapid.ts` (zero-dependency Node `crypto`, ES256 VAPID JWT, `aes128gcm` encryption) | Unit-tested (`vapid-rfc8291.test.ts`). Requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` + live browser push test. |
| **AI Assistant (OpenAI-compatible)** | `src/features/ai/provider.ts` (`fetch` to `/chat/completions`, default `gpt-4o-mini`) + `famora_local` fallback | Optional `OPENAI_API_KEY`; falls back silently to deterministic templates if unset or failing. |
| **Email / WhatsApp / SMS** | None | **Not implemented.** `email` & `whatsapp` toggles in `settings` are UI/preference placeholders only; `notification_outbox` only processes `in_app` and `push`. |
| **Upstash Redis / App Encryption** | Listed in `src/lib/env.ts` (`UPSTASH_REDIS_*`, `APP_ENCRYPTION_KEY`) | **Unused.** No Redis or `APP_ENCRYPTION_KEY` consumer exists in `src/`. |
