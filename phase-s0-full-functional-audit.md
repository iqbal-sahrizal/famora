# Famora S0 — Full Product Functional Audit & Stabilization Plan

**Tanggal Audit:** 2026-11-24  
**Scope:** Audit menyeluruh seluruh modul aplikasi Famora (kode, server actions, database queries, RLS/migrations, UI/komponen, PWA/offline, localization, serta pengujian otomatis yang tersedia tanpa menyentuh database production).  
**Verdict:** `FUNCTIONAL_AUDIT_WITH_BLOCKERS`

---

## 1. Executive Summary

Meskipun seluruh pengecekan statis (`tsc --noEmit`, `eslint .`, `db:validate`), **150 unit test (33 file)**, dan **29 Playwright E2E non-mutasi** (landing, auth shell, design system, mobile overflow, modal focus, PWA manifest/SW) berstatus **PASS**, audit fungsional mendalam pada seluruh kode fitur menemukan **63 bug fungsional** (0 Critical yang terkonfirmasi di kode aplikasi dengan catatan RLS live belum teruji, **22 High**, **28 Medium**, **13 Low**).

### Temuan Utama Mengapa Aplikasi Belum Layak Release
1. **Fitur "Terlihat Ada" Namun Putus atau Stubbed:**
   - **Onboarding Step 3** membuang `rawToken` undangan dan tidak mengirim email maupun menampilkan link undangan, sehingga anggota keluarga yang diundang saat onboarding tidak bisa bergabung.
   - **AI Assistant** tidak memakai endpoint `/api/ai/stream` (endpoint tersebut tidak terhubung dan tidak menyimpan ke DB), tidak mengirim riwayat percakapan multi-turn, dan 2 dari 3 *proposed actions* (`create_task`, `create_calendar_event`) tidak dieksekusi saat dikonfirmasi.
   - **Task Attachments** dan **Noticeboard Attachments** hanya menyimpan metadata/teks nama file tanpa upload atau download file nyata.
   - **Safety SOS Trigger** belum memiliki UI maupun action (hanya permission gate).
   - **Adults-only Chat Channel** hanya memasukkan pembuat channel ke `chat_participants`, sehingga anggota dewasa lain tidak pernah bisa melihat channel tersebut.
2. **Salah Wiring Antara UI & Database / Storage RLS:**
   - **Family Privacy Controls** di Settings salah mengikat label UI ke kolom DB yang berbeda (`AI opt-out` mengubah `require_mfa_for_vault`, `Child isolation` mengubah `allow_guest_memories`, `Audit logging` mengubah `child_kiosk_enabled`).
   - **Notification Channels** di Settings mengikat label `WhatsApp bridge` ke kolom `in_app`.
   - **Dashboard `quickCompleteTaskAction`** menulis ke kolom `task_history.action` yang tidak ada (seharusnya `event_type`) dan melewati alur approval/points/recurrence.
   - **Storage RLS Mismatch** pada `family-documents` dan `family-child-attachments` memblokir user yang sah (`adult` saat delete document, atau pemegang `documents.sensitive_vault` / `child_dev.health.view` saja).
3. **State Stale & UX Gagal Diam-diam:**
   - Banyak dropdown/form (`Finance`, `Budgets`, `Child Dev`, `Safety`) menginisialisasi `useState` hanya saat mount sehingga menjadi stale/kosong setelah `router.refresh()`.
   - Beberapa mutasi (`Members`, `Habits`, `Safety`, `Inventory`, `Noticeboard`) mengabaikan error atau mengembalikan `{ ok: true }` saat 0 baris ter-update oleh RLS.
4. **Ketimpangan CRUD (Edit & Delete Hilang):**
   - Modul **Chores & Rewards**, **Budgets/Bills/Schedules**, **Goals & Debts**, **Household (Home/Inventory/Meals)**, **Child Profiles/Records**, **Polls**, dan **Memory Albums** mayoritas hanya memiliki *Create/List* tanpa *Edit* dan *Delete*.
5. **Bug Timezone, Offline Sync, & Keamanan Sekunder:**
   - **Timezone:** Quiet hours notifikasi membandingkan jam lokal terhadap UTC; Habits, Dashboard Today split, Calendar editor, dan Chat date divider memakai UTC atau timezone browser alih-alih `families.timezone`.
   - **Offline:** `Calendar`, `Tasks`, dan `Shopping` menulis cache offline tetapi **tidak pernah membacanya** saat offline; `Shopping` memiliki dua flusher paralel di mana salah satunya menjatuhkan mutasi `update_quantity`.
   - **Security/Auth:** `[familyId]/layout.tsx` tidak memvalidasi keanggotaan user pada `familyId` di URL; beberapa server action (`Tasks`, `Shopping`, `Noticeboard archive`, `Notifications retry`) melewatkan pengecekan permission/ownership di TypeScript.

### Status Pengujian & Blocker
Pengujian **live database RLS (`npm run test:rls`)**, **7 suite Playwright E2E terautentikasi**, dan **Web Push live** berstatus **BLOCKED** karena tidak tersedia instance Supabase/PostgreSQL test terisolasi (`E2E_SUPABASE_URL`, `TEST_DATABASE_URL`, `supabase` CLI, `psql`), dan `VAPID_PRIVATE_KEY` belum dikonfigurasi. Tidak ada data atau konfigurasi production yang disentuh selama audit ini.

---

## 2. Daftar Seluruh Modul dan Fitur

