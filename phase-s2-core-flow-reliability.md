# Famora S2 — Core Flow, Form & Modal Reliability Report

**Tanggal:** 2026-11-24  
**Referensi:** `phase-s0-full-functional-audit.md`, `phase-s1.1-integration-verification.md`  
**Verdict:** `S2_IMPLEMENTED_WITH_DEBT`

---

## 1. Daftar Bug yang Ditemukan & Diselesaikan

| Bug ID | Modul & Komponen | Ringkasan Masalah | Status |
|---|---|---|---|
| **BUG-054** | Shared UI (`DatePicker`) | `viewMonth` hanya diinisialisasi saat mount dan tidak sinkron saat `value` berubah dari luar; `Invalid Date` merender `NaN`; popover belum dibatasi tinggi/scroll di dalam modal mobile. | **Fixed (Playwright + Code Verified)** |
| **BUG-014** | Finance (`FamilyFinanceView`) | `txAccountId` dan `txTransferDst` hanya diinisialisasi sekali saat mount dan menjadi stale/kosong setelah pembuatan akun pertama atau pengarsipan akun aktif. | **Fixed (Typecheck & Code Verified)** |
| **BUG-015** | Budgets & Bills (`FamilyBudgetsBillsView`) | `payAccountId` dan `sAccount` stale saat daftar akun berubah; `handlePayBill` return diam-diam jika `!payAccountId` dan menutup modal `payTarget` sebelum mengecek `res.ok`. | **Fixed (Typecheck & Code Verified)** |
| **BUG-017** | Child Development (`ChildDevelopmentView`) | `selectedChildId` stale setelah pembuatan profil anak pertama; `attRecordType` default `"education"` meski user hanya punya izin `child_dev.health.view`; `pSchool` & `pGrade` tidak di-reset setelah submit. | **Fixed (Typecheck & Code Verified)** |
| **BUG-018** | Child Development (`server.ts`, `ChildDevelopmentView`) | Tombol "New Profile" memakai `canManageGrowthMilestones`, padahal `createChildProfileAction` mensyaratkan `child_dev.manage` (`canManageProfiles`). | **Fixed (Unit & Typecheck Verified)** |
| **BUG-053** | Safety (`FamilySafetyView`) | `selectedViewerIds` hanya diinisialisasi sekali saat mount dan tidak sinkron ketika daftar anggota berubah. | **Fixed (Typecheck & Code Verified)** |
| **BUG-045 (Forms)** | Safety (`FamilySafetyView`) | Form kontak, protokol, lokasi, dan tombol hapus kontak tidak memiliki `busy` guard (rawan double submit), dan delete contact mengabaikan error server. | **Fixed (Typecheck & Code Verified)** |
| **BUG-007** | Calendar (`calendar/actions.ts`) | Mengedit event mereset status RSVP seluruh peserta ke `pending`, membuat notifikasi pengingat ganda, dan tidak memverifikasi affected row pada update. | **Fixed (Unit Verified)** |
| **BUG-008** | Calendar (`FamilyCalendarView`) | Form Create/Edit Event tidak merender input `description`, `category`, maupun `recurrenceUntil`. | **Fixed (Typecheck & Code Verified)** |
| **S2-SHOP-01** | Shopping (`FamilyShoppingView`) | `selectedListId` tetap menunjuk ke ID daftar yang sudah dihapus saat `data.lists` berubah. | **Fixed (Typecheck & Code Verified)** |

---

## 2. Root Cause Setiap Bug

1. **Inisialisasi `useState` Satu Kali Tanpa Sinkronisasi Props:** Pada `DatePicker`, `FamilyFinanceView`, `FamilyBudgetsBillsView`, `ChildDevelopmentView`, `FamilySafetyView`, dan `FamilyShoppingView`, state pilihan aktif (`viewMonth`, `txAccountId`, `payAccountId`, `sAccount`, `selectedChildId`, `attRecordType`, `selectedViewerIds`, `selectedListId`) diambil dari props saat mount pertama kali. Saat `router.refresh()` memperbarui props dari server, state client tertinggal.
2. **Lifecycle Modal & Error Handling:** `handlePayBill` menutup `payTarget` sebelum mengecek `res.ok`, dan `FamilySafetyView` tidak memiliki state `busy` maupun penanganan error pada `deleteSafetyContactAction`.
3. **Participant Diffing & Reminder Duplication:** `saveCalendarEventAction` menghapus seluruh `calendar_event_participants` tanpa menyimpan map `rsvp_status` lama dan menyisipkan `notifications` pengingat pada setiap edit.
4. **Kontrol Form Hilang:** `FamilyCalendarView` sudah memiliki state `description` dan `category` serta schema `recurrenceUntil`, tetapi elemen UI-nya belum dirender di dalam `BottomSheet`.

---

## 3. File yang Diubah

- `src/components/ui/date-picker.tsx`
- `src/features/finance/components/family-finance-view.tsx`
- `src/features/finance/components/family-budgets-bills-view.tsx`
- `src/features/child-dev/server.ts`
- `src/features/child-dev/components/child-development-view.tsx`
- `src/features/safety/components/family-safety-view.tsx`
- `src/features/calendar/actions.ts`
- `src/features/calendar/components/family-calendar-view.tsx`
- `src/features/shopping/components/family-shopping-view.tsx`
- **Regression Tests:**
  - `src/features/calendar/__tests__/s2-core-flow-regressions.test.ts` *(Baru)*
  - `e2e/modal-focus.spec.ts` *(Diperluas dengan test `DatePicker` di dalam `Dialog` pada mobile)*

---

## 4. Perbaikan yang Diterapkan

