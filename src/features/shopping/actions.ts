"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyFamilyMember, notifyFamilyMembers } from "@/features/notifications/triggers";
import {
  addShoppingItemSchema,
  createShoppingListSchema,
  deleteShoppingItemSchema,
  deleteShoppingListSchema,
  saveTemplateSchema,
  toggleShoppingCheckSchema,
  updateShoppingItemSchema,
  updateShoppingListSchema,
  updateShoppingQuantitySchema,
  type AddShoppingItemInput,
  type CreateShoppingListInput,
  type DeleteShoppingItemInput,
  type DeleteShoppingListInput,
  type SaveTemplateInput,
  type ToggleShoppingCheckInput,
  type UpdateShoppingItemInput,
  type UpdateShoppingListInput,
  type UpdateShoppingQuantityInput,
} from "./schemas";

export interface ShoppingActionResult {
  ok: boolean;
  error?: string;
}

async function hasShoppingManagePermission(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  familyId: string
): Promise<boolean> {
  const { data: perms } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: familyId,
  });
  return ((perms as Array<{ permission_key: string }>) ?? []).some(
    (p) => p.permission_key === "shopping.manage"
  );
}

export async function createShoppingListAction(
  input: CreateShoppingListInput
): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = createShoppingListSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid list." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }
    if (!(await hasShoppingManagePermission(supabase, parsed.data.familyId))) {
      return { ok: false, error: "You do not have permission to manage shopping lists." };
    }

    const { error } = await supabase.from("shopping_lists").insert({
      family_id: parsed.data.familyId,
      name: parsed.data.name,
      store_name: parsed.data.storeName,
      assigned_shopper_member_id: parsed.data.assignedShopperMemberId,
      created_by_member_id: actor.id,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create list.",
    };
  }
}

export async function updateShoppingListAction(
  input: UpdateShoppingListInput
): Promise<ShoppingActionResult> {
  await requireAuthenticatedUser();
  const parsed = updateShoppingListSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid list." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const allowed = await hasShoppingManagePermission(supabase, parsed.data.familyId);
    if (!allowed) {
      return { ok: false, error: "You do not have permission to edit shopping lists." };
    }

    const { data: updated, error } = await supabase
      .from("shopping_lists")
      .update({
        name: parsed.data.name,
        store_name: parsed.data.storeName,
        assigned_shopper_member_id: parsed.data.assignedShopperMemberId,
      })
      .eq("id", parsed.data.listId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Shopping list not found." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update list.",
    };
  }
}

export async function deleteShoppingListAction(
  input: DeleteShoppingListInput
): Promise<ShoppingActionResult> {
  await requireAuthenticatedUser();
  const parsed = deleteShoppingListSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid list." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const allowed = await hasShoppingManagePermission(supabase, parsed.data.familyId);
    if (!allowed) {
      return { ok: false, error: "You do not have permission to delete shopping lists." };
    }

    const { data: deleted, error } = await supabase
      .from("shopping_lists")
      .delete()
      .eq("id", parsed.data.listId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!deleted) return { ok: false, error: "Shopping list not found." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete list.",
    };
  }
}

