# Famora S1 — Critical Security & Data Integrity Repair Report

**Tanggal:** 2026-11-24  
**Referensi Audit:** `phase-s0-full-functional-audit.md`  
**Verdict:** `S1_REPAIR_WITH_BLOCKERS`

---

## 1. Bug ID yang Diselesaikan

| Bug ID | Domain | Ringkasan Perbaikan | Status |
|---|---|---|---|
| **BUG-002** | Settings (`privacy_settings`) | Menyelaraskan label UI `settings.privacy.*` (`id` & `en`) agar akurat terhadap kolom DB (`require_mfa_for_vault`, `allow_guest_memories`, `child_kiosk_enabled`) | **Fixed (Unit & Typecheck Verified)** |
| **BUG-003** | Workspace & Layout | Menambahkan validasi keanggotaan `validateFamilySwitchTarget(shellContext.families, familyId)` di `[familyId]/layout.tsx` (`redirect(/onboarding)` / `notFound()`) | **Fixed (Code & Typecheck Verified)** |
| **BUG-056** | Workspace Server | Memfilter `.is("families.deleted_at", null)` pada `getWorkspaceShellContext` | **Fixed (Unit Verified)** |
| **BUG-004** | Family & Members | Menambahkan `.select("id").maybeSingle()` pada 5 action mutasi Members/Invitations agar 0-row/RLS-blocked update mengembalikan `{ ok: false }`, serta `.eq("status", "pending")` pada `resendInvitationAction` | **Fixed (Unit Verified)** |
| **BUG-005** | Dashboard & Tasks | `quickCompleteTaskAction` mendelegasikan penuh ke `toggleTaskStatusAction` (mencatat `task_history.event_type`, spawn recurrence, cek assignee/permission, dan idempotensi); `quickAdd*` & `toggleShoppingItemAction` diberi cek keanggotaan & izin | **Fixed (Unit Verified)** |
| **BUG-006** | Dashboard Finance | Menghitung `monthlySpentCents` dari seluruh transaksi `expense` non-reversed pada bulan kalender berjalan (sesuai `family.timezone`), bukan dari `.limit(5)` | **Fixed (Unit Verified)** |
| **BUG-009** | Tasks | `toggleTaskStatusAction` & `deleteTaskAction` memverifikasi active membership, ownership/assignee/permission (`tasks.manage_all`), idempotensi status, dan affected-row verification | **Fixed (Unit Verified)** |
| **BUG-016** | Documents Storage RLS | Migration baru `0036_fix_storage_rls_policies.sql` menyelaraskan `family-documents` Storage RLS agar mendukung `documents.sensitive_vault` & `documents.standard.manage` pada select/insert/delete | **Fixed (Migration Validated; Live Storage RLS Blocked)** |
| **BUG-017** | Child Dev Storage RLS | Migration baru `0036_fix_storage_rls_policies.sql` menyelaraskan `family-child-attachments` Storage RLS agar mendukung `child_dev.health.view` & `child_dev.growth_milestones.manage` | **Fixed (Migration Validated; Live Storage RLS Blocked)** |
| **BUG-019** | Habits | Menambahkan `requireAuthenticatedUser` di `habits/page.tsx` dan guard `!data.canView` di `FamilyHabitsView` | **Fixed (Code & Typecheck Verified)** |
| **BUG-023** | Noticeboard | `toggleAnnouncementArchiveAction` mewajibkan author atau `admin`/`owner` + `.select("id").maybeSingle()`; UI mengikat tombol ke `ann.canEditOrDelete` & menampilkan error toast | **Fixed (Unit Verified)** |
| **BUG-025** | Notifications | `retryOutboxDispatchAction` meneruskan `expectedRecipientMemberId: actor.id` ke `processPushOutboxItem` untuk mencegah anggota me-retry outbox milik anggota lain | **Fixed (Unit Verified)** |
| **BUG-049** | Notifications Outbox | Memperbarui `notification_outbox.status = "suppressed"` saat `activeDevices.length === 0` agar tidak tersangkut `"pending"` | **Fixed (Code & Typecheck Verified)** |
| **BUG-038** | Shopping | Menegakkan active membership + `hasShoppingManagePermission` + affected-row verification di `createShoppingListAction`, `addShoppingItemAction`, `toggleShoppingCheckAction`, `updateShoppingQuantityAction`, `saveShoppingTemplateAction`, `applyShoppingTemplateAction`; disable tombol template/history saat `!data.canManage` | **Fixed (Unit Verified)** |
| **BUG-040** | Financial Analytics | Menghapus `.limit(300)` pada query `finance_transactions` di `getAnalyticsPageData` agar total & ekspor CSV tidak terpotong | **Fixed (Code & Typecheck Verified)** |
| **BUG-045 (Auth)** | Safety | Menambahkan `requireAuthenticatedUser` di `safety/page.tsx` | **Fixed (Code & Typecheck Verified)** |

