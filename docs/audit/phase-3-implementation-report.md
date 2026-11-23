# Famora — Phase 3 Implementation Report

**Status:** `IMPLEMENTED_WITH_UNIT_AND_BUILD_VERIFICATION` (`Live E2E & Live PostgreSQL RLS BLOCKED`)
**Scope:** `AUD-010` (Internationalization), `AUD-011` (Child Development Binary Attachments), PWA & Notification Readiness Review, `AUD-004` Family Deletion Safety Review

---

## 1. `AUD-010` — Language / Internationalization Selector (`id` Default, `en` Additional)

- **Files Changed:**
  - `supabase/migrations/0033_member_preferences_locale.sql`
  - `src/lib/i18n/messages.ts`, `src/lib/i18n/index.ts`, `src/lib/i18n/__tests__/i18n.test.ts`
  - `src/providers/locale-provider.tsx`, `src/providers/app-providers.tsx`, `src/app/layout.tsx`
  - `src/features/settings/schemas.ts`, `src/features/settings/server.ts`, `src/features/settings/actions.ts`, `src/features/settings/components/family-settings-view.tsx`
  - `src/components/layout/app-shell.tsx`, `src/app/(app)/f/[familyId]/more/page.tsx`
- **Backend & Persistence:** `updatePersonalPreferencesAction` persists `locale` (`'id'` | `'en'`) into `public.member_preferences.locale` and sets the `famora_locale` cookie so SSR (`RootLayout`, `FamilyMorePage`) and client (`LocaleProvider`) render the same language across reloads and navigation with zero hydration mismatch.
- **Database Impact:** Migration `0033_member_preferences_locale.sql` adds `locale TEXT NOT NULL DEFAULT 'id' CHECK (locale IN ('id', 'en'))`.
- **Authorization Rules:** Scoped to the authenticated user's active `family_members.id` via `member_preferences` RLS.
- **Tests Executed & Actual Results:** `src/lib/i18n/__tests__/i18n.test.ts` — **2 passed (2)**.
- **Remaining Blockers:** Live browser reload/navigation E2E and live DB persistence test remain `BLOCKED`.

---

## 2. `AUD-011` — Child Development Binary File Attachments

- **Files Changed:**
  - `supabase/migrations/0034_child_dev_attachments.sql`
  - `src/features/child-dev/schemas.ts`, `src/features/child-dev/server.ts`, `src/features/child-dev/actions.ts`
  - `src/features/child-dev/components/child-development-view.tsx`
  - `src/features/child-dev/__tests__/child-dev-attachments.test.ts`
- **Backend Integration:**
  - `uploadChildAttachmentAction` validates file MIME type, extension (`pdf`, `jpg`, `jpeg`, `png`, `webp`), and size (<= 10 MB), verifies `child_profile_id` belongs to `familyId`, uploads to private bucket `family-child-attachments` under `${familyId}/${childProfileId}/${uuid}-${safeName}`, and removes the storage object if metadata insertion fails.
  - `getChildAttachmentSignedUrlAction` returns a short-lived signed URL (`60s` TTL) — never a public URL.
  - `deleteChildAttachmentAction` deletes the metadata row and removes the storage object.
- **Database Impact:** Migration `0034_child_dev_attachments.sql` creates private bucket `family-child-attachments`, table `public.child_attachments` with `FORCE ROW LEVEL SECURITY`, and storage policies.
- **Authorization Rules:** `health` attachments require `child_dev.health.view` for read/write/delete/sign; `education` and `milestone` attachments require `child_dev.identity.view` (read/sign) and `child_dev.growth_milestones.manage` (upload/delete).
- **Tests Executed & Actual Results:** `src/features/child-dev/__tests__/child-dev-attachments.test.ts` — **3 passed (3)**.
- **Remaining Blockers:** Live Supabase Storage upload/signed-URL/delete and live PostgreSQL RLS verification remain `BLOCKED`.

---

## 3. `AUD-004` Family Deletion Safety Review Enhancement

- **File Changed:** `src/features/settings/actions.ts`
- **Improvement:** Added `removeBucketWithRetry` (1 automatic retry per bucket on transient storage API failure) for `family-documents`, `family-memories`, and `family-chat` cleanup after `delete_family_workspace` RPC commits.
