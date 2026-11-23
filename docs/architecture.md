# Famora — System & Product Architecture

## 1. Workspace Inspection & Current State

- **Inspected Directory**: `/Users/iqbalsahrizal/Documents/CODING/Personal Project`
- **Status**: The workspace root contains multiple unrelated personal projects (`smart-rt`, `family-planner`, `life_ops_app`, etc.) and **no existing Famora codebase or `docs/` directory**.
- **Conclusion**: Famora is a **greenfield project**. Step 01 establishes the complete architectural blueprint in `docs/` prior to scaffolding the application in Step 02.

---

## 2. Architectural Style & Core Stack

Famora uses a **Modular Monolith + BFF (Backend-for-Frontend) + Managed BaaS** architecture:

| Layer | Technology Choice | Reasoning |
| :--- | :--- | :--- |
| **Frontend & BFF** | **Next.js (App Router, React 19, TypeScript)** | Unified SSR/RSC initial loads, SEO-friendly public/auth pages, type-safe Server Actions & Route Handlers, zero separate API repo overhead. |
| **UI & Styling** | **Tailwind CSS v4 + shadcn/ui (Radix/Base UI) + Lucide** | Accessible primitives, composable design tokens, zero runtime CSS overhead, rapid consistent UI delivery. |
| **Client State & Cache** | **TanStack Query v5 + Zustand + IndexedDB (`idb`)** | Optimistic UI, family-namespaced caching, offline mutation persistence, minimal global client state. |
| **Database & Auth** | **Supabase (PostgreSQL 15+ with RLS, Supabase Auth)** | Native Row-Level Security for rock-solid multi-family isolation, built-in MFA/OAuth/Passkeys, SQL migrations, relational integrity. |
| **Realtime & Storage** | **Supabase Realtime + Supabase Storage** | Low-latency WebSocket channels for Chat/Shopping/Calendar; private buckets with signed URLs for Memories & Documents. |
| **PWA & Offline** | **Custom Service Worker (Serwist) + Web Push (VAPID)** | Full control over caching strategies, offline queue replay, background sync, and privacy-safe push notifications. |
| **AI Orchestration** | **Next.js Route Handlers + Vercel AI SDK** | Server-side streaming, provider-agnostic LLM calls, strict user-JWT RLS enforcement, rate-limiting via Redis. |
| **Rate Limiting & Jobs** | **Upstash Redis + Scheduled Edge/Cron Jobs** | Sliding-window rate limiting, AI quota enforcement, scheduled digests, bill/document expiry reminders. |

---

## 3. Multi-Family Architecture

Famora is **multi-tenant by `family_id`**, where a single `user_id` (`auth.users`) can hold memberships in $N$ families (`family_memberships`).

### Key Mechanisms
1. **Active Family Context**:
   - Stored in URL/route (`/f/[familySlug]/...` or active workspace cookie + Zustand store) so deep links, browser tabs, and push notification targets always resolve unambiguously to a specific family.
   - **Why URL/Slug + Validated Membership?** If a user has two tabs open (Tab A in Family 1, Tab B in Family 2), relying solely on a shared cookie or `localStorage` causes race conditions and cross-family mutation bugs. Scoping routes under `/app/[familyId]/...` (or validating `X-Family-Id` / route param on every request) eliminates tab-bleed!
2. **Data Isolation**:
   - Every family-scoped table includes a non-null `family_id UUID REFERENCES families(id) ON DELETE CASCADE`.
   - Every Postgres query is guarded by Row-Level Security (RLS) policies checking active membership and domain permissions.
3. **Client Cache Partitioning**:
   - TanStack Query keys always start with `['family', familyId, domain, ...]`.
   - IndexedDB offline store partitions records and queued mutations by `familyId`.
   - Realtime subscriptions subscribe to `family:{familyId}:{domain}` and unsubscribe cleanly on family switch.

---

## 4. Frontend Architecture

