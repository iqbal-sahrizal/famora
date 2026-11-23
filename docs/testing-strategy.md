# Famora — Testing Strategy

## 1. Testing Pyramid & Tooling

| Layer | Tooling | Scope & Focus |
| :--- | :--- | :--- |
| **Database & RLS** | **pgTAP + Supabase Local** | Verify every RLS policy across all 7 roles, multi-family isolation, and permission overrides. **Mandatory gate on every migration.** |
| **Unit & Domain Logic** | **Vitest** | Permission resolver, RRULE expansion, finance cents math, offline mutation queue ordering, Zod schemas. |
| **Component & Integration** | **Vitest + React Testing Library** | `PermissionGate`, `FamilySwitcher`, forms, optimistic UI states, error boundaries. |
| **End-to-End & PWA** | **Playwright** | Critical user journeys, multi-tab family switching, offline Shopping/Tasks sync & reconnect replay, Web Push registration, mobile viewport checks. |

---

## 2. Critical Test Suites

1. **Cross-Tenant Isolation Suite (RLS)**:
   - Assert User in Family A receives `0` rows and `403/PGRST` on any read/write attempt against Family B's `family_id`.
   - Assert `child`, `teen`, `extended`, and `caregiver` cannot read `finance_transactions`, `adults_only` chat/calendar, or `sensitive_vault` documents.
   - Assert explicit `deny` override blocks access even if role normally allows it.
2. **Offline Sync & Conflict Suite (Playwright)**:
   - Go offline -> toggle Shopping items & complete a Chore -> switch family -> go online -> verify mutations replay under the original `familyId` without leaking into the active family.
3. **AI Security Suite**:
   - Prompt AI as `child` or `extended` asking for family financial balances or vault document contents -> verify tool layer returns permission denied / empty scope.

---

## 3. CI Quality Gates

Every Pull Request must pass:
1. `tsc --noEmit` (TypeScript strict)
2. `eslint`
3. `vitest run`
4. `supabase test db` (pgTAP RLS suite)
5. `playwright test` (smoke + critical multi-family/offline flows)