export async function addShoppingItemAction(
  input: AddShoppingItemInput
): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = addShoppingItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid item." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }
    if (!(await hasShoppingManagePermission(supabase, parsed.data.familyId))) {
      return { ok: false, error: "You do not have permission to manage shopping items." };
    }

    const payload = {
      family_id: parsed.data.familyId,
      list_id: parsed.data.listId,
      name: parsed.data.name,
      category: parsed.data.category,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      estimated_price_cents: parsed.data.estimatedPriceCents,
      notes: parsed.data.notes,
      assigned_shopper_member_id: parsed.data.assignedShopperMemberId,
      added_by_member_id: actor.id,
      client_mutation_id: parsed.data.clientMutationId ?? null,
    };

    if (parsed.data.clientMutationId) {
      const { data: existingItem } = await supabase
        .from("shopping_items")
        .select("id")
        .eq("family_id", parsed.data.familyId)
        .eq("client_mutation_id", parsed.data.clientMutationId)
        .maybeSingle<{ id: string }>();

      if (existingItem) {
        revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
        revalidatePath(routes.familyDashboard(parsed.data.familyId));
        return { ok: true };
      }
    }

    const { error } = await supabase.from("shopping_items").insert(payload);

    if (error && error.code !== "23505") {
      return { ok: false, error: error.message };
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    if (parsed.data.assignedShopperMemberId) {
      void notifyFamilyMember({
        familyId: parsed.data.familyId,
        recipientMemberId: parsed.data.assignedShopperMemberId,
        excludeMemberId: actor.id,
        category: "shopping",
        domain: "shopping",
        title: "Daftar Belanja Diperbarui",
        body: "Ada item belanja baru untuk Anda.",
        deepLink: routes.familyDomain(parsed.data.familyId, "shopping"),
        idempotencyKey: `shopping-item:${parsed.data.familyId}:${Date.now()}:${parsed.data.assignedShopperMemberId}`,
      });
    } else {
      void notifyFamilyMembers({
        familyId: parsed.data.familyId,
        excludeMemberId: actor.id,
        category: "shopping",
        domain: "shopping",
        title: "Daftar Belanja Diperbarui",
        body: "Ada item belanja keluarga baru.",
        deepLink: routes.familyDomain(parsed.data.familyId, "shopping"),
        idempotencyPrefix: `shopping-item:${parsed.data.familyId}:${Date.now()}`,
      });
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to add item.",
    };
  }
}

export async function toggleShoppingCheckAction(
  input: ToggleShoppingCheckInput
): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = toggleShoppingCheckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid check toggle." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }
    if (!(await hasShoppingManagePermission(supabase, parsed.data.familyId))) {
      return { ok: false, error: "You do not have permission to manage shopping items." };
    }

    const { data: item, error } = await supabase
      .from("shopping_items")
      .update({
        is_checked: parsed.data.isChecked,
        checked_by_member_id: parsed.data.isChecked ? actor.id : null,
        checked_at: parsed.data.isChecked ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.itemId)
      .eq("family_id", parsed.data.familyId)
      .select("name, category, quantity, unit, estimated_price_cents")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!item) return { ok: false, error: "Shopping item not found." };

    // Record into shopping_item_history when checked as purchased
    if (parsed.data.isChecked && item) {
      await supabase.from("shopping_item_history").upsert(
        {
          family_id: parsed.data.familyId,
          item_name: item.name,
          category: item.category,
          last_quantity: item.quantity,
          last_unit: item.unit,
          last_price_cents: item.estimated_price_cents,
          last_purchased_at: new Date().toISOString(),
        },
        { onConflict: "family_id,item_name" }
      );

      // Sync purchased shopping item with price into Finance expenses (idempotent per itemId)
      if (Number(item.estimated_price_cents) > 0) {
        try {
          let accountId: string | null = null;
          if (parsed.data.financeAccountId) {
            const { data: chosen } = await supabase
              .from("finance_accounts")
              .select("id")
              .eq("id", parsed.data.financeAccountId)
              .eq("family_id", parsed.data.familyId)
              .eq("is_archived", false)
              .maybeSingle<{ id: string }>();
            accountId = chosen?.id ?? null;
          }
          if (!accountId) {
            const { data: account } = await supabase
              .from("finance_accounts")
              .select("id")
              .eq("family_id", parsed.data.familyId)
              .eq("is_archived", false)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle<{ id: string }>();
            accountId = account?.id ?? null;
          }

          if (accountId) {
            const amount = Number((Number(item.estimated_price_cents) / 100).toFixed(2));
            await supabase.rpc("record_finance_transaction", {
              p_family_id: parsed.data.familyId,
              p_account_id: accountId,
              p_kind: "expense",
              p_amount: amount,
              p_merchant: item.name,
              p_category: item.category || "Shopping",
              p_occurred_on: new Date().toISOString().slice(0, 10),
              p_notes: `Belanja Keluarga (${item.quantity} ${item.unit})`,
              p_transfer_account_id: null,
              p_attachment_name: null,
              p_idempotency_key: `shopping-purchase:${parsed.data.itemId}`,
            });
            revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
            revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
            revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
          }
        } catch {
          // Non-blocking: shopping check still succeeds if user lacks finance permissions or accounts
        }
      }
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update item.",
    };
  }
}

