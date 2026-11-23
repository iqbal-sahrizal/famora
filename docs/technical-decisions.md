# Famora — Architecture Decision Records (ADRs)

## ADR-001: URL-Scoped Multi-Family Context (`/f/[familyId]/...`)
- **Decision**: Scope all family-specific routes under `/f/[familyId]/...` rather than storing `activeFamilyId` solely in a cookie or `localStorage`.
- **Reasoning**: Prevents multi-tab race conditions where Tab A (Family 1) and Tab B (Family 2) overwrite each other's active cookie, and makes push notification deep links unambiguous.

## ADR-002: Next.js App Router + Supabase (RLS-First) Modular Monolith
- **Decision**: Use Next.js App Router (BFF + UI) paired with Supabase (Postgres RLS, Auth, Realtime, Storage).
- **Reasoning**: Eliminates maintaining a separate backend repo while Postgres RLS guarantees tenant isolation at the database layer regardless of API entry point.

## ADR-003: Separation of `auth.users` and `family_members` (Managed Child Support)
- **Decision**: `family_members.user_id` is nullable (`is_managed_child = true` + `pin_hash`) rather than requiring every child to have an email/auth account.
- **Reasoning**: Young children often do not have email addresses and share family tablets. Supervised Kiosk/PIN mode enables safe chore & habit tracking without COPPA/email friction.

## ADR-004: Tiered Offline Sync Strategy
- **Decision**: Partition domains into Tier 1 (Offline-First: Shopping, Tasks, Habits), Tier 2 (Offline Read + Conflict Check: Calendar, Inventory, Meals), and Tier 3 (Online-Only: Finance, Vault, Roles, AI).
- **Reasoning**: Prevents blind Last-Write-Wins (LWW) from corrupting financial balances or bypassing revoked permissions while keeping daily household checklists instant offline.

## ADR-005: User-JWT-Scoped AI Assistant
- **Decision**: The AI Assistant executes all database queries and tool calls using the requesting user's Supabase JWT, never a service-role key.
- **Reasoning**: Guarantees a Child, Teen, Caregiver, or Extended member can never prompt-inject the AI into leaking Family Finance or Sensitive Vault data.

## ADR-006: Private Storage Buckets + Short-Lived Signed URLs + Optional Vault Passphrase
- **Decision**: Zero public storage buckets; all media and documents use private buckets with 60–300s signed URLs, excluded from Service Worker caching for `sensitive_vault`.
- **Reasoning**: Protects private family photos, medical records, and legal IDs from URL guessing or persistent offline cache exposure on shared devices.

## ADR-007: Monetary Values Stored as Integer Cents (`BIGINT`)
- **Decision**: All Family Finance amounts (`balance_cents`, `amount_cents`, `target_cents`) are stored as integer minor units (`BIGINT`) alongside ISO-4217 currency codes.
- **Reasoning**: Eliminates floating-point rounding errors in budgets, allowances, and ledger calculations.
