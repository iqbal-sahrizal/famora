"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  adjustInventorySchema,
  createHomeAssetSchema,
  createInventoryItemSchema,
  createMaintenanceTaskSchema,
  createMealPlanSchema,
  createRecipeSchema,
  createServiceProviderSchema,
} from "./schemas";

async function getMemberWithPerm(familyId: string, userId: string, perm: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: perms }, { data: member }] = await Promise.all([
    supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
    supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle<{ id: string }>(),
  ]);
  const allowed = ((perms as Array<{ permission_key: string }>) ?? []).some(
    (p) => p.permission_key === perm
  );
  return { supabase, memberId: member?.id ?? null, allowed };
}

export async function createInventoryItemAction(
  input: z.infer<typeof createInventoryItemSchema>
) {
  const user = await requireAuthenticatedUser();
  const parsed = createInventoryItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid inventory item." };

  const { supabase, memberId, allowed } = await getMemberWithPerm(
    parsed.data.familyId,
    user.id,
    "inventory.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: inventory.manage" };

  const { data: created, error } = await supabase
    .from("inventory_items")
    .insert({
      family_id: parsed.data.familyId,
      name: parsed.data.name,
      category: parsed.data.category,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      min_threshold: parsed.data.minThreshold,
      expires_on: parsed.data.expiresOn,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) return { ok: false, error: error?.message ?? "Failed." };

  await supabase.from("inventory_movements").insert({
    family_id: parsed.data.familyId,
    item_id: created.id,
    member_id: memberId,
    delta_quantity: parsed.data.quantity,
    reason: "restock",
  });

  revalidatePath(routes.familyDomain(parsed.data.familyId, "inventory"));
  return { ok: true };
}

export async function adjustInventoryAction(
  input: z.infer<typeof adjustInventorySchema>
) {
  const user = await requireAuthenticatedUser();
  const parsed = adjustInventorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid adjustment." };

  const { supabase, memberId, allowed } = await getMemberWithPerm(
    parsed.data.familyId,
    user.id,
    "inventory.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: inventory.manage" };

  const { data: item } = await supabase
    .from("inventory_items")
    .select("name, quantity, min_threshold")
    .eq("id", parsed.data.itemId)
    .eq("family_id", parsed.data.familyId)
    .maybeSingle();

  if (!item) return { ok: false, error: "Item not found." };

  const nextQty = Math.max(0, Number(item.quantity) + parsed.data.delta);
  const { error } = await supabase
    .from("inventory_items")
    .update({ quantity: nextQty })
    .eq("id", parsed.data.itemId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("inventory_movements").insert({
    family_id: parsed.data.familyId,
    item_id: parsed.data.itemId,
    member_id: memberId,
    delta_quantity: parsed.data.delta,
    reason: parsed.data.reason,
  });

  if (nextQty <= Number(item.min_threshold) && memberId) {
    await supabase.from("notifications").insert({
      family_id: parsed.data.familyId,
      recipient_member_id: memberId,
      domain: "inventory",
      title: `Low stock: ${item.name}`,
      body: `Only ${nextQty} remaining`,
      deep_link: routes.familyDomain(parsed.data.familyId, "inventory"),
    });
  }

  revalidatePath(routes.familyDomain(parsed.data.familyId, "inventory"));
  return { ok: true };
}

export async function restockToShoppingAction(params: {
  familyId: string;
  itemName: string;
  unit: string;
}) {
  const user = await requireAuthenticatedUser();
  const { supabase, memberId, allowed } = await getMemberWithPerm(
    params.familyId,
    user.id,
    "inventory.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: inventory.manage" };

  const { error } = await supabase.from("shopping_items").insert({
    family_id: params.familyId,
    name: params.itemName,
    category: "Groceries",
    quantity: "1",
    unit: params.unit,
    added_by_member_id: memberId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.familyDomain(params.familyId, "shopping"));
  return { ok: true };
}

export async function createRecipeAction(input: z.infer<typeof createRecipeSchema>) {
  const user = await requireAuthenticatedUser();
  const parsed = createRecipeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid recipe." };

  const { supabase, allowed } = await getMemberWithPerm(
    parsed.data.familyId,
    user.id,
    "meals.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: meals.manage" };

  const { error } = await supabase.from("recipes").insert({
    family_id: parsed.data.familyId,
    title: parsed.data.title,
    prep_minutes: parsed.data.prepMinutes,
    servings: parsed.data.servings,
    dietary_tags: parsed.data.dietaryTags,
    ingredients_jsonb: parsed.data.ingredients,
    instructions: parsed.data.instructions,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.familyDomain(parsed.data.familyId, "meals"));
  return { ok: true };
}

export async function createMealPlanAction(
  input: z.infer<typeof createMealPlanSchema>
) {
  const user = await requireAuthenticatedUser();
  const parsed = createMealPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid meal plan." };

  const { supabase, allowed } = await getMemberWithPerm(
    parsed.data.familyId,
    user.id,
    "meals.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: meals.manage" };

  const { error } = await supabase.from("meal_plans").insert({
    family_id: parsed.data.familyId,
    planned_on: parsed.data.plannedOn,
    meal_slot: parsed.data.mealSlot,
    recipe_id: parsed.data.recipeId,
    custom_title: parsed.data.customTitle,
    preferences_note: parsed.data.preferencesNote,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.familyDomain(parsed.data.familyId, "meals"));
  return { ok: true };
}

export async function syncMealIngredientsToShoppingAction(params: {
  familyId: string;
  ingredients: Array<{ name: string; quantity: string; unit: string }>;
}) {
  const user = await requireAuthenticatedUser();
  const { supabase, memberId, allowed } = await getMemberWithPerm(
    params.familyId,
    user.id,
    "meals.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: meals.manage" };
  if (params.ingredients.length === 0) return { ok: false, error: "No ingredients to add." };

  const { error } = await supabase.from("shopping_items").insert(
    params.ingredients.map((ing) => ({
      family_id: params.familyId,
      name: ing.name,
      category: "Groceries",
      quantity: ing.quantity || "1",
      unit: ing.unit || "pcs",
      added_by_member_id: memberId,
    }))
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.familyDomain(params.familyId, "shopping"));
  return { ok: true };
}

export async function createHomeAssetAction(
  input: z.infer<typeof createHomeAssetSchema>
) {
  const user = await requireAuthenticatedUser();
  const parsed = createHomeAssetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid home asset." };

  const { supabase, allowed } = await getMemberWithPerm(
    parsed.data.familyId,
    user.id,
    "home.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: home.manage" };

  const { error } = await supabase.from("home_assets").insert({
    family_id: parsed.data.familyId,
    name: parsed.data.name,
    category: parsed.data.category,
    brand_model: parsed.data.brandModel,
    purchased_on: parsed.data.purchasedOn,
    warranty_expires_on: parsed.data.warrantyExpiresOn,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.familyDomain(parsed.data.familyId, "home"));
  return { ok: true };
}

export async function createMaintenanceTaskAction(
  input: z.infer<typeof createMaintenanceTaskSchema>
) {
  const user = await requireAuthenticatedUser();
  const parsed = createMaintenanceTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid maintenance task." };

  const { supabase, memberId, allowed } = await getMemberWithPerm(
    parsed.data.familyId,
    user.id,
    "home.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: home.manage" };

  let calendarEventId: string | null = null;
  if (parsed.data.syncToCalendar) {
    const { data: cal } = await supabase
      .from("calendar_events")
      .insert({
        family_id: parsed.data.familyId,
        created_by_member_id: memberId,
        title: `Home Maintenance: ${parsed.data.title}`,
        start_at: `${parsed.data.nextDueOn}T09:00:00Z`,
        end_at: `${parsed.data.nextDueOn}T10:00:00Z`,
        category: "home",
        color_token: "sage",
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    calendarEventId = cal?.id ?? null;
  }

  const { error } = await supabase.from("home_maintenance_tasks").insert({
    family_id: parsed.data.familyId,
    asset_id: parsed.data.assetId,
    provider_id: parsed.data.providerId,
    title: parsed.data.title,
    interval_days: parsed.data.intervalDays,
    next_due_on: parsed.data.nextDueOn,
    calendar_event_id: calendarEventId,
  });
  if (error) return { ok: false, error: error.message };

  if (memberId) {
    await supabase.from("notifications").insert({
      family_id: parsed.data.familyId,
      recipient_member_id: memberId,
      domain: "home",
      title: `Maintenance reminder: ${parsed.data.title}`,
      body: `Scheduled for ${parsed.data.nextDueOn}`,
      deep_link: routes.familyDomain(parsed.data.familyId, "home"),
      scheduled_for: `${parsed.data.nextDueOn}T08:00:00Z`,
    });
  }

  revalidatePath(routes.familyDomain(parsed.data.familyId, "home"));
  revalidatePath(routes.familyDomain(parsed.data.familyId, "calendar"));
  return { ok: true };
}

export async function completeMaintenanceTaskAction(params: {
  familyId: string;
  taskId: string;
  intervalDays: number;
}) {
  const user = await requireAuthenticatedUser();
  const { supabase, memberId, allowed } = await getMemberWithPerm(
    params.familyId,
    user.id,
    "home.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: home.manage" };

  const today = new Date().toISOString().slice(0, 10);
  const nextDate = new Date(Date.now() + params.intervalDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await supabase.from("home_maintenance_history").insert({
    family_id: params.familyId,
    maintenance_task_id: params.taskId,
    completed_by_member_id: memberId,
    completed_on: today,
  });

  const { error } = await supabase
    .from("home_maintenance_tasks")
    .update({ last_completed_on: today, next_due_on: nextDate })
    .eq("id", params.taskId)
    .eq("family_id", params.familyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(params.familyId, "home"));
  return { ok: true };
}

export async function createServiceProviderAction(
  input: z.infer<typeof createServiceProviderSchema>
) {
  const user = await requireAuthenticatedUser();
  const parsed = createServiceProviderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid service provider." };

  const { supabase, allowed } = await getMemberWithPerm(
    parsed.data.familyId,
    user.id,
    "home.manage"
  );
  if (!allowed) return { ok: false, error: "Missing permission: home.manage" };

  const { error } = await supabase.from("home_service_providers").insert({
    family_id: parsed.data.familyId,
    name: parsed.data.name,
    specialty: parsed.data.specialty,
    phone: parsed.data.phone,
    email: parsed.data.email,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.familyDomain(parsed.data.familyId, "home"));
  return { ok: true };
}