export async function updateShoppingQuantityAction(
  input: UpdateShoppingQuantityInput
): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = updateShoppingQuantitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid quantity." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }
    if (!(await hasShoppingManagePermission(supabase, parsed.data.familyId))) {
      return { ok: false, error: "You do not have permission to manage shopping items." };
    }

    const { data: updated, error } = await supabase
      .from("shopping_items")
      .update({ quantity: parsed.data.quantity })
      .eq("id", parsed.data.itemId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Shopping item not found." };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update quantity.",
    };
  }
}

export async function updateShoppingItemAction(
  input: UpdateShoppingItemInput
): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = updateShoppingItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid item." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }

    if (!(await hasShoppingManagePermission(supabase, parsed.data.familyId))) {
      return { ok: false, error: "You do not have permission to manage shopping items." };
    }

    const { data: updated, error } = await supabase
      .from("shopping_items")
      .update({
        name: parsed.data.name,
        category: parsed.data.category,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        estimated_price_cents: parsed.data.estimatedPriceCents,
        notes: parsed.data.notes,
      })
      .eq("id", parsed.data.itemId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Shopping item not found." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update item.",
    };
  }
}

export async function deleteShoppingItemAction(
  input: DeleteShoppingItemInput
): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = deleteShoppingItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid item." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }

    if (!(await hasShoppingManagePermission(supabase, parsed.data.familyId))) {
      return { ok: false, error: "You do not have permission to manage shopping items." };
    }

    const { data: deleted, error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("id", parsed.data.itemId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!deleted) return { ok: false, error: "Shopping item not found." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete item.",
    };
  }
}

export async function saveShoppingTemplateAction(
  input: SaveTemplateInput
): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = saveTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid template." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }
    if (!(await hasShoppingManagePermission(supabase, parsed.data.familyId))) {
      return { ok: false, error: "You do not have permission to manage shopping templates." };
    }

    const { error } = await supabase.from("shopping_templates").insert({
      family_id: parsed.data.familyId,
      name: parsed.data.name,
      items_jsonb: parsed.data.items,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save template.",
    };
  }
}

export async function applyShoppingTemplateAction(params: {
  familyId: string;
  listId: string | null;
  templateId: string;
}): Promise<ShoppingActionResult> {
  const user = await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: actor }, allowed, { data: tpl }] = await Promise.all([
      supabase
        .from("family_members")
        .select("id")
        .eq("family_id", params.familyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string }>(),
      hasShoppingManagePermission(supabase, params.familyId),
      supabase
        .from("shopping_templates")
        .select("items_jsonb")
        .eq("id", params.templateId)
        .eq("family_id", params.familyId)
        .maybeSingle(),
    ]);

    if (!actor) {
      return { ok: false, error: "Not an active member of this family." };
    }
    if (!allowed) {
      return { ok: false, error: "You do not have permission to apply shopping templates." };
    }

    const items = Array.isArray(tpl?.items_jsonb)
      ? (tpl.items_jsonb as Array<{
          name: string;
          category?: string;
          quantity?: string;
          unit?: string;
        }>)
      : [];

    if (items.length === 0) return { ok: false, error: "Template has no items." };

    const { error } = await supabase.from("shopping_items").insert(
      items.map((item) => ({
        family_id: params.familyId,
        list_id: params.listId,
        name: item.name,
        category: item.category ?? "Groceries",
        quantity: item.quantity ?? "1",
        unit: item.unit ?? "pcs",
        added_by_member_id: actor.id,
      }))
    );

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(params.familyId, "shopping"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to apply template.",
    };
  }
}
