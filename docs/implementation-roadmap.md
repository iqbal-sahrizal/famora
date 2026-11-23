# Famora — Implementation Roadmap

## Phase 1: Foundation & Multi-Family Core (Step 02)
- Project scaffolding: Next.js (App Router, TS), Tailwind v4, shadcn/ui, Supabase CLI, ESLint/Vitest/Playwright.
- Core DB schema & migrations: `profiles`, `families`, `family_members`, `family_invites`, `member_permission_overrides`, `audit_logs`.
- RLS helper functions (`is_family_member`, `has_permission`, `current_member_id`) + pgTAP RLS test suite.
- Domains: **Authentication**, **Family Management**, **Settings** (base), and App Shell (`FamilySwitcher`, responsive nav).

## Phase 2: Daily Operations & Offline PWA Core
- PWA setup: Web App Manifest, Serwist Service Worker, IndexedDB offline queue & cache partitioning.
- Domains: **Family Dashboard**, **Calendar**, **Tasks & Chores**, **Shopping**, **Notifications** (in-app + Web Push).
- Verify Tier 1 offline sync (Shopping & Tasks) and multi-family cache isolation.

## Phase 3: Household & Collaboration
- Domains: **Family Chat** (Realtime), **Meal Planning** (with Shopping integration), **Inventory** (with low-stock Shopping triggers), **Home Management**.
- External iCal sync & scheduled recurring jobs.

## Phase 4: Finance, Vault & Child Ecosystem
- Domains: **Family Finance** (accounts, budgets, transactions, allowances), **Documents** (Standard + Sensitive Vault with signed URLs & audit logging), **Child Development** (profiles, milestones, reward ledger), **Habits & Routines**.
- Managed Child Kiosk/PIN mode.

## Phase 5: Memories, Safety, AI & Hardening
- Domains: **Family Memories**, **Family Safety** (SOS, check-ins, offline medical cards), **AI Assistant** (RLS-scoped tools + confirmation UI).
- Full security audit, accessibility audit (WCAG 2.1 AA), performance tuning, E2E + PWA Lighthouse verification, and production launch.