---

## 2. Root Cause & Detail Solusi per Kelompok

1. **Authorization & Family Isolation (`BUG-003`, `BUG-004`, `BUG-009`, `BUG-019`, `BUG-023`, `BUG-025`, `BUG-038`, `BUG-045`, `BUG-056`)**:
   - **Root Cause:** Layout workspace merender `AppShell` tanpa mengecek apakah `familyId` URL termasuk dalam keanggotaan aktif user; beberapa server action mengandalkan RLS tanpa guard TypeScript atau mengembalikan `{ ok: true }` saat `.update()`/`.delete()` mengenai 0 baris.
   - **Solusi:** Menambahkan fail-closed check di layout (`redirect(routes.onboarding)` / `notFound()`), memfilter `deleted_at IS NULL`, menegakkan active membership + permission + ownership check pada setiap action terkait, dan memakai `.select("id").maybeSingle()` untuk verifikasi baris terdampak.
2. **Task Data Integrity (`BUG-006` / Prompt `BUG-005`)**:
   - **Root Cause:** `quickCompleteTaskAction` menduplikasi logika secara parsial, menulis ke kolom `task_history.action` yang tidak ada (seharusnya `event_type`), melewati spawn task berulang, dan tidak idempoten.
   - **Solusi:** `quickCompleteTaskAction` kini mendelegasikan langsung ke `toggleTaskStatusAction({ ..., nextStatus: "done" })` yang sudah diperkuat dengan idempotency guard (`existing.status === parsed.data.nextStatus`), pengecekan assignee/permission, `event_type`, dan `revalidatePath` untuk Dashboard & Tasks.
3. **Finance Accuracy (`BUG-005` / Prompt `BUG-006`, `BUG-040`)**:
   - **Root Cause:** `getFamilyDashboardData` menghitung `monthlySpentCents` dari query `.limit(5)` `recentTransactions`; `getAnalyticsPageData` memakai `.limit(300)`.
   - **Solusi:** Memisahkan query agregasi pengeluaran bulanan di Dashboard menggunakan rentang tanggal bulan berjalan sesuai `family.timezone` (`kind = 'expense'`, `is_reversed = false`, integer `amount_cents`) dan menghapus limit 300 di `analytics-server.ts`.
4. **Storage Authorization (`BUG-016`, `BUG-017`)**:
   - **Root Cause:** Policy `storage.objects` di `0023` (`family-documents`) dan `0034` (`family-child-attachments`) tidak selaras dengan izin `documents.sensitive_vault`, `documents.standard.manage` (delete), dan `child_dev.health.view`.
   - **Solusi:** Membuat migration baru `supabase/migrations/0036_fix_storage_rls_policies.sql` tanpa menyentuh migration lama dan tanpa menerapkannya ke production.
5. **Settings Privacy Miswiring (`BUG-002`)**:
   - **Root Cause:** Tiga label terjemahan `settings.privacy.*` di `messages.ts` tidak sesuai dengan kolom boolean `privacy_settings` yang dikontrol (`require_mfa_for_vault`, `allow_guest_memories`, `child_kiosk_enabled`).
   - **Solusi:** Memperbaiki teks label `id` dan `en` agar akurat sesuai field DB.

---

## 3. File yang Diubah & Dibuat

- **Kode Aplikasi & Migrasi:**
  - `src/app/(app)/f/[familyId]/layout.tsx`
  - `src/features/workspace/server.ts`
  - `src/features/members/actions.ts`
  - `src/features/tasks/actions.ts`
  - `src/features/dashboard/actions.ts`
  - `src/features/dashboard/server.ts`
  - `src/features/finance/analytics-server.ts`
  - `src/features/noticeboard/actions.ts`
  - `src/features/noticeboard/components/family-noticeboard-view.tsx`
  - `src/features/notifications/actions.ts`
  - `src/features/notifications/outbox.ts`
  - `src/features/shopping/actions.ts`
  - `src/features/shopping/components/family-shopping-view.tsx`
  - `src/app/(app)/f/[familyId]/habits/page.tsx`
  - `src/features/habits/components/family-habits-view.tsx`
  - `src/app/(app)/f/[familyId]/safety/page.tsx`
  - `src/lib/i18n/messages.ts`
  - `supabase/migrations/0036_fix_storage_rls_policies.sql` *(Migration baru)*
- **Unit & Regression Tests:**
  - `src/features/workspace/__tests__/workspace-navigation.test.ts`
  - `src/features/members/__tests__/members.test.ts`
  - `src/features/tasks/__tests__/tasks.test.ts`
  - `src/features/dashboard/__tests__/dashboard.test.ts`
  - `src/features/notifications/__tests__/s1-auth-regressions.test.ts` *(File test baru)*

---