| No | Modul | Route Utama | Komponen & File Kunci |
|---|---|---|---|
| 1 | **Authentication & Profile** | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`, `/auth/callback` | `src/features/auth/*` |
| 2 | **Onboarding** | `/onboarding` | `src/features/onboarding/*` |
| 3 | **Family & Family Members** | `/f/[familyId]/family`, `/invite/[token]` | `src/features/members/*` |
| 4 | **Workspace, Navigation & Shell** | `/f/[familyId]/layout.tsx`, `/f/[familyId]/more`, `/f/[familyId]/[domain]` | `src/features/workspace/*`, `src/components/layout/app-shell.tsx`, `src/middleware.ts`, `src/config/navigation.ts` |
| 5 | **Dashboard** | `/f/[familyId]` | `src/features/dashboard/*` |
| 6 | **Calendar & Events** | `/f/[familyId]/calendar` | `src/features/calendar/*` |
| 7 | **Tasks** | `/f/[familyId]/tasks` | `src/features/tasks/*` |
| 8 | **Chores & Rewards** | `/f/[familyId]/chores` | `src/features/chores/*` |
| 9 | **Shopping Lists** | `/f/[familyId]/shopping` | `src/features/shopping/*` |
| 10 | **Finance & Transactions** | `/f/[familyId]/finance` | `src/features/finance/actions.ts`, `server.ts`, `family-finance-view.tsx` |
| 11 | **Budgets, Bills & Schedules** | `/f/[familyId]/budgets` | `src/features/finance/budget-actions.ts`, `budget-server.ts`, `family-budgets-bills-view.tsx` |
| 12 | **Financial Analytics, Debts & Goals** | `/f/[familyId]/analytics` | `src/features/finance/analytics-actions.ts`, `analytics-server.ts`, `family-analytics-view.tsx` |
| 13 | **Chat & Attachments** | `/f/[familyId]/chat` | `src/features/chat/*` |
| 14 | **AI Assistant** | `/f/[familyId]/ai`, `/api/ai/stream` | `src/features/ai/*`, `src/app/api/ai/stream/route.ts` |
| 15 | **Notifications & Push** | `/f/[familyId]/notifications` | `src/features/notifications/*` |
| 16 | **Documents Vault** | `/f/[familyId]/documents` | `src/features/documents/*` |
| 17 | **Child Profiles & Development** | `/f/[familyId]/child-dev` | `src/features/child-dev/*` |
| 18 | **Memory Albums** | `/f/[familyId]/memories` | `src/features/memories/*` |
| 19 | **Habits & Streaks** | `/f/[familyId]/habits` | `src/features/habits/*` |
| 20 | **Home Assets, Inventory & Meals** | `/f/[familyId]/home`, `/f/[familyId]/inventory`, `/f/[familyId]/meals` | `src/features/household/*` |
| 21 | **Safety & Emergency** | `/f/[familyId]/safety` | `src/features/safety/*` |
| 22 | **Family Announcements & Polls** | `/f/[familyId]/noticeboard` | `src/features/noticeboard/*` |
| 23 | **Settings & Permissions** | `/f/[familyId]/settings` | `src/features/settings/*` |
| 24 | **PWA, Offline & Shared UI** | `/manifest.webmanifest`, `/sw.js`, `/offline.html`, `/design-system` | `src/lib/pwa/*`, `src/components/pwa/*`, `src/components/ui/*`, `src/lib/i18n/*` |

---

## 3. Functional Coverage Matrix

Keterangan status:
- **OK (Static + Unit)** = Terhubung penuh secara kode & lulus unit test, namun E2E live/DB masih blocked.
- **OK (E2E Verified)** = Terverifikasi berjalan di browser Playwright nyata.
- **Partial / Buggy** = Berjalan sebagian, ada bug fungsional atau celah CRUD/RBAC/state.
- **Broken / Stub** = Putus end-to-end atau hanya placeholder.
- **Blocked** = Membutuhkan environment eksternal (Supabase test DB, VAPID keys, SMTP).

| Modul | Action & Persistence | Edit / Delete | Validasi & Error/Loading | RBAC / RLS Alignment | Mobile & Modal | i18n (`id`/`en`) | Status Aktual |
|---|---|---|---|---|---|---|---|
| **Auth & Profile** | OK (Static + Unit) | N/A (Update profile) | Partial (Logout error silent) | OK (Static) | **OK (E2E Verified)** | Partial (fallback locale) | **Partial / Buggy** |
| **Onboarding** | **Broken** (Step 3 buang token) | N/A | Partial (trap di step 3) | OK (RPC) | OK (Static) | OK (Static) | **Broken (Step 3)** |
| **Family & Members** | Partial (silent 0-row) | Partial (hanya 2 role di UI) | Partial (clipboard no catch) | Partial (resend status guard) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Workspace & Shell** | Partial (no membership check) | N/A | OK | **Buggy** (`[familyId]` layout) | **OK (E2E Verified)** | Partial (2 string) | **Partial / Buggy** |
| **Dashboard** | **Buggy** (spent & history col) | N/A (Quick add/complete) | Partial (offline fail) | **Buggy** (2 action no check) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Calendar & Events** | **Buggy** (edit wipe RSVP) | OK (Create/Edit/Cancel) | Partial (missing 3 inputs) | OK (Static) | OK (Static) | Partial (hardcoded EN) | **Partial / Buggy** |
| **Tasks** | Partial (attach stubbed) | Partial (no edit subtasks) | OK | **Buggy** (toggle/delete no check) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Chores & Rewards** | OK (Static + Unit) | **Missing** (no Edit/Delete) | Partial (missing note/desc) | Partial (redeem no TS check) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Shopping Lists** | Partial (offline conflict) | OK (List & Item CRUD) | OK | Partial (4 action no TS check) | OK (Static) | Partial (3 string EN) | **Partial / Buggy** |
| **Finance & Tx** | Partial (stale `txAccountId`) | OK (Account & Reverse) | OK | OK (Static) | OK (Static) | Partial (hardcoded EN) | **Partial / Buggy** |
| **Budgets & Bills** | Partial (stale `payAccountId`) | **Missing** (no Edit/Delete) | Partial (silent abort pay) | OK (Static) | OK (Static) | Partial (`intlLocale`) | **Partial / Buggy** |
| **Analytics, Goals & Debts** | Partial (cap 300 tx) | **Missing** (no Edit/Delete) | Partial (unused fields) | OK (Static) | OK (Static) | Partial (`intlLocale`) | **Partial / Buggy** |
| **Chat & Attachments** | **Buggy** (`adults_group` & URL TTL) | Partial (adult delete UI) | Partial (read receipt sync) | OK (Static) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **AI Assistant** | **Broken** (`/api/ai/stream` & history) | **Missing** (conv delete/rename) | Partial (orphan msg on err) | Partial (finance msg mismatch) | OK (Static) | OK (Static) | **Broken / Stub** |
| **Noticeboard & Polls** | Partial (attach stubbed) | **Missing** (Poll Edit/Close/Del) | Partial (silent read/archive) | **Buggy** (archive auth) | OK (Static) | Partial (hardcoded EN) | **Partial / Buggy** |
| **Notifications & Push** | **Buggy** (quiet hours UTC & outbox) | OK (Delete notif) | OK | **Buggy** (retry no owner check) | OK (Static) | OK (Static) | **Partial / Buggy** + **Push Blocked** |
| **Documents Vault** | Partial (sharing unused) | Partial (Delete button role) | Partial (sensitivity state) | **Buggy** (Storage RLS mismatch) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Child Development** | Partial (stale `attRecordType`) | **Missing** (no Edit/Delete) | OK | **Buggy** (Storage RLS + perm) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Memory Albums** | Partial (`shared` missing) | **Missing** (Album Edit/Del) | Partial (file reset on switch) | OK (Static) | OK (Static) | Partial (EN & touch target) | **Partial / Buggy** |
| **Habits & Streaks** | Partial (UTC date) | OK (Create/Edit/Archive) | **Buggy** (no busy, silent err) | **Buggy** (no page guard/canView) | OK (Static) | Partial (`"Archive"`) | **Partial / Buggy** |
| **Household (Home/Inv/Meals)** | Partial (meals date & 0 qty) | **Missing** (all 6 entities) | **Buggy** (no busy, silent err) | OK (Static) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Safety & Emergency** | **Stub** (SOS missing) | **Missing** (Protocol Edit/Del) | **Buggy** (no busy, silent err) | Partial (no page auth redirect) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **Settings & Permissions** | **Buggy** (Privacy & WA miswired) | OK (Delete family) | Partial (no channel save btn) | OK (Static + Unit) | OK (Static) | OK (Static) | **Partial / Buggy** |
| **PWA & Offline** | **Buggy** (cache never read) | N/A | Partial (`usePwaSync` loop) | **OK (E2E Verified)** | **OK (E2E Verified)** | **OK (E2E Verified)** | **Partial / Buggy** |

---

## 4. Bug Inventory

### A. Severity: High (22 Bug)

| ID | Modul & Halaman | Langkah Reproduksi | Expected Behavior | Actual Behavior | Root Cause | Dampak Pengguna | Status |
|---|---|---|---|---|---|---|---|
| **BUG-001** | **Onboarding** (`/onboarding`) | Selesaikan Step 1–2, isi email anggota di Step 3, klik "Send & Open Dashboard". | Email undangan terkirim atau link `/invite/<token>` ditampilkan ke user. | Action mengembalikan `{ sentCount }` tanpa mengirim email dan membuang `rawToken`. | `src/features/onboarding/actions.ts:166-177` memanggil `createInvitationToken()` lalu hanya menyimpan `tokenHash`. | Anggota yang diundang saat onboarding tidak pernah menerima link untuk bergabung. | Confirmed |
| **BUG-002** | **Settings** (`/f/[id]/settings`) | Buka Settings -> tab Family -> Family Privacy Controls. | Label toggle sesuai dengan kolom `privacy_settings` yang diubah. | Label AI Opt-out mengubah `require_mfa_for_vault`; Child Isolation mengubah `allow_guest_memories`; Audit Logging mengubah `child_kiosk_enabled`. | `src/features/settings/components/family-settings-view.tsx:481-502` memetakan i18n key ke state yang salah. | Admin mengira mengaktifkan proteksi privasi/AI/audit, padahal mengubah fitur yang sama sekali berbeda. | Confirmed |
| **BUG-003** | **Workspace / Auth** (`/f/[familyId]/*`) | Login, lalu buka `/f/00000000-0000-0000-0000-000000000000` atau `familyId` milik keluarga lain. | Redirect ke `/onboarding` atau `notFound()`. | Halaman tetap merender `AppShell` dengan label `"Space: 00000000"` dan tampilan kosong/error. | `src/app/(app)/f/[familyId]/layout.tsx:16-32` tidak mengecek apakah `familyId` ada di `shellContext.families`. | Kebingungan navigasi & state shell tidak valid saat mengakses workspace tidak sah. | Confirmed |
| **BUG-004** | **Members** (`/f/[id]/family`) | Lakukan resend/revoke invite, update role/status, atau remove member tanpa hak atau pada row yang tidak cocok. | Mengembalikan `{ ok: false, error }` jika 0 baris ter-update. | Mengembalikan `{ ok: true }` dan UI menampilkan toast sukses; `resendInvitationAction` juga bisa menimpa status non-pending. | `src/features/members/actions.ts:125-145, 166-176, 247-315` tidak memakai `.select("id").maybeSingle()` dan lupa `.eq("status", "pending")`. | UI memberi tahu perubahan berhasil padahal ditolak RLS atau tidak mengubah apa pun. | Confirmed |
| **BUG-005** | **Dashboard** (`/f/[id]`) | Klik quick-complete pada task (terutama task berulang) di Dashboard. | Status berubah sesuai alur task, `task_history` tercatat, dan task berulang spawn berikutnya. | Insert `task_history` gagal (kolom salah), dan task berulang tidak spawn instance baru. | `src/features/dashboard/actions.ts:183-200` menulis `{ action: "completed" }` (kolom sebenarnya `event_type`) dan langsung set `status: "done"`. | Riwayat task hilang dan task berulang berhenti berulang jika diselesaikan dari Dashboard. | Confirmed |
| **BUG-006** | **Dashboard** (`/f/[id]`) | Catat >5 transaksi dalam sebulan atau hanya transaksi bulan lalu, lalu cek Budget Ring di Dashboard. | `monthlySpentCents` menjumlahkan seluruh expense bulan kalender berjalan. | Hanya menjumlahkan expense dari 5 transaksi terakhir tanpa filter bulan. | `src/features/dashboard/server.ts:241-248, 314-316` memakai `.limit(5)` tanpa filter tanggal bulan ini. | Ringkasan pengeluaran bulanan di Dashboard tidak akurat. | Confirmed |
| **BUG-007** | **Calendar** (`/f/[id]/calendar`) | Buat event dengan peserta yang sudah RSVP "Going", lalu edit judul/jam event. | RSVP peserta lain tetap tersimpan dan reminder tidak ganda. | Semua RSVP peserta lain di-reset menjadi `pending` dan notifikasi reminder baru ditambahkan lagi. | `src/features/calendar/actions.ts:93-133` menghapus seluruh `calendar_event_participants` dan insert ulang reminder setiap save. | Kehilangan status konfirmasi kehadiran anggota keluarga & spam notifikasi. | Confirmed |
| **BUG-008** | **Calendar** (`/f/[id]/calendar`) | Buka form Create/Edit Event di Calendar. | Tersedia input `description`, `category`, dan `recurrenceUntil`. | Ketiga field tidak ada di form `BottomSheet`; `category` selalu `"family"` dan `recurrenceUntil` selalu `null`. | `src/features/calendar/components/family-calendar-view.tsx:658-810` belum merender kontrol inputnya. | Pengguna tidak bisa mengisi catatan, kategori, atau tanggal berakhirnya event berulang. | Confirmed |
| **BUG-009** | **Tasks** (`/f/[id]/tasks`) | Panggil `toggleTaskStatusAction` atau `deleteTaskAction` sebagai anggota tanpa hak `tasks.manage_all`. | Server action memverifikasi keanggotaan & izin `tasks.manage_all` / assignee. | Hanya memanggil `requireAuthenticatedUser()` tanpa cek role/izin di TS. | `src/features/tasks/actions.ts:184-255, 367-390` mengandalkan RLS sepenuhnya tanpa guard di action. | Berisiko inkonsistensi otorisasi antara UI dan server action. | Confirmed |
| **BUG-010** | **Tasks** (`/f/[id]/tasks`) | Pilih file di detail task untuk melampirkan attachment. | File diunggah ke Supabase Storage dan bisa di-preview/download. | Hanya baris metadata dengan `storage_path` fiktif yang disimpan; file fisik tidak pernah diunggah atau bisa diunduh. | `src/features/tasks/components/family-tasks-view.tsx:271-288` & `actions.ts:329-365` hanya mengirim nama/ukuran file. | User mengira lampiran tersimpan padahal file tidak pernah ada di server. | Confirmed |
| **BUG-011** | **Chores & Rewards** (`/f/[id]/chores`) | Buat chore template, reward, atau family challenge, lalu coba ubah atau hapus. | Tersedia tombol/aksi Edit dan Delete/Archive. | Tidak ada aksi maupun UI Edit/Delete untuk ketiganya. | `src/features/chores/actions.ts` & `chores-rewards-view.tsx` hanya mengimplementasikan Create & List. | Data yang salah ketik atau poin yang keliru tidak dapat diperbaiki atau dihapus. | Confirmed |
| **BUG-012** | **Shopping** (`/f/[id]/shopping`) | Ubah kuantitas item (`update_quantity`) saat offline, lalu kembali online. | Mutasi tersinkron ke server oleh satu flusher. | `FamilyShoppingView` menjalankan flusher kedua yang tidak memiliki case `update_quantity` dan mengembalikan `true` (menghapus item dari antrean tanpa sync). | `src/features/shopping/components/family-shopping-view.tsx:140-173` duplikat dengan `use-pwa-sync.ts`. | Perubahan kuantitas offline bisa hilang permanen tanpa error; metadata `add_item` juga ter-overwrite default. | Confirmed |
| **BUG-013** | **Shopping** (`/f/[id]/shopping`) | Tambah item atau tekan tombol `+/-` kuantitas saat offline. | Item muncul secara optimis di daftar dan `+/-` masuk antrean offline. | Quick add tidak menambah item ke UI state saat offline; tombol `+/-` memanggil server action langsung dan gagal. | `src/features/shopping/components/family-shopping-view.tsx:133-137, 259-285` tidak menangani mode offline di `handleStepQuantity` & optimistic add. | Pengalaman offline shopping membingungkan dan sebagian aksi gagal. | Confirmed |
| **BUG-014** | **Finance** (`/f/[id]/finance`) | Buka Finance saat belum punya akun, buat akun baru, lalu langsung buka "Record Transaction" dan submit tanpa mengubah dropdown akun. | Akun pertama yang baru dibuat otomatis terpilih dan terkirim. | Dropdown terlihat memilih akun pertama, tetapi state `txAccountId` tetap `""` sehingga validasi UUID gagal. | `src/features/finance/components/family-finance-view.tsx:103-116` menginisialisasi `useState` sekali saat mount tanpa sync effect. | User tidak bisa mencatat transaksi pertama setelah membuat akun sebelum refresh manual. | Confirmed |
| **BUG-015** | **Budgets & Bills** (`/f/[id]/budgets`) | Buka Budgets saat belum ada akun (atau akun pertama diarsipkan), tambah akun di Finance/refresh, lalu klik "Mark Paid" -> "Confirm Pay". | Pembayaran tagihan diproses dengan akun yang tampil di dropdown. | Klik "Confirm Pay" tidak melakukan apa-apa (silent return) tanpa pesan error. | `src/features/finance/components/family-budgets-bills-view.tsx:55, 146-147` mengecek `if (!payTarget || !payAccountId) return;` dengan state stale. | Tombol bayar tagihan tampak mati total. | Confirmed |
| **BUG-016** | **Documents Vault** (`/f/[id]/documents`) | Login sebagai `adult` (punya `documents.standard.manage` tanpa `documents.sensitive_vault`) dan hapus dokumen, atau user dengan `documents.sensitive_vault` saja mencoba upload/download. | Storage upload/download/delete selaras dengan izin tabel `documents`. | Storage RLS `0023` mewajibkan `documents.standard.manage` untuk select/insert dan `documents.sensitive_vault` untuk delete, sehingga storage gagal diam-diam. | `supabase/migrations/0023_family_document_vault.sql:116-137` tidak selaras dengan `src/features/documents/actions.ts:66-73, 251`. | File tertinggal sebagai orphan di Storage bucket saat `adult` menghapus dokumen, atau upload/download ditolak. | Confirmed |
| **BUG-017** | **Child Development** (`/f/[id]/child-dev`) | Login sebagai user dengan `child_dev.health.view` (tanpa `growth_milestones.manage`), lalu upload/hapus lampiran kesehatan, atau klik tab Attachment tanpa mengganti dropdown. | Upload lampiran kesehatan berhasil dan dropdown selaras dengan state. | `attRecordType` tetap `"education"` secara state meski dropdown hanya menampilkan `"health"`, dan Storage RLS `0034` memblokir user `health.view`-only. | `src/features/child-dev/components/child-development-view.tsx:68` + `supabase/migrations/0034_child_dev_attachments.sql:75, 82`. | User kesehatan anak tidak bisa mengunggah/menghapus lampiran rekam medis. | Confirmed |
| **BUG-018** | **Child Development** (`/f/[id]/child-dev`) | User dengan `child_dev.growth_milestones.manage` (tanpa `child_dev.manage`) menekan tombol "New Profile". | Tombol hanya muncul jika punya izin `child_dev.manage`, atau server menerima izin yang sama. | Tombol muncul, namun submit gagal karena `createChildProfileAction` mensyaratkan `child_dev.manage`; selain itu tidak ada Edit/Delete profil/rekam anak. | `src/features/child-dev/actions.ts:44` vs `child-development-view.tsx:328`. | User mendapat error permission saat submit form yang tombolnya tersedia. | Confirmed |
| **BUG-019** | **Habits** (`/f/[id]/habits`) | Buka `/f/[familyId]/habits` tanpa login atau sebagai non-member. | Redirect ke `/login` atau tampilkan pesan akses ditolak. | Halaman tetap merender UI penuh dengan tombol "New Habit" karena `!data.canView` tidak dicek. | `src/app/(app)/f/[familyId]/habits/page.tsx:4-12` & `family-habits-view.tsx:57-90`. | Halaman terproteksi tampil kosong dengan form yang pasti gagal saat disubmit. | Confirmed |
| **BUG-020** | **Chat** (`/f/[id]/chat`) | Buat channel baru dengan opsi `Adults-only` aktif. | Seluruh anggota dewasa di keluarga dapat melihat dan ikut chat di channel tersebut. | Hanya pembuat channel yang dimasukkan ke `chat_participants`; anggota dewasa lain tidak pernah melihat channel tersebut. | `src/features/chat/actions.ts:701-708` menulis `adultsOnly ? [actor] : members`. | Fitur channel khusus orang tua/dewasa tidak berfungsi sama sekali. | Confirmed |
| **BUG-021** | **Chat** (`/f/[id]/chat`) | Buka lampiran chat, tunggu >2 menit (120 detik), lalu klik lampiran yang sama lagi. | Mendapatkan signed URL baru jika URL lama kedaluwarsa. | Mengakses URL lama dari state `signedUrls` yang sudah expired (`403/400` dari Supabase Storage). | `src/features/chat/components/family-chat-view.tsx:738-755` menyimpan URL di state tanpa cek TTL 120s. | Lampiran chat gagal dibuka setelah 2 menit di sesi yang sama. | Confirmed |
| **BUG-022** | **AI Assistant** (`/f/[id]/ai`, `/api/ai/stream`) | Kirim prompt lanjutan (multi-turn) di percakapan AI, atau periksa pemakaian `/api/ai/stream`. | AI mengingat pesan sebelumnya dan streaming nyata dari `/api/ai/stream`. | UI memanggil blocking server action sambil menampilkan badge `"Streaming..."`; AI tidak menerima riwayat pesan sebelumnya; `/api/ai/stream` tidak dipakai & tidak menyimpan ke DB. | `src/features/ai/actions.ts:130-134`, `provider.ts:200-236`, `src/app/api/ai/stream/route.ts:107-146`. | AI tidak memiliki konteks percakapan berlanjut dan fitur streaming tidak nyata. | Confirmed |
| **BUG-023** | **Noticeboard** (`/f/[id]/noticeboard`) | Login sebagai anggota dengan `announcements.publish` (bukan pembuat & bukan admin), lalu klik Archive/Restore pada pengumuman milik admin/anggota lain. | Hanya pembuat pengumuman atau admin/owner yang dapat mengarsipkan/memulihkan. | Action & UI mengizinkan siapa saja yang punya `announcements.publish` untuk mengarsipkan pengumuman orang lain. | `src/features/noticeboard/actions.ts:206-231` & `family-noticeboard-view.tsx:358-377`. | Anggota biasa dapat menyembunyikan pengumuman penting milik admin/owner. | Confirmed |
| **BUG-024** | **Notifications** (`/f/[id]/notifications`) | Atur Quiet Hours misal `22:00 - 07:00` pada zona waktu `Asia/Jakarta` (UTC+7). | Notifikasi ditahan pada pukul 22:00–07:00 waktu lokal. | Evaluasi memakai `getUTCHours()`/`getUTCMinutes()`, sehingga notifikasi justru ditahan pukul 05:00–14:00 WIB. | `src/features/notifications/logic.ts:47-64` membandingkan `HH:MM` lokal dengan jam UTC. | Fitur Quiet Hours bekerja pada jam yang salah di luar zona waktu UTC. | Confirmed |
| **BUG-025** | **Notifications** (`/f/[id]/notifications`) | Panggil `retryOutboxDispatchAction` dengan `outboxId` milik anggota keluarga lain di keluarga yang sama. | Ditolak jika bukan penerima (`recipient_member_id !== actor.id`). | Hanya mengecek keanggotaan di `familyId`, tidak mengecek kepemilikan penerima pada outbox row. | `src/features/notifications/actions.ts:219-234` & `outbox.ts:116-123`. | Anggota dapat memicu ulang pengiriman push milik anggota lain. | Confirmed |

*(Catatan: BUG-001 s.d. BUG-025 adalah 25 temuan High; 3 temuan High di atas termasuk celah otorisasi/privacy/onboarding yang paling berdampak langsung.)*

### B. Severity: Medium (28 Bug)

| ID | Modul & Halaman | Ringkasan Bug | File Terkait | Root Cause | Dampak Pengguna | Status |
|---|---|---|---|---|---|---|
| **BUG-026** | **Settings** (`/f/[id]/settings`) | Toggle "WhatsApp bridge" mengubah `in_app`, dan kartu Notification Channels tidak punya tombol Save sendiri. | `family-settings-view.tsx:627-672` | Binding `inAppEnabled` pada label WhatsApp; save hanya ada di kartu kiri. | Pengaturan notifikasi membingungkan dan perubahan di kartu kanan mudah tidak tersimpan. | Confirmed |
| **BUG-027** | **Settings** (`/f/[id]/settings`) | `savePersonalPrefs` mengubah tema lokal (`setTheme`) sebelum server save sukses. | `family-settings-view.tsx:183-202` | `setTheme` dipanggil sebelum `await updatePersonalPreferencesAction`. | Tema berubah di layar meski penyimpanan ke server gagal. | Confirmed |
| **BUG-028** | **Members** (`/f/[id]/family`) | Dropdown ubah role hanya menampilkan `admin` dan `adult` (menghilangkan `teen`, `child`, `extended`, `caregiver`). | `members-directory-view.tsx:174-205` | Menu role di-hardcode hanya 2 opsi meski schema mendukung 6 role. | Admin tidak bisa mengubah role ke `teen`, `child`, `extended`, atau `caregiver`. | Confirmed |
| **BUG-029** | **Members** (`/f/[id]/family`) | Opsi "Transfer ownership" muncul pada member yang berstatus `suspended` dan gagal saat diklik. | `members-directory-view.tsx:234` | Kondisi UI tidak mengecek `member.status === "active"`. | Owner mendapat error RPC saat mencoba transfer ke member non-aktif. | Confirmed |
| **BUG-030** | **Workspace** (`/f/[id]/dashboard`) | Navigasi ke `/f/[familyId]/dashboard` menampilkan `DomainShellView` placeholder, bukan halaman Dashboard. | `src/app/(app)/f/[familyId]/[domain]/page.tsx:10-16` | `DOMAIN_NAV_ITEMS` memuat `id: "dashboard"` yang tertangkap dynamic route `[domain]`. | User yang mengakses URL `/dashboard` melihat halaman placeholder. | Confirmed |
| **BUG-031** | **Auth** (`/account`) | `logoutAction()` yang gagal tidak menampilkan toast error. | `account-settings-view.tsx:56-65` | Hanya mengecek `if (result.ok)` tanpa cabang `else`. | Tombol Sign Out tampak tidak merespons saat error. | Confirmed |
| **BUG-032** | **PWA Sync** (Global) | `usePwaSync` memicu ulang `runFlush` terus-menerus saat `failedCount`/`conflictCount` berubah; `resolveDomainConflict` tidak pernah dipanggil. | `src/hooks/use-pwa-sync.ts:51-98`, `src/lib/pwa/domain-sync.ts:16-200` | Dependency `useCallback` pada `summary` & tidak ada timestamp conflict check. | Loop flush berulang saat ada item gagal dan konflik offline menimpa data server. | Confirmed |
| **BUG-033** | **Offline Cache** (`Dashboard`, `Calendar`, `Tasks`, `Shopping`) | Keempat modul menulis `writeOfflineCache` tetapi tidak pernah memanggil `readOfflineCache` saat offline; quick action Dashboard gagal saat offline. | `family-dashboard-view.tsx`, `family-calendar-view.tsx`, `family-tasks-view.tsx`, `family-shopping-view.tsx` | Reader cache offline dan handler offline belum terpasang di view/action. | Data offline yang sudah disimpan tidak tampil saat reload offline, dan aksi cepat gagal. | Confirmed |
| **BUG-034** | **Dashboard** (`/f/[id]`) | Pembagian Today vs Upcoming events memakai timezone server Node (UTC); quick-add tidak cek izin server & tidak revalidate `/tasks` / `/shopping`. | `src/features/dashboard/server.ts:183-188`, `actions.ts:26-109` | `setHours` lokal server dan `revalidatePath` hanya ke dashboard. | Event malam/pagi salah kategori dan halaman `/tasks` atau `/shopping` menampilkan cache lama. | Confirmed |
| **BUG-035** | **Calendar** (`/f/[id]/calendar`) | Editor event mengonversi tanggal/jam menggunakan timezone browser, bukan `data.familyTimezone`. | `family-calendar-view.tsx:184-216` | `new Date(...)` & `getHours()` memakai timezone perangkat. | Jam event bergeser jika user berada di timezone berbeda dari keluarga. | Confirmed |
| **BUG-036** | **Tasks** (`/f/[id]/tasks`) | Subtask tidak bisa ditambah/diedit pada task yang sudah ada; spawn task berulang membuang multi-assignee & subtask; edit dengan `syncToCalendar` membuat event kalender ganda. | `family-tasks-view.tsx:725`, `src/features/tasks/actions.ts:66-83, 151, 221-237` | Guard `!editingId`, insert event tanpa cek `calendar_event_id`, dan spawn hanya copy 1 assignee. | Kehilangan subtask/assignee pada task berulang dan duplikasi event di kalender. | Confirmed |
| **BUG-037** | **Chores** (`/f/[id]/chores`) | Form Chore/Reward/Review menghilangkan input `category`, `description`, dan `note` (di-hardcode kosong/default). | `chores-rewards-view.tsx:76, 92, 119, 141` | State/nilai di-hardcode saat submit. | Deskripsi hadiah dan catatan penolakan/penyelesaian chore tidak bisa diisi. | Confirmed |
| **BUG-038** | **Shopping** (`/f/[id]/shopping`) | `saveShoppingTemplateAction` tidak punya UI; tombol Apply Template & Frequently Bought mengabaikan `!canManage`; 4 action lupa cek izin di TS. | `family-shopping-view.tsx:707-753`, `src/features/shopping/actions.ts` | Tombol tidak di-disable untuk non-manager; fitur simpan template belum ada UI. | User non-manager melihat tombol aktif lalu gagal; template baru tidak bisa dibuat dari UI. | Confirmed |
| **BUG-039** | **Budgets & Bills** (`/f/[id]/budgets`) | Tidak ada fitur Edit & Delete untuk Budgets, Household Bills, dan Recurring Schedules. | `src/features/finance/budget-actions.ts`, `family-budgets-bills-view.tsx` | Hanya Create/Pay/Run yang diimplementasikan. | Kesalahan nominal budget atau tagihan tidak dapat diubah/dihapus. | Confirmed |
| **BUG-040** | **Financial Analytics** (`/f/[id]/analytics`) | Query transaksi dibatasi `.limit(300)` sehingga laporan & ekspor CSV terpotong diam-diam pada keluarga dengan >300 transaksi. | `src/features/finance/analytics-server.ts:69` | Hard limit 300 baris pada query `finance_transactions`. | Total pemasukan/pengeluaran, grafik, dan CSV tidak akurat untuk riwayat panjang. | Confirmed |
| **BUG-041** | **Documents Vault** (`/f/[id]/documents`) | `sensitivity` default ke `"standard"` meski user hanya punya akses sensitive vault; preview dialog menampilkan tombol Delete tanpa cek kepemilikan & tanpa `busy` state; fitur `shared_with_member_ids` tidak ada di UI. | `family-vault-view.tsx:80, 353-420`, `documents/server.ts` | State awal & opsi `<Select>` tidak menyesuaikan izin user. | Upload gagal permission, user tanpa hak hapus melihat tombol Delete, dan sharing dokumen tidak terpakai. | Confirmed |
| **BUG-042** | **Habits** (`/f/[id]/habits`) | Pencatatan tanggal habit memakai UTC (`toISOString().slice(0,10)`) alih-alih `families.timezone`; Create tidak punya `busy` guard; Archive mengabaikan error & tanpa konfirmasi. | `habits/server.ts:56`, `actions.ts:187`, `family-habits-view.tsx:118-141, 279-288` | Penggunaan UTC & ketiadaan state loading/error handling. | Check-in malam/pagi tercatat di hari yang salah dan rawan double-submit. | Confirmed |
| **BUG-043** | **Household (Home/Inv/Meals)** (`/f/[id]/home`, `/inventory`, `/meals`) | Tidak ada Edit & Delete pada semua 6 entitas Household; `meal_plans.is_completed` tidak bisa di-toggle; `completeMaintenanceTaskAction` tidak memperbarui event kalender tertaut. | `src/features/household/actions.ts`, `home-view.tsx`, `inventory-view.tsx`, `meals-view.tsx` | Belum ada action/UI update & delete di modul Household. | User tidak bisa mengedit/menghapus aset, jadwal servis, penyedia jasa, stok, resep, atau rencana makan. | Confirmed |
| **BUG-044** | **Household (Inventory & Meals)** | Inventory mengubah nilai `0` menjadi `1` (`Number(qty) || 1`) dan tombol `+/-` abaikan error; Meals mengizinkan plan kosong dan "Send to Shopping" menarik semua rencana makan historis tanpa filter tanggal. | `inventory-view.tsx:65, 189-222`, `meals-view.tsx:58-72, 231-233`, `household/server.ts:60-64` | Operator `|| 1` dan query `meal_plans` tanpa rentang tanggal. | Stok minimum `0` tidak bisa diset dan daftar belanja dibanjiri bahan makanan minggu-minggu lalu. | Confirmed |
| **BUG-045** | **Safety** (`/f/[id]/safety`) | Semua form Safety tidak punya loading/busy guard; Delete Contact mengabaikan error & tanpa konfirmasi; halaman tidak redirect ke login; fitur SOS Trigger belum ada. | `family-safety-view.tsx:91-162, 293-347`, `safety/page.tsx:4-12` | Tidak ada state `busy`, tidak ada `requireAuthenticatedUser`, dan SOS belum dibuat. | Rawan double-submit, error hapus kontak tak terlihat, dan tombol SOS darurat tidak tersedia. | Confirmed |
| **BUG-046** | **Chat** (`/f/[id]/chat`) | Membuka percakapan belum menandai pesan terbaca jika tidak perlu scroll; event `UPDATE` realtime menimpa `last_read_message_id` dengan pesan lama; reply realtime tanpa `replyPreview`; preview/unread rusak di atas 200 pesan global; UI sembunyikan tombol hapus untuk moderator dewasa. | `family-chat-view.tsx:318-446, 1238-1260`, `chat/server.ts:280-285` | Early return pada load pertama, listener realtime tidak membedakan INSERT/UPDATE, dan limit 200 global. | Badge unread nyangkut, preview balasan kosong hingga refresh, dan moderasi pesan oleh dewasa tidak tersedia di UI. | Confirmed |
| **BUG-047** | **AI Assistant** (`/f/[id]/ai`) | Pesan user tersimpan permanen di DB meski generasi AI gagal (muncul lagi setelah refresh); `confirmAiProposedAction` hanya mengeksekusi `create_shopping_items` (abaikan `create_task` & `create_calendar_event`); tidak ada Rename/Delete percakapan. | `src/features/ai/actions.ts:113-135, 239-260` | Insert pesan user sebelum call AI dan `switch/if` proposed action tidak lengkap. | Pesan yatim di riwayat chat AI dan konfirmasi saran tugas/jadwal tidak membuat data apa pun. | Confirmed |
| **BUG-048** | **Noticeboard** (`/f/[id]/noticeboard`) | Tidak ada Edit/Close/Delete untuk Poll; lampiran pengumuman hanya berupa input teks statis tanpa upload/download file. | `noticeboard/actions.ts:95-151`, `family-noticeboard-view.tsx:303-311, 386-486` | Fitur poll management & storage upload belum diimplementasikan. | Voting tidak dapat ditutup/diedit/dihapus dan lampiran pengumuman tidak bisa diunduh. | Confirmed |
| **BUG-049** | **Notifications** (`/f/[id]/notifications`) | `processPushOutboxItem` membiarkan `notification_outbox.status` tetap `"pending"` saat user tidak punya perangkat aktif. | `src/features/notifications/outbox.ts:216-222` | Hanya memperbarui `notifications.push_status = "skipped"`, lupa update `notification_outbox`. | Baris outbox menumpuk berstatus `pending` selamanya. | Confirmed |
| **BUG-050** | **Memories** (`/f/[id]/memories`) | Visibilitas `"shared"` tidak bisa dipilih saat membuat/mengedit memori atau membuat album; non-manager tidak bisa membuat album pribadi di UI; Edit/Delete album tidak ada; jumlah item & cover album salah di atas 120 memori; ganti `mediaType` tidak mereset `selectedFile`. | `family-memories-view.tsx:423-432, 865-878, 953-1031`, `memories/server.ts:88-97` | Opsi UI dibatasi, query dibatasi 120 item, dan handler tab tidak reset file. | Fitur berbagi album/memori terbatas dan upload video bisa gagal karena file foto masih tersimpan di state. | Confirmed |
| **BUG-051** | **Household (Home)** (`/f/[id]/home`) | Form Home Assets, Maintenance Tasks, dan Service Providers tidak menampilkan field `assetId`, `providerId`, `email`, dan `purchasedOn` yang sudah ada di schema. | `src/features/household/components/home-view.tsx:218-253` | Nilai di-hardcode `null`/`""` saat submit. | Tugas perawatan tidak bisa ditautkan ke aset rumah atau penyedia jasa tertentu. | Confirmed |
| **BUG-052** | **Finance** (`/f/[id]/finance`) | Form Create Account meniadakan input `monthlyBudget` dan selalu mengirim `"0.00"`. | `src/features/finance/components/family-finance-view.tsx` | Field tidak dirender di modal Create Account. | Budget bulanan per akun tidak bisa diisi saat pembuatan akun. | Confirmed |
| **BUG-053** | **Safety** (`/f/[id]/safety`) | `selectedViewerIds` hanya diinisialisasi sekali saat mount. | `family-safety-view.tsx:72-77` | `useState` tanpa sinkronisasi saat `data.members` berubah. | Daftar pemirsa check-in lokasi bisa stale setelah anggota baru bergabung. | Confirmed |

### C. Severity: Low (10 Bug)

| ID | Modul & Halaman | Ringkasan Bug | File Terkait | Status |
|---|---|---|---|---|
| **BUG-054** | **UI Primitives** (`DatePicker`) | `viewMonth` tidak sinkron saat `value` berubah dari luar; `Invalid Date` merender `NaN`; popover dapat terpotong di dalam modal `overflow-y-auto`. | `src/components/ui/date-picker.tsx:25-27, 43, 66` | Confirmed |
| **BUG-055** | **Members** (`/f/[id]/family`) | `handleCopyLink` memanggil `navigator.clipboard.writeText` tanpa `try/catch`. | `members-directory-view.tsx:104-107` | Confirmed |
| **BUG-056** | **Workspace** (Global) | `getWorkspaceShellContext` tidak memfilter `families.deleted_at IS NULL`. | `src/features/workspace/server.ts:41-45` | Confirmed |
| **BUG-057** | **Onboarding** (`/onboarding`) | Jika `incompleteFamily` terdeteksi, user terkunci di Step 3 tanpa tombol kembali ke `choice` / mulai ulang. | `onboarding-wizard.tsx:52-54, 461-553` | Confirmed |
| **BUG-058** | **Auth** (`/account`) | Fallback locale profil di server/trigger (`en-US`) tidak konsisten dengan halaman account/settings (`id-ID`/`id`). | `auth/server.ts:78`, `0008_auth_profile_trigger.sql:23` | Confirmed |
| **BUG-059** | **Finance / Budgets / Analytics** | Beberapa panggilan `formatNumericCurrency` tidak meneruskan `toIntlLocale(locale)`. | `family-finance-view.tsx:413, 588`, `family-budgets-bills-view.tsx`, `family-analytics-view.tsx` | Confirmed |
| **BUG-060** | **Analytics** (`/f/[id]/analytics`) | Field `targetDate`, `dueOn`, dan `notes` pada Goals & Debts di-hardcode `null`/`""` dan tidak ada Edit/Delete. | `family-analytics-view.tsx:143-204` | Confirmed |
| **BUG-061** | **Chat / Notifications / AI** | Chat date divider pakai tanggal UTC; `unreadCount` notifikasi dibatasi 80 item; pesan error izin finance AI menyebut `finance.family.view` padahal `policy.ts` cek `finance.transactions.manage`; mode OpenAI menempelkan shopping draft dari regex hardcoded. | `family-chat-view.tsx:1054`, `notifications/server.ts:58`, `ai/provider.ts:87, 121` | Confirmed |
| **BUG-062** | **Memories & Inventory** | Checkbox di `family-memories-view.tsx` (baris 966, 1065, 1137) dan tombol `+/-` `h-8 w-8` di `inventory-view.tsx` lebih kecil dari standar target sentuh mobile `44px` (`min-h-11`). | `family-memories-view.tsx`, `inventory-view.tsx` | Confirmed |
| **BUG-063** | **Localization (Global)** | Masih terdapat string hardcoded berbahasa Inggris (tidak memakai `t()`) pada `password-field.tsx`, `app-shell.tsx` (`Skip to content`), `family-calendar-view.tsx`, `family-shopping-view.tsx`, `family-finance-view.tsx`, `family-noticeboard-view.tsx`, `family-habits-view.tsx`, `family-memories-view.tsx`. | Berbagai file komponen fitur | Confirmed |

---

## 5. Bukti Pengujian

Seluruh pengujian di bawah dijalankan langsung pada sesi audit ini tanpa memodifikasi database production:

| Jenis Pengujian | Perintah | Hasil Aktual | Cakupan & Catatan |
|---|---|---|---|
| **TypeScript Check** | `npm run typecheck` (`tsc --noEmit`) | **PASS** (exit code 0) | Seluruh codebase TypeScript valid secara tipe. |
| **ESLint** | `npm run lint` (`eslint .`) | **PASS** (exit code 0) | Tidak ada error lint. |
| **Migration & Security Static Check** | `npm run db:validate` | **PASS** (exit code 0) | Tervalidasi 35 migrasi, 78 tabel dengan force-RLS, 25 fungsi `SECURITY DEFINER` hardened, proteksi kolom `pin_hash`, 0 policy unrestricted, 0 referensi service-role di client. |
| **Unit Tests (Vitest)** | `npm test` (`vitest run`) | **PASS** — **33 file, 150 tests passed** | Pengujian logic, validasi Zod, i18n, RFC 8291 crypto, dan action dengan **mocked Supabase client**. Tidak menguji DB nyata atau UI DOM end-to-end. |
| **Playwright E2E (Non-Mutasi)** | `npx playwright test e2e/smoke-and-pwa.spec.ts e2e/mobile-m1.spec.ts e2e/modal-focus.spec.ts` | **PASS** — **20/20 tests passed** (46.4s) | Verifikasi browser Chrome nyata untuk `/`, `/login`, `/signup`, `/design-system`, redirect `/f/[id]` -> `/login`, `/api/health`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, IndexedDB `famora-pwa-db`, i18n toggle `id`/`en`, 0 horizontal overflow (320px–1280px), dan focus/scroll-lock pada `Dialog` & `BottomSheet`. |
| **Playwright E2E (PWA & Offline Shell)** | `npx playwright test e2e/mobile-m6-pwa.spec.ts` | **PASS** — **9/9 tests passed** (10.4s) | Verifikasi asset icon PWA, caching SW hanya untuk shell publik, responsivitas halaman offline, dan isolasi data saat offline. |
| **Production Build (`next build`)** | `npm run build` (di dalam sandbox) | **FAIL** (exit code 1) | Gagal karena sandbox tidak memiliki akses jaringan untuk `next/font` mengambil `Inter` & `Plus Jakarta Sans` dari `fonts.googleapis.com` (`ENOTFOUND`). |
| **Playwright E2E (Authenticated & Mutasi)** | 7 file: `aud-001`, `aud-002`, `aud-003`, `mobile-m2-dashboard`, `mobile-m4-core`, `mobile-m5-comms`, `mobile-m7-qa` | **BLOCKED / SKIPPED** | Membutuhkan `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` pada environment Supabase test terisolasi. |
| **Live PostgreSQL RLS Tests** | `npm run test:rls` | **BLOCKED** (exit code 2) | `TEST_DATABASE_URL` tidak diset; `supabase` CLI dan `psql` tidak terpasang di host ini. |

---

## 6. Root Cause yang Diketahui (Pola Sistemik)

1. **Pola `useState(initialProp)` Tanpa Sinkronisasi:** Komponen view menyimpan state awal dari props SSR saat mount (`txAccountId`, `payAccountId`, `attRecordType`, `selectedViewerIds`, `DatePicker.viewMonth`). Ketika mutasi memanggil `router.refresh()` dan props berubah, state client tidak ikut diperbarui.
2. **Ketidaksinkronan Kontrak UI vs Server Action vs SQL Migration:**
   - UI merender opsi/label yang tidak cocok dengan kolom DB (`Settings Privacy`, `WhatsApp -> in_app`, `Dashboard task_history.action`).
   - Storage RLS di SQL (`0023`, `0034`) lebih ketat daripada pengecekan permission di TypeScript server action.
3. **Asimetri Implementasi CRUD (Create-Heavy):** Hampir semua modul fase 2–3 dibangun cepat dengan Create & List, tetapi Edit & Delete tertinggal (`Chores`, `Budgets/Bills/Schedules`, `Goals/Debts`, `Household`, `Child Dev`, `Polls`, `Memory Albums`).
4. **Penanganan Timezone Berbasis UTC/Browser:** Server memakai `.toISOString().slice(0, 10)` atau `getUTCHours()`, sedangkan form client memakai `new Date()` lokal browser—keduanya tidak mengacu ke `families.timezone`.
5. **Integrasi Offline & Streaming yang Setengah Jalan:** Infrastruktur IndexedDB (`sync-engine.ts`) dan SSE (`/api/ai/stream`) sudah dibuat secara terpisah, namun belum disambungkan secara konsisten ke komponen UI (cache tidak dibaca, flusher ganda di Shopping, AI tetap memakai server action blocking).
6. **Mutasi Mengabaikan Error / 0-Row RLS:** Beberapa action Supabase `.update()` tidak memakai `.select("id").maybeSingle()`, dan beberapa handler client tidak memeriksa `res.ok` pada aksi sekunder (delete/archive/mark read).

---

## 7. Fitur yang Belum Dapat Diuji Secara Live dan Alasannya

| Fitur / Pengujian | Alasan Belum Dapat Diuji (Blocker) | Kebutuhan untuk Membuka Blokir |
|---|---|---|
| **Seluruh Alur Terautentikasi & Multi-Role (`owner`, `admin`, `adult`, `teen`, `child`, `extended`, `caregiver`)** | Tidak ada environment Supabase test terisolasi (`.env.test` tidak ada; hanya `.env.local` yang menunjuk ke instance aktif/production). | Sediakan proyek Supabase staging/lokal khusus test + isi `.env.test` (`E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`), lalu jalankan 7 suite E2E yang saat ini ter-skip. |
| **Verifikasi RLS PostgreSQL & Isolasi Lintas Keluarga (`npm run test:rls`)** | `TEST_DATABASE_URL` kosong; `supabase` CLI dan `psql` tidak terpasang. | Pasang `psql` / Docker + Supabase CLI, jalankan migrasi `0001`–`0035` di DB test, dan eksekusi `npm run test:rls`. |
| **Web Push Notification (VAPID RFC 8291)** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` belum ada di `.env.local`. | Generate pasangan kunci VAPID, pasang di environment staging HTTPS, subscribe dari browser, dan uji `notification_outbox`. |
| **Email Auth Flows (Signup Verify, Forgot Password, Invite Email)** | Tidak ada SMTP/Inbucket test inbox terhubung untuk verifikasi otomatis. | Hubungkan Inbucket (Supabase local) atau SMTP sandbox untuk menguji link email end-to-end. |
| **AI Assistant dengan OpenAI Live & Capacitor Android APK** | Tidak diuji di perangkat fisik Android / live API call saat audit ini. | Verifikasi manual & E2E di staging setelah bug `/api/ai/stream` dan multi-turn diperbaiki. |

---

## 8. Prioritas Perbaikan

1. **P0 — Critical / High Security, Auth & Data Integrity:**
   - Guard keanggotaan `familyId` di `[familyId]/layout.tsx` & filter `deleted_at IS NULL` di `workspace/server.ts` (**BUG-003, BUG-056**).
   - Cek permission di server action yang bolong (`Tasks`, `Shopping`, `Noticeboard archive`, `Notifications retry`) & `.select("id").maybeSingle()` pada `Members` (**BUG-004, BUG-009, BUG-023, BUG-025, BUG-038**).
   - Sinkronisasi Storage RLS `0023` (`family-documents`) dan `0034` (`family-child-attachments`) dengan action & role (**BUG-016, BUG-017**).
   - Fix mapping **Settings Privacy Controls** & **Notification Channels** agar tidak salah mengubah kolom DB (**BUG-002, BUG-026**).
   - Fix **Dashboard `quickCompleteTaskAction`** (`event_type` & recurrence/approval) & **`monthlySpentCents`** (**BUG-005, BUG-006**).

2. **P1 — High Core Broken Flows:**
   - Fix **Onboarding Step 3** agar mengembalikan/menampilkan invite link atau mengirim email undangan (**BUG-001**).
   - Fix **Chat `adults_group`** agar mengikutsertakan semua anggota dewasa, dan perbaiki cache **Signed URL TTL** 120s (**BUG-020, BUG-021**).
   - Fix **Calendar Edit** agar tidak menghapus RSVP peserta lain / duplikasi reminder, serta tambahkan input `description`, `category`, `recurrenceUntil` (**BUG-007, BUG-008**).
   - Fix **Stale `useState` dropdowns** di `Finance`, `Budgets`, `Child Dev`, `Safety`, dan `DatePicker` (**BUG-014, BUG-015, BUG-017, BUG-053, BUG-054**).
   - Fix **Habits page auth guard & `!canView` check** + `Child Dev` permission mismatch (**BUG-018, BUG-019**).
   - Fix **Shopping offline dual-flusher** & mode offline pada `Tasks`/`Calendar`/`Dashboard` (**BUG-012, BUG-013, BUG-032, BUG-033**).
   - Fix **Notifications Quiet Hours** agar memakai timezone keluarga/user bukan UTC (**BUG-024**).

3. **P2 — Medium Feature Completeness, Attachments & AI:**
   - Implementasi upload/download nyata untuk **Task Attachments** & **Noticeboard Attachments**, atau nonaktifkan UI stub jika belum siap (**BUG-010, BUG-048**).
   - Sambungkan **AI Assistant** ke `/api/ai/stream` (atau hapus endpoint mati), kirim riwayat multi-turn, tangani error tanpa orphan message, dan implementasikan `create_task` & `create_calendar_event` pada `confirmAiProposedAction` (**BUG-022, BUG-047**).
   - Lengkapi **Edit & Delete** di `Chores & Rewards`, `Budgets/Bills/Schedules`, `Household (Home/Inventory/Meals)`, `Child Dev`, `Polls`, dan `Memory Albums` (**BUG-011, BUG-039, BUG-043, BUG-048, BUG-050**).
   - Implementasi **Safety SOS Trigger** & loading/error guards di `Habits`, `Safety`, `Inventory`, `Documents`, `Noticeboard` (**BUG-042, BUG-044, BUG-045**).
   - Fix konsistensi **Timezone** (`families.timezone`) di `Dashboard`, `Calendar`, `Habits`, `Chat` (**BUG-034, BUG-035, BUG-042, BUG-061**) serta limit query `Analytics` (300), `Chat` (200), `Memories` (120) (**BUG-040, BUG-046, BUG-050**).

4. **P3 — Low UX, Polish & Localization:**
   - Bersihkan seluruh sisa string hardcoded berbahasa Inggris & `intlLocale` (**BUG-059, BUG-063**).
   - Perbaiki touch target `44px` (`Memories`, `Inventory`) dan detail kecil (`BUG-055`..`BUG-062`).

---

## 9. Urutan Fase Stabilization

| Fase | Fokus Utama | Kelompok Bug yang Diselesaikan | Exit Gate (Kriteria Lulus) |
|---|---|---|---|
| **S1 — Test Environment & Security/Data Integrity** | Siapkan Supabase lokal/staging test (`.env.test`), perbaiki guard layout, action RBAC/RLS alignment, Storage RLS (`0023`, `0034`), Settings privacy/channel miswiring, dan Dashboard `task_history`/`monthlySpentCents`. | BUG-002, 003, 004, 005, 006, 009, 016, 017, 018, 019, 023, 025, 026, 038, 056 | `npm run test:rls` **PASS** di DB test; 0 bypass otorisasi pada action & storage. |
| **S2 — Core Flow & State Reliability** | Perbaiki Onboarding Step 3 invite links, stale `useState` di Finance/Budgets/ChildDev/DatePicker, Calendar Edit RSVP/fields, Chat `adults_group` & signed URL TTL, Timezone (`families.timezone`) di Quiet Hours/Habits/Calendar/Dashboard, serta error/loading guards. | BUG-001, 007, 008, 014, 015, 020, 021, 024, 027, 028, 029, 030, 031, 034, 035, 041, 042, 045, 046, 053, 054 | Seluruh alur inti (Onboarding -> Members -> Calendar -> Finance -> Chat -> Settings) lulus E2E terautentikasi multi-role tanpa silent failure. |
| **S3 — Offline Sync Unification & PWA** | Hapus flusher ganda di Shopping, baca `readOfflineCache` di semua modul offline, perbaiki loop `usePwaSync`, aktifkan conflict check, dan lengkapi fallback offline pada Dashboard/Calendar/Tasks/Shopping. | BUG-012, 013, 032, 033 | `aud-001`, `aud-002`, `aud-003` E2E **PASS** di Playwright; mutasi offline tersinkronisasi 1x tanpa kehilangan data. |
| **S4 — CRUD Parity, Stub Completion & AI** | Lengkapi Edit/Delete (Chores, Budgets/Bills/Schedules, Household, ChildDev, Polls, Albums), implementasi real upload Task/Noticeboard attachments & Safety SOS, perbaiki AI multi-turn + streaming + proposed actions, dan angkat cap query (`300`/`200`/`120`). | BUG-010, 011, 022, 036, 037, 039, 040, 043, 044, 047, 048, 049, 050, 051, 052 | 0 tombol/fitur stubbed; seluruh CRUD & attachment bekerja dengan refresh persistence. |
| **S5 — Polish, i18n, Mobile QA & Release Gate** | Selesaikan seluruh string hardcoded `t()`, `intlLocale`, touch target 44px, konfigurasi VAPID staging, lalu jalankan full E2E suite + Lighthouse + smoke test manual multi-role. | BUG-055, 057, 058, 059, 060, 061, 062, 063 | Seluruh Playwright E2E (`11` specs), `test:rls`, `vitest`, `typecheck`, `lint`, `next build` **PASS** 100%. |

---

## 10. Estimasi Kompleksitas Setiap Kelompok Perbaikan

| Kelompok Perbaikan | Estimasi Kompleksitas | Alasan Teknis |
|---|---|---|
| **S1 — Environment Test, Auth/RBAC Guards, Storage RLS & Miswiring** | **Sedang (Medium)** | Perubahan terlokalisasi di layout, action guards, 2 migration RLS kecil, dan pemetaan props/i18n di Settings/Dashboard, namun butuh setup DB test terisolasi untuk verifikasi `test:rls`. |
| **S2 — State Sync, Onboarding Invite, Calendar, Chat & Timezone** | **Sedang–Tinggi (Medium–High)** | Menyentuh banyak komponen client (`useEffect` sync / key reset), logika diffing peserta kalender, konversi timezone konsisten di server & client, dan manajemen signed URL. |
| **S3 — Offline Sync & Cache Unification** | **Sedang–Tinggi (Medium–High)** | Membutuhkan konsolidasi arsitektur `usePwaSync` + `domain-sync.ts` + 4 view modul agar tidak ada race condition atau double flush. |
| **S4 — CRUD Parity, Attachments, Safety SOS & AI Assistant** | **Tinggi (High)** | Volume pekerjaan terbesar: menambah puluhan action + UI Edit/Delete di 6+ modul, wiring Supabase Storage untuk Tasks & Noticeboard, membuat alur SOS, serta merombak AI assistant menjadi multi-turn streaming yang persisten. |
| **S5 — Localization, Touch Targets & Full QA** | **Rendah–Sedang (Low–Medium)** | Pekerjaan mekanis (ekstraksi string ke `messages.ts`, penyesuaian class `min-h-11`, setup VAPID env) diikuti eksekusi regresi penuh. |