### Directory Structure (Planned for Step 02)
```text
src/
├── app/
│   ├── (public)/          # Landing, login, signup, invite acceptance
│   ├── (app)/
│   │   ├── onboarding/    # Create or join first family
│   │   └── f/[familyId]/  # All 19 domains scoped to active family
│   └── api/               # BFF Route Handlers (AI, webhooks, push, exports)
├── domains/               # Vertical feature modules (1 per domain)
│   ├── auth/
│   ├── family/
│   ├── dashboard/
│   ├── calendar/
│   ├── tasks/
│   ├── finance/
│   ├── child-dev/
│   ├── shopping/
│   ├── inventory/
│   ├── documents/
│   ├── chat/
│   ├── meals/
│   ├── home/
│   ├── memories/
│   ├── habits/
│   ├── safety/
│   ├── notifications/
│   ├── ai/
│   └── settings/
├── shared/
│   ├── components/        # Design system UI primitives & layout shells
│   ├── hooks/             # Offline status, active family, permissions
│   ├── lib/               # Supabase clients, query client, idb, logger
│   └── types/             # Generated DB types & domain contracts
└── sw/                    # Service worker source & push handlers
```

### Rendering Strategy
- **App Shell + RSC**: Layout shell, user session, and initial family membership metadata load on the server.
- **Interactive Domains**: Hydrated with TanStack Query + Optimistic Updates + Realtime invalidation/patching so the app feels instantaneous and works offline.

---

## 5. Backend Architecture

1. **Direct-to-Supabase (RLS-Protected)** for standard CRUD and Realtime subscriptions (reduces BFF hop latency and leverages Postgres RLS directly).
2. **Next.js BFF (Server Actions & Route Handlers)** for:
   - Complex multi-table transactions or business rules (e.g., completing a chore that awards points and triggers an allowance transfer).
   - Signed URL generation for Sensitive Documents after audit logging.
   - AI Assistant streaming & tool execution (using the **user's JWT**, never bypassing RLS).
   - Web Push dispatch, iCal feed generation, data export (ZIP/JSON), and webhook handling.
3. **Background & Scheduled Jobs** (Supabase `pg_cron` / Edge Functions or Vercel Cron):
   - Daily morning digest notifications.
   - Recurring task/chore & recurring bill generation.
   - Document & warranty expiration alerts (30d, 7d, 1d).
   - Soft-deleted family/account purge after grace period.

---

## 6. Identified Architectural Conflicts & Mitigations

| # | Potential Conflict | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| 1 | **Multi-Tab Family Bleed** (shared cookie/localStorage across tabs) | High — User edits Family A thinking they are in Family B | Scope all authenticated family routes by `/f/[familyId]/...`, embed `familyId` in every query key, IDB record, and API payload. |
| 2 | **Offline Sync vs. Financial & Permission Integrity** | High — Stale offline edits overwrite balances or bypass revoked roles | Tiered offline model: Tier 1 (Tasks, Shopping, Habits) offline-first; Tier 2 (Calendar, Inventory) conflict-checked; Tier 3 (Finance, Roles, Safety, Vault) online-only or strict server validation. |
| 3 | **RLS Subquery Performance** on high-volume tables | Medium — Slow chat/task queries as families grow | Use `STABLE SECURITY DEFINER` permission helper functions, denormalized `family_id` on child tables, and composite `(family_id, created_at)` indexes. |
| 4 | **AI Assistant Bypassing Permissions** via Service Role | Critical — Child/Guest could query Family Finance via AI | AI tool layer strictly instantiates Supabase client with the **caller's JWT** so Postgres RLS enforces every boundary automatically. |
| 5 | **Managed Child Profiles vs. Auth Users** | Medium — Young children lack emails but need chore/habit views | Separate `family_members` (profile/membership) from `auth.users` (`user_id` nullable for `managed_child`), accessed via supervised Kiosk/PIN mode. |
| 6 | **Web Push Privacy on Lock Screens & iOS** | High — Sensitive alerts exposed; iOS requires standalone install | Send generic/redacted push payloads (`"New Family Safety alert"`), fetch details authenticated on open; provide iOS install guide + email/SMS fallback for SOS. |
| 7 | **Private Media Caching in Service Worker** | High — Cached signed URLs or images persist after logout/removal | Never cache `/api/documents/sensitive/*` or signed media in persistent SW cache; purge family-scoped caches on logout or family removal. |