- **`Dialog` & `BottomSheet` (`src/components/ui/dialog.tsx`):** Diaudit; sudah menggunakan `onCloseRef` stabil dan `useEffect` dengan dependency `[open, panelRef]` serta pengecekan `!panel.contains(document.activeElement)` sehingga fokus input tidak pernah tercuri saat mengetik atau re-render.
- **`DatePicker`:** Ditambahkan guard `Invalid Date` (`safeValue`), sinkronisasi `viewMonth` via `useEffect` ketika `value` berubah dari luar, dan `max-h-[min(24rem,65dvh)] overflow-y-auto` pada popover.
- **Finance, Budgets, ChildDev, Safety, Shopping:** Ditambahkan `useEffect` sinkronisasi state pilihan terhadap props server hanya ketika ID terpilih tidak lagi valid (menjaga input form yang sedang diisi tetap aman saat `router.refresh()`). `FamilySafetyView` dilengkapi `busy` guard dan error toast; `FamilyBudgetsBillsView` mempertahankan modal saat error; `ChildDevPageData` memisahkan `canManageProfiles` (`child_dev.manage`).
- **Calendar:** `saveCalendarEventAction` mempertahankan `rsvp_status` peserta lama saat edit dan hanya menjadwalkan notifikasi pengingat saat pembuatan event baru; `FamilyCalendarView` kini merender input `description` (`textarea`), `category` (`Select`), dan `recurrenceUntil` (`input[type="date"]`).

---

## 5. Regression Tests yang Ditambahkan

1. **Playwright E2E (`e2e/modal-focus.spec.ts`):**
   - Mengetik berturut-turut & middle-cursor editing pada `Input` dan `textarea` di dalam `Dialog` & `BottomSheet` (`id` & `en`) tanpa kehilangan fokus.
   - Verifikasi scroll lock, tombol `Escape`, dan 0 horizontal overflow di viewport `320x720` hingga `1280x800`.
   - **Baru (`BUG-054`):** Membuka `DatePicker` di dalam `Dialog` pada viewport mobile `375x812`, navigasi bulan berikutnya, memilih tanggal `15`, memverifikasi tampilan tanggal terbarui, dan memastikan `Dialog` induk tetap terbuka.
2. **Vitest (`src/features/calendar/__tests__/s2-core-flow-regressions.test.ts`):**
   - `BUG-007`: Memverifikasi `saveCalendarEventAction` mempertahankan `rsvp_status: "accepted"` peserta lain saat edit event dan tidak menggandakan notifikasi pengingat.
   - `BUG-018`: Memverifikasi `getChildDevPageData` memisahkan `canManageProfiles` (`child_dev.manage`) dari `canManageGrowthMilestones`.

---

## 6. Hasil Setiap Perintah Verifikasi

| Perintah | Status | Bukti & Catatan |
|---|---|---|
| `npm run typecheck` | **PASS** | Exit code 0; 0 error. |
| `npm run lint` | **PASS** | Exit code 0; 0 error/warning. |
| `npm test -- --run` | **PASS** | **35 files, 158 tests passed** (Vitest, mocked Supabase untuk server actions). |
| `npm run db:validate` | **PASS** | Validated 36 migrations, 78 RLS-forced tables, 25 hardened functions. |
| `npx playwright test e2e/modal-focus.spec.ts` | **PASS** | **9/9 tests passed** (27.1s) di browser Chrome nyata. |
| 7 Suite Playwright E2E Terautentikasi (`aud-001`..`003`, `mobile-m2/m4/m5/m7`) | **BLOCKED** | Membutuhkan `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` pada environment Supabase test terisolasi. |

---

## 7. Daftar Bug yang Belum Selesai & Alasannya (Dijadwalkan ke S3–S5)

- **S3 (Offline Sync & PWA):** `BUG-012`, `BUG-013`, `BUG-032`, `BUG-033` (unifikasi flusher Shopping, pembacaan `readOfflineCache`, loop `usePwaSync`).
- **S4 (CRUD Parity, Stub Completion & AI):** `BUG-010` (Task attachments real upload), `BUG-011`/`039`/`043`/`048`/`050` (Edit/Delete di Chores, Budgets/Bills/Schedules, Household, Polls, Albums), `BUG-022`/`047` (AI streaming & multi-turn), `BUG-045` (SOS trigger).
- **S2/S5 Debt Lainnya:** `BUG-001` (Onboarding Step 3 invite delivery), `BUG-020`/`021` (Chat `adults_group` & signed URL TTL), `BUG-024` (Notifications quiet hours timezone), `BUG-035` (Calendar timezone browser vs family).

---

## 8. Dampak Perubahan terhadap Fitur Lain

- Tidak ada perubahan schema database atau migration baru pada S2.
- Perubahan `ChildDevPageData.canManageProfiles` bersifat aditif dan menjaga konsistensi antara tombol UI dengan `createChildProfileAction`.
- Perubahan `DatePicker` berlaku global untuk seluruh form yang memakainya tanpa mengubah API komponen.

---

## 9. Verdict Akhir

**`S2_IMPLEMENTED_WITH_DEBT`** — Seluruh target perbaikan form, modal, `DatePicker`, stale state (`BUG-014`, `BUG-015`, `BUG-017`, `BUG-018`, `BUG-053`, `BUG-054`), dan alur Calendar (`BUG-007`, `BUG-008`) telah diimplementasikan dan lulus `typecheck`, `lint`, `db:validate`, 158 unit tests, serta 9/9 Playwright modal/DatePicker tests. Verification debt tersisa pada eksekusi E2E terautentikasi terhadap Supabase test terisolasi.
