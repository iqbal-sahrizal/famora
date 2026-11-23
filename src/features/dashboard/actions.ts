"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const quickTaskSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1, "Enter a task title.").max(160),
});

const quickShoppingSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1, "Enter an item name.").max(120),
});

const toggleShoppingSchema = z.object({
  familyId: z.string().uuid(),
  itemId: z.string().uuid(),
  isChecked: z.boolean(),
});

export async function quickAddTaskAction(input: {
  familyId: string;
  title: string;
}) {
  await requireAuthenticatedUser();
  const parsed = quickTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("tasks").insert({
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      status: "todo",
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not add task.",
    };
  }
}

export async function quickAddShoppingItemAction(input: {
  familyId: string;
  name: string;
}) {
  await requireAuthenticatedUser();
  const parsed = quickShoppingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid item." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("shopping_items").insert({
      family_id: parsed.data.familyId,
      name: parsed.data.name,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not add shopping item.",
    };
  }
}

export async function toggleShoppingItemAction(input: {
  familyId: string;
  itemId: string;
  isChecked: boolean;
}) {
  await requireAuthenticatedUser();
  const parsed = toggleShoppingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid shopping item." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("shopping_items")
      .update({ is_checked: parsed.data.isChecked })
      .eq("id", parsed.data.itemId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update item.",
    };
  }
}
