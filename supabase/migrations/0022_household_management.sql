-- Migration 0022: Household Inventory, Meal Planning, and Home Asset Management

-- 1. Inventory
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'pantry' CHECK (category IN ('pantry', 'fridge', 'freezer', 'cleaning', 'medicine', 'supplies')),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  min_threshold NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (min_threshold >= 0),
  expires_on DATE,
  last_purchased_on DATE,
  last_purchase_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (last_purchase_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_items_family ON public.inventory_items(family_id, category);
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  delta_quantity NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'consumed', 'expired', 'adjustment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_movements_item ON public.inventory_movements(item_id, created_at DESC);
CREATE TRIGGER trg_inventory_movements_updated_at
  BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Meal Planning & Recipes
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  prep_minutes INTEGER NOT NULL DEFAULT 25 CHECK (prep_minutes >= 0),
  servings INTEGER NOT NULL DEFAULT 4 CHECK (servings >= 1),
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  ingredients_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipes_family ON public.recipes(family_id);
CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  planned_on DATE NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner')),
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  custom_title TEXT NOT NULL DEFAULT '',
  preferences_note TEXT NOT NULL DEFAULT '',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meal_plans_family_date ON public.meal_plans(family_id, planned_on);
CREATE TRIGGER trg_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Home Management
CREATE TABLE public.home_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'appliance' CHECK (category IN ('appliance', 'hvac', 'vehicle', 'plumbing', 'electronics', 'structure')),
  brand_model TEXT NOT NULL DEFAULT '',
  purchased_on DATE,
  warranty_expires_on DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_assets_family ON public.home_assets(family_id);
CREATE TRIGGER trg_home_assets_updated_at
  BEFORE UPDATE ON public.home_assets
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.home_service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  specialty TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_providers_family ON public.home_service_providers(family_id);
CREATE TRIGGER trg_home_service_providers_updated_at
  BEFORE UPDATE ON public.home_service_providers
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.home_maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.home_assets(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.home_service_providers(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  interval_days INTEGER NOT NULL DEFAULT 90 CHECK (interval_days >= 1),
  next_due_on DATE NOT NULL,
  last_completed_on DATE,
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_maintenance_family_due ON public.home_maintenance_tasks(family_id, next_due_on);
CREATE TRIGGER trg_home_maintenance_tasks_updated_at
  BEFORE UPDATE ON public.home_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.home_maintenance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  maintenance_task_id UUID NOT NULL REFERENCES public.home_maintenance_tasks(id) ON DELETE CASCADE,
  completed_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  completed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_maint_history_task ON public.home_maintenance_history(maintenance_task_id, completed_on DESC);
CREATE TRIGGER trg_home_maintenance_history_updated_at
  BEFORE UPDATE ON public.home_maintenance_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.inventory_items, public.inventory_movements, public.recipes, public.meal_plans, public.home_assets, public.home_service_providers, public.home_maintenance_tasks, public.home_maintenance_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items, public.inventory_movements, public.recipes, public.meal_plans, public.home_assets, public.home_service_providers, public.home_maintenance_tasks, public.home_maintenance_history TO authenticated;

CREATE POLICY "inventory_items_select" ON public.inventory_items FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "inventory_items_write" ON public.inventory_items FOR ALL TO authenticated USING (famora.has_permission(family_id, 'inventory.manage')) WITH CHECK (famora.has_permission(family_id, 'inventory.manage'));
CREATE POLICY "inventory_movements_select" ON public.inventory_movements FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "inventory_movements_write" ON public.inventory_movements FOR ALL TO authenticated USING (famora.has_permission(family_id, 'inventory.manage')) WITH CHECK (famora.has_permission(family_id, 'inventory.manage'));

CREATE POLICY "recipes_select" ON public.recipes FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "recipes_write" ON public.recipes FOR ALL TO authenticated USING (famora.has_permission(family_id, 'meals.manage')) WITH CHECK (famora.has_permission(family_id, 'meals.manage'));
CREATE POLICY "meal_plans_select" ON public.meal_plans FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "meal_plans_write" ON public.meal_plans FOR ALL TO authenticated USING (famora.has_permission(family_id, 'meals.manage')) WITH CHECK (famora.has_permission(family_id, 'meals.manage'));

CREATE POLICY "home_assets_select" ON public.home_assets FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_assets_write" ON public.home_assets FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_providers_select" ON public.home_service_providers FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_providers_write" ON public.home_service_providers FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_select" ON public.home_maintenance_tasks FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_write" ON public.home_maintenance_tasks FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_hist_select" ON public.home_maintenance_history FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_hist_write" ON public.home_maintenance_history FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));
