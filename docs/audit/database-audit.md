# Famora — Database Audit

## Static Schema & Migration Verification (`npm run db:validate`)
- **Migrations**: `0001` through `0029` (29 sequential SQL migrations, valid numbering).
- **RLS Coverage**: All **78** `public.*` tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` verified by `scripts/validate-migrations.mjs`.
- **Privilege Hygiene**: Baseline `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated`; `family_members` `SELECT` is column-restricted to protect `pin_hash`; zero `USING (true)` or `WITH CHECK (true)` policies.
- **Security Definer Functions**: All 25 `SECURITY DEFINER` functions set explicit `search_path` (`SET search_path = public, ...`).
- **Financial Integrity**: `NUMERIC(18, 2)` and atomic RPCs (`record_finance_transaction`, `reverse_finance_transaction`, `pay_household_bill`, `contribute_to_finance_goal`, `record_debt_payment`) with idempotency keys.

## Live Database Verification Gap
- **Status**: **BLOCKED** (`supabase` CLI, `psql`, and Docker Postgres are not installed locally). Live execution of foreign keys, triggers, constraints, and `pgTAP` RLS tests against a running PostgreSQL instance has not been performed.
