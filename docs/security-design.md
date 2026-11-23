# Famora — Security Architecture

## 1. Security Posture & Threat Model

Famora stores highly sensitive personal, financial, medical, legal, and child-related data. Our security architecture follows **Zero-Trust Multi-Tenancy** and **Defense-in-Depth**:

1. **Identity & Authentication Layer** (Supabase Auth + MFA/Passkeys)
2. **Application & BFF Layer** (Next.js Server Validation, CSRF, Rate Limiting, Input Sanitization)
3. **Database Layer** (PostgreSQL Row-Level Security on every table)
4. **Storage Layer** (Private buckets, short-lived signed URLs, optional client-side/envelope encryption for Sensitive Vault)
5. **Client & PWA Layer** (Strict CSP, partitioned caches, lock-screen push privacy)

---

## 2. Authentication & Session Security

- **Primary Auth**: Email/Password (Argon2id/bcrypt via Supabase Auth), OAuth (Google, Apple), Magic Links, and **WebAuthn Passkeys** for frictionless biometric login.
- **MFA**: TOTP MFA strongly recommended for `Owner` and `Admin` roles, and **required** (configurable per family) to access `sensitive_vault` documents or export family data.
- **Managed Child Access**:
  - Young children without email accounts use `is_managed_child = true` profiles.
  - Access is granted either via **Parent-Unlocked Kiosk Mode** (time-bounded session) or a **4–6 digit PIN** bound to a parent-authorized device token, strictly scoped to `child` permissions.
- **Session Handling**:
  - `HttpOnly`, `Secure`, `SameSite=Lax` cookies via `@supabase/ssr`.
  - Short-lived JWTs (1 hour) with rotating refresh tokens.
  - Session revocation capability from Settings ("Sign out all devices").

---

## 3. Authorization & Tenant Isolation

- **Never trust client-supplied `member_id` or `role`**: Server Actions, Route Handlers, and RLS policies derive the caller's `auth.uid()` from the verified JWT and look up `family_members` for the target `family_id`.
- **Two-Layer Enforcement**:
  1. **Database (Primary Gate)**: Postgres RLS guarantees no row from Family B can ever be read or mutated by a member of Family A, even if an API bug occurs.
  2. **BFF / UI (UX & Business Gate)**: Next.js middleware & Server Actions validate permissions before executing side effects (AI calls, signed URLs, push notifications).

---

## 4. Sensitive Data & Storage Security

- **Private Buckets Only**: `family-documents`, `family-memories`, `chat-attachments`, `family-avatars`. Zero public buckets.
- **Signed URLs**: Generated server-side after checking `family_members` + domain permission, with 60–300 second TTL.
- **Sensitive Vault (`documents.sensitivity = 'sensitive_vault'`)**:
  - Requires `documents.view_sensitive` permission.
  - Every view/download writes an immutable entry to `audit_logs`.
  - Supports optional family-level **Vault Passphrase** (client-side WebCrypto AES-GCM encryption before upload) for zero-knowledge storage of passports/SSNs.
- **Encrypted Columns**: `external_calendar_links.ical_url_encrypted` and `child_profiles.pediatrician_info_encrypted` encrypted at rest via `pgcrypto` / app-level KMS key.

---

## 5. AI Assistant Security

- **RLS-Scoped Execution**: AI tool calls execute with the requesting user's Supabase JWT—never a service-role key.
- **Prompt Injection Defense**:
  - System prompts strictly separate user instructions from retrieved family data.
  - Mutating AI actions (creating tasks, adding calendar events, modifying shopping lists) require **explicit user confirmation** in the UI before committing.
  - AI never autonomously deletes records, transfers money, or changes permissions.
- **Data Minimization**: Only summaries/fields from domains the user is permitted to read are included in LLM context. No PII training opt-in with LLM providers.

---

## 6. PWA & Client Security

- **Content Security Policy (CSP)**: Strict `script-src`, `connect-src`, `frame-ancestors 'none'` to mitigate XSS.
- **Cache Hygiene**:
  - Sensitive Vault documents and Finance reports are marked `Cache-Control: no-store` and excluded from Service Worker caching.
  - On sign-out or removal from a family, the client purges TanStack Query cache, IndexedDB partitions for that family, and Service Worker runtime caches.
- **Push Notification Privacy**: Payloads contain only non-sensitive titles (`"New message in Family Chat"`, `"Safety Check-in Alert"`); sensitive content is fetched only after authenticated app open.

---

## 7. Rate Limiting & Abuse Prevention

- Upstash Redis sliding-window rate limits on:
  - Auth & PIN attempts (exponential lockout after 5 failed PINs)
  - Family invite creation & acceptance (prevent token brute-forcing)
  - AI Assistant requests (per-user & per-family daily token/request quotas)
  - SOS / Safety alerts (prevent spam while never blocking genuine emergencies)
