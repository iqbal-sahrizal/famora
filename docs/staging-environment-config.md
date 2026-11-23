# Famora — Staging Environment Configuration

> **Security Policy:** This document lists **variable names only**. Never commit real secrets, service-role keys, database passwords, or private VAPID keys to Git or audit reports. Keep staging credentials strictly separate from production.

---

## 1. Public / Client-Safe Variables (`NEXT_PUBLIC_*` & App Origin)

| Variable Name | Purpose | Exposure |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Application display name (`Famora`) | Client & Server |
| `NEXT_PUBLIC_APP_URL` | Staging HTTPS origin (no trailing slash) | Client & Server |
| `NEXT_PUBLIC_SUPABASE_URL` | Staging Supabase project base origin (no `/rest/v1/`) | Client & Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging Supabase anonymous/public key | Client & Server |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Staging Web Push VAPID public key (base64url) | Client & Server |

---

## 2. Server-Only Secrets (Never Prefix with `NEXT_PUBLIC_`)

| Variable Name | Purpose | Exposure |
| :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging server-only admin key (test fixture setup only; never in browser code) | Server / CI Only |
| `VAPID_PRIVATE_KEY` | Staging ES256 VAPID private key for RFC 8291 push signing | Server Only |
| `VAPID_SUBJECT` | VAPID contact URI (`mailto:support@<staging-domain>`) | Server Only |
| `OPENAI_API_KEY` | Optional AI provider key (omit to use deterministic local context fallback) | Server Only |
| `OPENAI_MODEL` | Optional AI model identifier (e.g., `gpt-4o-mini`) | Server Only |

---

## 3. Isolated Staging Verification & E2E Variables

| Variable Name | Purpose | Exposure |
| :--- | :--- | :--- |
| `E2E_BASE_URL` | Target staging or isolated local server URL for Playwright | Test Runner Only |
| `E2E_SUPABASE_URL` | Staging/local Supabase URL for isolated E2E fixture setup | Test Runner Only |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Staging/local service-role key for creating/cleaning isolated test accounts | Test Runner Only |
| `TEST_DATABASE_URL` | Staging/local PostgreSQL connection URI for `npm run test:rls` | Test Runner Only |

---

## 4. Supabase Staging Auth & Storage Checklist

- **Authentication → URL Configuration:**
  - `Site URL`: `https://<staging-domain>`
  - `Redirect URLs`: `https://<staging-domain>/**`
- **Storage Buckets (`public = false`):**
  - `family-documents`
  - `family-memories`
  - `family-chat`
  - `family-child-attachments`
