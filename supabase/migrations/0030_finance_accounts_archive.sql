-- Migration 0030: Safe Finance Account Archiving (preserves historical transactions & audit records)

ALTER TABLE public.finance_accounts
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_finance_accounts_family_archived
  ON public.finance_accounts(family_id, is_archived);
