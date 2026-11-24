# Famora S3 — Offline Cache & Sync Reliability Report

**Tanggal:** 2026-11-24  
**Referensi:** `phase-s0-full-functional-audit.md`, `phase-s2-core-flow-reliability.md`  
**Verdict:** `S3_IMPLEMENTED_WITH_DEBT`

---

## 1. Root Cause Setiap Bug

| Bug ID | Modul | Root Cause |
|---|---|---|
| **BUG-012** | **Dashboard** (`FamilyDashboardView`) | `readOfflineCache` hanya dipakai ketika `!isOnline && !data.family`; ketika server refresh gagal saat online, cache tidak dipakai, tidak ada banner indikator cache, `cachedData` tidak di-reset saat `familyId` berubah, dan quick actions tidak mengantrekan mutasi saat offline. |
| **BUG-013** | **Calendar** (`FamilyCalendarView`) | Hanya memanggil `writeOfflineCache` saat online, tidak pernah memanggil `readOfflineCache` untuk fallback tampilan offline atau kegagalan refresh. |
| **BUG-032** | **Tasks** (`FamilyTasksView`) + **`usePwaSync`** | `FamilyTasksView` hanya memanggil `writeOfflineCache` tanpa `readOfflineCache`; sementara `usePwaSync` memiliki dependency `[summary.conflictCount, summary.failedCount]` di `runFlush`, sehingga memicu loop re-flush setiap kali status outbox berubah. |
| **BUG-033** | **Shopping** (`FamilyShoppingView`) | Tidak memanggil `readOfflineCache`; menjalankan flusher kedua (`flushShoppingMutations`) yang bersaing dengan `usePwaSync`, menimpa metadata `add_item` dengan default, tidak menangani `update_quantity` (mengembalikan `true` sehingga menghapus mutasi dari IndexedDB tanpa sync), dan mengembalikan error pada mutasi domain lain (`tasks`, `calendar`). |
| **S3-SEC-01** | **Logout Cache & Outbox Isolation** | `AppShell` dan `AccountSettingsView` hanya memanggil `clearOfflineCache()` saat logout dan membiarkan `mutation_outbox` tetap ada di IndexedDB untuk sesi pengguna berikutnya. |
| **S3-SYNC-01** | **Permanent Error Retry** | `flushOfflineOutbox` mengulang mutasi hingga 5 kali meskipun server mengembalikan error permanen (misal `Missing permission` / `do not have permission` / `not found`). |

---

## 2. Daftar File yang Diubah & Dibuat

- `src/lib/pwa/types.ts` (penambahan field `userId` opsional pada cache & outbox record)
- `src/lib/pwa/indexeddb.ts` (`writeOfflineCache`/`readOfflineCache` dengan validasi `familyId` & `userId`, serta `clearOfflineOutbox` + `clearAllPwaStorage`)
- `src/lib/pwa/sync-engine.ts` (`isPermanentOfflineError` untuk menghentikan retry otomatis pada error izin/hilang permanen)
- `src/hooks/use-pwa-sync.ts` (menghilangkan loop dependency `summaryRef` di `runFlush`)
- `src/hooks/use-offline-cached-data.ts` *(Baru — hook terpusat untuk cache read/write, reset lintas-family, dan deteksi kedaluwarsa 24 jam)*
- `src/components/pwa/offline-cache-banner.tsx` *(Baru — banner indikator cache offline vs cache kedaluwarsa)*
- `src/features/dashboard/components/family-dashboard-view.tsx`
- `src/features/calendar/components/family-calendar-view.tsx`
- `src/features/tasks/components/family-tasks-view.tsx`
- `src/features/shopping/components/family-shopping-view.tsx`
- `src/components/layout/app-shell.tsx` (`clearAllPwaStorage` saat logout)
- `src/features/auth/components/account-settings-view.tsx` (`clearAllPwaStorage` + error toast saat logout gagal)
- `src/lib/pwa/__tests__/s3-offline-sync-regressions.test.ts` *(Baru)*

---

## 3. Perbaikan Offline Cache per Modul

Melalui hook `useOfflineCachedData` + komponen `OfflineCacheBanner`:
- **Dashboard (`dashboard`)**: Menampilkan snapshot terakhir saat offline atau ketika server refresh gagal (`!data.family`), mereset cache state seketika saat `familyId` berubah, dan mendukung antrean offline untuk Quick Add Task, Quick Complete Task, Quick Add Shopping Item, dan Toggle Shopping Item.
- **Calendar (`calendar`)**: Membaca `calendar` cache saat data server kosong/offline, menampilkan `OfflineCacheBanner`, dan menjaga tampilan agenda/bulan tetap dapat dibaca.
- **Tasks (`tasks`)**: Membaca `tasks` cache saat data server kosong/offline dan menampilkan `OfflineCacheBanner`.
- **Shopping (`shopping`)**: Membaca `shopping` cache saat data server kosong/offline, menampilkan `OfflineCacheBanner`, menambah item optimis ke `itemsState` saat offline (termasuk `assignedShopperMemberId`), serta mengantrekan `update_quantity` saat offline.

Setiap modul membedakan:
1. **Cache kosong** -> tetap menampilkan empty/error state normal.
2. **Cache tersedia (< 24 jam)** -> menampilkan data cache + indikator `"Menampilkan data tersimpan offline"`.
3. **Cache kedaluwarsa (> 24 jam)** -> menampilkan data cache + peringatan `"Menampilkan data cache lama"`.

---