## 4. Test yang Ditambahkan & Hasil Verifikasi

| Pemeriksaan | Perintah | Status | Bukti & Catatan |
|---|---|---|---|
| **Typecheck** | `npm run typecheck` | **PASS** | Exit code 0; 0 error TypeScript. |
| **ESLint** | `npm run lint` | **PASS** | Exit code 0; 0 error/warning lint. |
| **Migration Validation** | `npm run db:validate` | **PASS** | Validated **36 migrations** (termasuk `0036`), 78 RLS-forced tables, 25 hardened `SECURITY DEFINER` functions, zero unrestricted policies. |
| **Unit & Regression Tests** | `npm test` (`vitest run`) | **PASS** | **34 files, 156 tests passed** (termasuk regresi baru untuk BUG-004, BUG-005, BUG-006, BUG-009, BUG-023, BUG-025, BUG-038, BUG-056 dengan mocked Supabase). |
| **Live PostgreSQL & Storage RLS** | `npm run test:rls` | **BLOCKED** | `TEST_DATABASE_URL` tidak diset; `supabase` CLI dan `psql` tidak terpasang. `0036_fix_storage_rls_policies.sql` belum diuji eksekusinya terhadap PostgreSQL/Storage nyata. |
| **Authenticated E2E Suite** | `npx playwright test` (7 suite auth) | **BLOCKED** | `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` untuk environment test terisolasi belum tersedia. |
| **Production Build** | `npm run build` (sandbox) | **BLOCKED (Sandbox Network)** | Terblokir `ENOTFOUND fonts.googleapis.com` di dalam sandbox. |

---

## 5. Migration Baru, Risiko & Rollback Plan

- **File:** `supabase/migrations/0036_fix_storage_rls_policies.sql`
- **Risiko:**
  - Mengubah policy `storage.objects` pada bucket `family-documents` dan `family-child-attachments`. Pemegang `documents.standard.manage` kini dapat menghapus objek di bucket `family-documents` (dibatasi oleh `famora.has_permission((storage.foldername(name))[1]::uuid, ...)` dan tabel `public.documents` tetap menjaga isolasi ownership/sensitive vault).
  - Belum dieksekusi di PostgreSQL live pada sesi ini (wajib diuji di staging terlebih dahulu sebelum production).
- **Rollback Plan:**
  - Jalankan `DROP POLICY` dan pulihkan definisi policy sebelumnya dari `0023_family_document_vault.sql` (baris 115–137) dan `0034_child_dev_attachments.sql` (baris 64–83) jika ditemukan regresi di staging.

---

## 6. Bug yang Belum Selesai (Backlog S2–S5)

- **High (Membutuhkan alur UI/API lebih luas — ditargetkan ke S2–S4):**
  - `BUG-001`: Onboarding Step 3 invite token delivery.
  - `BUG-007`, `BUG-008`: Calendar edit RSVP preservation & form fields (`description`, `category`, `recurrenceUntil`).
  - `BUG-010`: Task attachments real Storage upload/download (saat ini masih metadata-only stub).
  - `BUG-011`, `BUG-039`, `BUG-043`, `BUG-048`, `BUG-050`: Edit/Delete parity di Chores, Budgets/Bills/Schedules, Household, Polls, Albums.
  - `BUG-012`, `BUG-013`, `BUG-032`, `BUG-033`: Offline sync unification (`Shopping` dual flusher, `readOfflineCache`, `usePwaSync` loop).
  - `BUG-014`, `BUG-015`, `BUG-018`: Stale dropdown state di `Finance` & `Budgets`, serta mismatch tombol "New Profile" `Child Dev` (`child_dev.manage` vs `growth_milestones.manage`).
  - `BUG-020`, `BUG-021`: Chat `adults_group` participant enrollment & signed URL TTL expiry.
  - `BUG-022`, `BUG-047`: AI Assistant `/api/ai/stream`, multi-turn history, & `confirmAiProposedAction` (`create_task`, `create_calendar_event`).
  - `BUG-024`: Notifications Quiet Hours UTC vs local timezone.
  - `BUG-045 (SOS)`: Safety SOS trigger implementation.

---

## 7. Rekomendasi Batch Berikutnya (S2)

1. **Setup Isolated Test Environment (`.env.test` + Staging/Local Supabase):** Agar `npm run test:rls` (memverifikasi migrasi `0001`–`0036`) dan 7 suite Playwright E2E terautentikasi dapat dijalankan secara nyata.
2. **Mulai Batch S2 (Core Flow & State Reliability):** Prioritaskan `BUG-001` (Onboarding invite links), `BUG-014`/`BUG-015`/`BUG-018` (Stale state & ChildDev UI permission), `BUG-007`/`BUG-008` (Calendar), `BUG-020`/`BUG-021` (Chat), dan `BUG-024` (Quiet Hours timezone).
