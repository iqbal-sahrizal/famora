-- Migration 0012: Core Dashboard Domain Tables (Calendar, Tasks, Announcements, Shopping, Finance)
-- Every table is family-scoped with strict RLS and explicit authenticated privileges.

-- 1. calendar_events
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  location TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only', 'private')),
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_calendar_event_range CHECK (end_at >= start_at)
);

CREATE INDEX idx_calendar_events_family_start ON public.calendar_events(family_id, start_at);
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  assigned_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'pending_approval', 'done')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_at TIMESTAMPTZ,
  points_value INTEGER NOT NULL DEFAULT 0 CHECK (points_value >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_family_status_due ON public.tasks(family_id, status, due_at);
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. family_announcements
CREATE TABLE public.family_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  pinned BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_family_created ON public.family_announcements(family_id, pinned DESC, created_at DESC);
CREATE TRIGGER trg_family_announcements_updated_at
  BEFORE UPDATE ON public.family_announcements
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. shopping_items
CREATE TABLE public.shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  added_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'Groceries',
  quantity TEXT NOT NULL DEFAULT '1',
  is_checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_items_family_checked ON public.shopping_items(family_id, is_checked, created_at DESC);
CREATE TRIGGER trg_shopping_items_updated_at
  BEFORE UPDATE ON public.shopping_items
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. finance_accounts
CREATE TABLE public.finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  account_type TEXT NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings', 'cash', 'allowance')),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$'),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  monthly_budget_cents BIGINT NOT NULL DEFAULT 0 CHECK (monthly_budget_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_accounts_family ON public.finance_accounts(family_id);
CREATE TRIGGER trg_finance_accounts_updated_at
  BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 6. finance_transactions
CREATE TABLE public.finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  merchant TEXT NOT NULL CHECK (char_length(trim(merchant)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'General',
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_tx_family_date ON public.finance_transactions(family_id, occurred_on DESC);
CREATE TRIGGER trg_finance_transactions_updated_at
  BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_events, public.tasks, public.family_announcements, public.shopping_items, public.finance_accounts, public.finance_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events, public.tasks, public.family_announcements, public.shopping_items, public.finance_accounts, public.finance_transactions TO authenticated;

-- RLS Policies
CREATE POLICY "calendar_events_select_scoped" ON public.calendar_events
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      visibility = 'family'
      OR (visibility = 'adults_only' AND famora.has_permission(family_id, 'calendar.adults_only.view'))
      OR (visibility = 'private' AND created_by_member_id = famora.current_member_id(family_id))
    )
  );

CREATE POLICY "calendar_events_write_permitted" ON public.calendar_events
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'calendar.family.manage'))
  WITH CHECK (famora.has_permission(family_id, 'calendar.family.manage'));

CREATE POLICY "tasks_select_member" ON public.tasks
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "tasks_write_permitted_or_assigned" ON public.tasks
  FOR ALL TO authenticated
  USING (
    famora.has_permission(family_id, 'tasks.manage_all')
    OR assigned_member_id = famora.current_member_id(family_id)
  )
  WITH CHECK (
    famora.has_permission(family_id, 'tasks.manage_all')
    OR assigned_member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "announcements_select_member" ON public.family_announcements
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "announcements_write_adults" ON public.family_announcements
  FOR ALL TO authenticated
  USING (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']))
  WITH CHECK (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']));

CREATE POLICY "shopping_select_member" ON public.shopping_items
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "shopping_write_permitted" ON public.shopping_items
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

-- Strict Financial Isolation: unauthorized roles (child, extended, caregiver) get 0 rows
CREATE POLICY "finance_accounts_select_permitted" ON public.finance_accounts
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'finance.accounts.manage')
    OR famora.has_permission(family_id, 'finance.transactions.manage')
  );

CREATE POLICY "finance_accounts_write_managers" ON public.finance_accounts
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.accounts.manage'));

CREATE POLICY "finance_transactions_select_permitted" ON public.finance_transactions
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'finance.accounts.manage')
    OR famora.has_permission(family_id, 'finance.transactions.manage')
  );

CREATE POLICY "finance_transactions_write_permitted" ON public.finance_transactions
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));
