import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";

export async function getInventoryPageData(familyId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: perms }, { data: items }, { data: movements }] = await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase.from("inventory_items").select("*").eq("family_id", familyId).order("name"),
      supabase
        .from("inventory_movements")
        .select("id, item_id, delta_quantity, reason, created_at, inventory_items(name)")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const canManage = ((perms as Array<{ permission_key: PermissionKey }>) ?? []).some(
      (p) => p.permission_key === "inventory.manage"
    );

    return {
      canManage,
      items: (items ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        quantity: Number(i.quantity),
        unit: i.unit,
        minThreshold: Number(i.min_threshold),
        expiresOn: i.expires_on as string | null,
      })),
      movements: (
        (movements as unknown as Array<{
          id: string;
          delta_quantity: number;
          reason: string;
          created_at: string;
          inventory_items: { name: string } | null;
        }>) ?? []
      ).map((m) => ({
        id: m.id,
        itemName: m.inventory_items?.name ?? "Item",
        deltaQuantity: Number(m.delta_quantity),
        reason: m.reason,
        createdAt: m.created_at,
      })),
    };
  } catch {
    return { canManage: false, items: [], movements: [] };
  }
}

export async function getMealsPageData(familyId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: perms }, { data: recipes }, { data: plans }] = await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase.from("recipes").select("*").eq("family_id", familyId).order("created_at", { ascending: false }),
      supabase
        .from("meal_plans")
        .select("id, planned_on, meal_slot, recipe_id, custom_title, preferences_note, is_completed, recipes(title, ingredients_jsonb)")
        .eq("family_id", familyId)
        .order("planned_on", { ascending: true }),
    ]);

    const canManage = ((perms as Array<{ permission_key: PermissionKey }>) ?? []).some(
      (p) => p.permission_key === "meals.manage"
    );

    return {
      canManage,
      recipes: (recipes ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        prepMinutes: r.prep_minutes,
        servings: r.servings,
        dietaryTags: (r.dietary_tags as string[]) ?? [],
        ingredients: Array.isArray(r.ingredients_jsonb)
          ? (r.ingredients_jsonb as Array<{ name: string; quantity: string; unit: string }>)
          : [],
      })),
      plans: (
        (plans as unknown as Array<{
          id: string;
          planned_on: string;
          meal_slot: "breakfast" | "lunch" | "dinner";
          recipe_id: string | null;
          custom_title: string;
          preferences_note: string;
          is_completed: boolean;
          recipes: { title: string; ingredients_jsonb: unknown } | null;
        }>) ?? []
      ).map((p) => ({
        id: p.id,
        plannedOn: p.planned_on,
        mealSlot: p.meal_slot,
        title: p.recipes?.title ?? p.custom_title,
        preferencesNote: p.preferences_note,
        isCompleted: p.is_completed,
        ingredients: Array.isArray(p.recipes?.ingredients_jsonb)
          ? (p.recipes.ingredients_jsonb as Array<{ name: string; quantity: string; unit: string }>)
          : [],
      })),
    };
  } catch {
    return { canManage: false, recipes: [], plans: [] };
  }
}

export async function getHomePageData(familyId: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: familyId,
    });
    const canManage = ((perms as Array<{ permission_key: PermissionKey }>) ?? []).some(
      (p) => p.permission_key === "home.manage"
    );
    if (!canManage) {
      return { authorized: false, assets: [], tasks: [], providers: [], history: [] };
    }

    const [{ data: assets }, { data: tasks }, { data: providers }, { data: history }] =
      await Promise.all([
        supabase.from("home_assets").select("*").eq("family_id", familyId).order("name"),
        supabase.from("home_maintenance_tasks").select("*").eq("family_id", familyId).order("next_due_on"),
        supabase.from("home_service_providers").select("*").eq("family_id", familyId).order("name"),
        supabase
          .from("home_maintenance_history")
          .select("id, completed_on, notes, home_maintenance_tasks(title)")
          .eq("family_id", familyId)
          .order("completed_on", { ascending: false })
          .limit(20),
      ]);

    return {
      authorized: true,
      assets: (assets ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        brandModel: a.brand_model,
        purchasedOn: a.purchased_on as string | null,
        warrantyExpiresOn: a.warranty_expires_on as string | null,
      })),
      tasks: (tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        intervalDays: t.interval_days,
        nextDueOn: t.next_due_on,
        lastCompletedOn: t.last_completed_on as string | null,
      })),
      providers: (providers ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        specialty: p.specialty,
        phone: p.phone,
        email: p.email,
      })),
      history: (
        (history as unknown as Array<{
          id: string;
          completed_on: string;
          notes: string;
          home_maintenance_tasks: { title: string } | null;
        }>) ?? []
      ).map((h) => ({
        id: h.id,
        taskTitle: h.home_maintenance_tasks?.title ?? "Maintenance",
        completedOn: h.completed_on,
        notes: h.notes,
      })),
    };
  } catch {
    return { authorized: false, assets: [], tasks: [], providers: [], history: [] };
  }
}
