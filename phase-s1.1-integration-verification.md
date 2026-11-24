# Famora S1.1 — Security & Data Integrity Integration Verification

**Tanggal:** 2026-11-24  
**Referensi:** `phase-s0-full-functional-audit.md`, `phase-s1-security-data-integrity-repair.md`  
**Verdict:** `S1_VERIFIED_WITH_DEBT`

---

## 1. Review Perubahan S1

Seluruh 18 file kode/migrasi dan 5 file unit/regression test yang diubah pada S1 telah direview baris demi baris:

| Area | Hasil Review | Temuan & Penyesuaian pada S1.1 |
|---|---|---|
| **Authorization & Family Isolation** (`layout.tsx`, `workspace/server.ts`, `members/actions.ts`, `tasks/actions.ts`, `noticeboard/actions.ts`, `notifications/actions.ts`, `shopping/actions.ts`, `habits/page.tsx`, `safety/page.tsx`) | Seluruh server action memvalidasi session (`requireAuthenticatedUser`), active membership, permission (`get_my_family_permissions`), serta ownership (author/admin atau `recipient_member_id`). Affected-row check menggunakan `.select("id").maybeSingle()`. | Tidak ditemukan celah regresi pada jalur kode TS. |
| **Task Quick Completion & Recurrence** (`BUG-005`: `quickCompleteTaskAction` -> `toggleTaskStatusAction`) | `quickCompleteTaskAction` mendelegasikan ke `toggleTaskStatusAction({ ..., nextStatus: "done" })`. Idempotency guard (`if (existing.status === parsed.data.nextStatus) return { ok: true }`) mencegah double-spawn dan double-history tanpa menghalangi transisi `todo` -> `done` atau `done` -> `todo`. | Aman; `task_history` menggunakan kolom `event_type` sesuai schema `0014`. Catatan: `tasks` tidak memiliki approval flow terpisah atau reward ledger otomatis (hanya `chore_submissions` di `0015` yang memiliki `pending_approval` dan award points via RPC). |
| **Finance Aggregation** (`BUG-006`, `BUG-040`: `dashboard/server.ts`, `analytics-server.ts`) | `dashboard/server.ts` menghitung `monthlySpentCents` dari seluruh transaksi `expense` non-reversed pada bulan berjalan sesuai `family.timezone`. | **Temuan S1.1:** Pada S1, `.limit(300)` di `analytics-server.ts` dihapus tanpa batas tanggal, sehingga berpotensi memuat dataset tanpa batas ke memori. **Diperbaiki di S1.1:** query dibatasi jendela waktu 400 hari terakhir (`.gte("occurred_on", windowStart)`) dengan safety cap `.limit(5000)`. |

---

## 2. Audit Storage Migration `0036_fix_storage_rls_policies.sql`

- **Perbandingan Policy Lama vs Baru:**
  - `0023_family_document_vault.sql` (`family-documents`) sebelumnya hanya mengecek `documents.standard.manage` untuk SELECT/INSERT dan `documents.sensitive_vault` untuk DELETE.
  - `0034_child_dev_attachments.sql` (`family-child-attachments`) sebelumnya memblokir user `child_dev.health.view`-only pada INSERT/DELETE.
- **Temuan S1.1 pada `0036` (Diperketat):**
  - Pada S1 awal, `0036` mengizinkan `documents.standard.manage OR documents.sensitive_vault` di seluruh bucket `family-documents`, yang berisiko membiarkan pemegang `documents.standard.manage` mengakses folder `vault/` secara langsung via Storage API.
  - **Diperbaiki di S1.1:** `0036_fix_storage_rls_policies.sql` kini memeriksa `(storage.foldername(name))[2] = 'vault'` dan mewajibkan `documents.sensitive_vault` secara ketat untuk tier `vault/`, sementara tier `standard/` mengizinkan `documents.standard.manage OR documents.sensitive_vault`.
