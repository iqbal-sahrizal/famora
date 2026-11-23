# Famora — Security Audit

## Verified Controls (Static & Unit Tests)
- **Auth Middleware**: `src/lib/supabase/middleware.ts` validates `supabase.auth.getUser()` and fails closed to `/login` for `/f/*`, `/onboarding`, and `/account`.
- **Secret Isolation**: `security-audit.test.ts` verified zero occurrences of `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, or `VAPID_PRIVATE_KEY` in `"use client"` modules; `db:validate` verified zero client service-role references.
- **RBAC & Escalation Guards**: `permissions.test.ts`, `rbac.test.ts`, and `security-audit.test.ts` verified cross-family rejection (`targetFamilyId !== familyId`), `isManagedChild` anti-escalation, and `owner`/`admin`/`adult`/`child`/`caregiver` boundaries.
- **Storage & Path Traversal**: `family-documents`, `chat-attachments`, and `family-memories` buckets are `public = false`, filenames strip `../` and `\`, and signed URLs expire in 120–180s.
- **AI & Safety Privacy**: Restricted AI actions (`transfer_money`, `delete_document`, `change_permissions`, `invite_member`, `modify_child_health_record`) are blocked; location sharing requires explicit consent, viewer list, and expiration.

## Unverified Security Areas
- Live PostgreSQL RLS impersonation tests (`SET LOCAL ROLE authenticated`) and live penetration/IDOR testing against a deployed Supabase project remain **BLOCKED** pending staging DB access.
