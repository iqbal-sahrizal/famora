-- Migration 0016: Collaborative Family Shopping Lists, Templates, Item History, and Realtime

-- 1. Multiple shopping lists
CREATE TABLE public.shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  store_name TEXT NOT NULL DEFAULT '',
  assigned_shopper_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_lists_family ON public.shopping_lists(family_id, is_archived);
CREATE TRIGGER trg_shopping_lists_updated_at
  BEFORE UPDATE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Extend shopping_items for collaborative & offline-ready operations
ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS estimated_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (estimated_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 300),
  ADD COLUMN IF NOT EXISTS assigned_shopper_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_mutation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shopping_items_client_mutation
  ON public.shopping_items(family_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON public.shopping_items(list_id, is_checked);

-- 3. Shopping list templates
CREATE TABLE public.shopping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  items_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_templates_family ON public.shopping_templates(family_id);
CREATE TRIGGER trg_shopping_templates_updated_at
  BEFORE UPDATE ON public.shopping_templates
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Item purchase history for quick re-add
CREATE TABLE public.shopping_item_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL CHECK (char_length(trim(item_name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'Groceries',
  last_quantity TEXT NOT NULL DEFAULT '1',
  last_unit TEXT NOT NULL DEFAULT 'pcs',
  last_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (last_price_cents >= 0),
  purchase_count INTEGER NOT NULL DEFAULT 1 CHECK (purchase_count >= 1),
  last_purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_shopping_history_item UNIQUE (family_id, item_name)
);

CREATE INDEX idx_shopping_history_family_count ON public.shopping_item_history(family_id, purchase_count DESC);
CREATE TRIGGER trg_shopping_item_history_updated_at
  BEFORE UPDATE ON public.shopping_item_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_item_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_item_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.shopping_lists, public.shopping_templates, public.shopping_item_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists, public.shopping_templates, public.shopping_item_history TO authenticated;

CREATE POLICY "shopping_lists_select_member" ON public.shopping_lists
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "shopping_lists_write_permitted" ON public.shopping_lists
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

CREATE POLICY "shopping_templates_select_member" ON public.shopping_templates
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "shopping_templates_write_permitted" ON public.shopping_templates
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

CREATE POLICY "shopping_history_select_member" ON public.shopping_item_history
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "shopping_history_write_permitted" ON public.shopping_item_history
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

-- Enable Realtime replication if publication exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