## 4. Perbaikan Mutation Queue & Dual Flusher

- **Penghapusan Flusher Ganda:** Efek `flushShoppingMutations` di `FamilyShoppingView` dihapus sepenuhnya. Seluruh domain (`shopping`, `tasks`, `calendar`, `drafts`) kini diproses melalui **satu jalur tunggal** yaitu `usePwaSync` -> `flushOfflineOutbox` -> `executeDomainOfflineMutation` (`domain-sync.ts`).
- **Shopping `update_quantity`:** `handleStepQuantity` saat offline kini memanggil `enqueueShoppingMutation(createQueuedShoppingMutation(familyId, "update_quantity", { itemId, quantity }))` dan `domain-sync.ts` mengeksekusi `updateShoppingQuantityAction` dengan parameter penuh.
- **Concurrency Lock:** `inFlightFlushByKey` di `sync-engine.ts` memastikan dua panggilan `flushOfflineOutbox` paralel untuk `familyId` yang sama tidak mengeksekusi mutasi dua kali.

---

## 5. Strategi Idempotency, Retry & Conflict Resolution

- **Idempotency:** Setiap mutasi memiliki `idempotencyKey` (UUID); `shopping_items` memakai `client_mutation_id` upsert (`onConflict: "family_id,client_mutation_id"`), dan `toggleTaskStatusAction` memeriksa `existing.status === nextStatus`.
- **Retry & Backoff:** Error jaringan/sementara mengalami backoff `[2s, 5s, 15s, 45s, 120s]` hingga `maxAttempts = 5`. Error auth expired (`401` / session expired) menunda sync tanpa menghabiskan kuota retry. Error permanen (`isPermanentOfflineError`: missing/do not have permission, not authorized, not found) langsung menyetel `attempts = maxAttempts` dan `status = "failed"` agar tidak retry tanpa akhir.
- **Conflict Resolution (`resolveDomainConflict`):**
  - `shopping`: field-level idempotent apply.
  - `tasks`: `server_wins` jika task sudah selesai atau dihapus di server.
  - `calendar`: `server_wins` jika ada update lebih baru di server.
  - `drafts`: `manual_review` (tidak menimpa diam-diam).

---

## 6. Perlindungan Cache Antar-User & Antar-Family

- Kunci cache & indeks outbox terikat ke `familyId` (`${familyId}:${domain}` + validasi `entry.familyId === familyId`).
- `useOfflineCachedData` langsung mengosongkan fallback state saat `familyId` berubah sehingga perpindahan keluarga tidak pernah membocorkan cache keluarga sebelumnya.
- `writeOfflineCache` & `readOfflineCache` mendukung isolasi `userId` (`entry.userId !== userId` -> `null`).
- `clearAllPwaStorage()` pada saat logout di `AppShell` dan `AccountSettingsView` menghapus **baik `offline_cache` maupun `mutation_outbox`** di IndexedDB sehingga sesi pengguna berikutnya tidak dapat mengeksekusi mutasi lama.

---

## 7. Regression Tests & Hasil Eksekusinya

| Pengujian | Cakupan | Status & Hasil |
|---|---|---|
| `npm run typecheck` | TypeScript strict check seluruh workspace | **PASS** (exit 0) |
| `npm run lint` | ESLint seluruh workspace | **PASS** (exit 0) |
| `npm test -- --run` | **36 files, 163 tests passed** (termasuk `s3-offline-sync-regressions.test.ts`: cache read 4 modul, empty cache, cross-family & cross-user isolation, `clearAllPwaStorage`, `update_quantity` single-flusher, permanent vs transient failure, conflict resolution — **mocked server actions / in-memory store**) | **PASS** |
| `npm run db:validate` | Validasi 36 migrasi & RLS statis | **PASS** |
| `npx playwright test e2e/mobile-m6-pwa.spec.ts e2e/smoke-and-pwa.spec.ts` | Browser Chrome nyata: SW caching publik-only, manifest, IndexedDB `famora-pwa-db`, navigasi offline aman | **PASS** (**13/13 tests passed**) |
| Authenticated Offline E2E (`aud-001`, `aud-002`, `aud-003`) | Reconnect sync terhadap Supabase live | **BLOCKED** (tidak ada Supabase test terisolasi / `E2E_SUPABASE_SERVICE_ROLE_KEY`) |

---

## 8. Bug yang Belum Selesai & Alasannya (Dijadwalkan ke S4–S5)

- **S4 (CRUD Parity, Stub Completion & AI):** `BUG-010` (Task attachments real upload), `BUG-011`/`039`/`043`/`048`/`050` (Edit/Delete parity), `BUG-022`/`047` (AI streaming & multi-turn), `BUG-045` (Safety SOS trigger).
- **S5 / S2-Debt:** `BUG-001` (Onboarding Step 3 invite links), `BUG-020`/`021` (Chat `adults_group` & signed URL TTL), `BUG-024` (Notifications quiet hours timezone), `BUG-035` (Calendar editor timezone).

---

## 9. Verification Debt dari S1 & S2 yang Masih Terbuka

1. Eksekusi `npm run test:rls` dan `supabase/tests/03_storage_rls_0036_test.sql` masih **BLOCKED** (Docker daemon tidak berjalan; `psql` & `supabase` CLI tidak terpasang).
2. Eksekusi 7 suite Playwright E2E terautentikasi (`aud-001`..`003`, `mobile-m2/m4/m5/m7`) masih **BLOCKED** karena tidak tersedia instance Supabase test terisolasi (`.env.test`).