- **Keamanan Migration:**
  - Menggunakan `DROP POLICY IF EXISTS` sebelum `CREATE POLICY` di dalam blok `DO $$ ... IF EXISTS (...)`, sehingga idempoten/aman dijalankan di atas kondisi existing `0023`/`0034`.
  - Tidak ada policy `public` atau unrestricted (`npm run db:validate` **PASS** untuk 36 migrasi).
- **SQL Test Cases Baru:**
  - Ditambahkan `supabase/tests/03_storage_rls_0036_test.sql` (8 assertion pgTAP: `anon`, `adult` pada `standard/` vs `vault/`, `owner` pada `vault/`, isolasi lintas-keluarga `Family B` vs `Family A`, dan `child` tanpa izin).

---

## 3. Integration Test Environment & Blocker

Pengecekan lingkungan lokal pada S1.1 mengonfirmasi:
1. **Docker Daemon:** `docker info` gagal (`Cannot connect to the docker API at unix:///var/run/docker.sock` — Docker Desktop tidak berjalan).
2. **CLI & Database Test:** `supabase` CLI dan `psql` tidak terpasang, dan `.env.test` / `TEST_DATABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY` tidak tersedia.
3. **Production Safety:** `.env.local` menunjuk ke Supabase aktif dan **dilarang keras** dipakai untuk destructive testing, `test:rls`, maupun eksekusi migration.

Akibatnya, eksekusi nyata terhadap PostgreSQL / Storage RLS (`npm run test:rls`, `03_storage_rls_0036_test.sql`, dan 7 suite Playwright E2E terautentikasi) berstatus **BLOCKED**.

---

## 4. Ringkasan Status Pengujian

| Kategori Pengujian | Status | Bukti |
|---|---|---|
| `npm run typecheck` | **PASS** | Exit 0 setelah penyesuaian S1.1. |
| `npm run lint` | **PASS** | Exit 0. |
| `npm run db:validate` | **PASS** | Validated **36 migrations**, 78 RLS-forced tables, 25 hardened `SECURITY DEFINER` functions, 0 unrestricted policies. |
| `npm test` (`vitest run`) | **PASS** | **34 files, 156 tests passed** (mocked Supabase client — BUKAN bukti RLS live). |
| Non-mutating Playwright E2E (`smoke-and-pwa`, `mobile-m1`, `modal-focus`, `mobile-m6-pwa`) | **PASS** (dijalankan di S0, tidak ada perubahan UI publik/modal setelahnya) | 29/29 tests passed. |
| Live PostgreSQL & Storage RLS (`test:rls`, `03_storage_rls_0036_test.sql`) | **BLOCKED** | Docker daemon mati; `psql` & `supabase` CLI tidak terpasang; `TEST_DATABASE_URL` kosong. |
| Authenticated Integration E2E (7 suite Playwright: `aud-001`..`003`, `mobile-m2/m4/m5/m7`) | **BLOCKED** | Membutuhkan `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` pada Supabase test terisolasi. |

---

## 5. Rekonsiliasi Bug Inventory (S0 & S1)

Telah diselaraskan di `phase-s0-full-functional-audit.md` dan `phase-s1-security-data-integrity-repair.md`:
- **BUG-005** = Quick Task Completion (`quickCompleteTaskAction` / `task_history.action` vs `event_type` / recurrence).
- **BUG-006** = Finance Aggregation (`monthlySpentCents` hanya dari `.limit(5)` tanpa filter bulan berjalan).

---

## 6. Kesimpulan Kelayakan S1

Secara kode TypeScript, unit regression tests, validasi statis migrasi (`0036`), dan keamanan arsitektur, perbaikan S1 + pengetatan S1.1 (`0036` folder-tier `vault/` check & `analytics-server.ts` 400-day bound) **siap**. Namun karena verifikasi integrasi PostgreSQL/Storage RLS live masih terblokir oleh tidak adanya Docker/local Supabase test DB (`S1_VERIFIED_WITH_DEBT`), eksekusi `npm run test:rls` + `03_storage_rls_0036_test.sql` + 7 suite E2E terautentikasi **wajib menjadi gerbang pertama** saat staging/local Supabase tersedia sebelum melanjutkan ke release.
