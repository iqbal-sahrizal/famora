"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { toggleTaskStatusAction } from "@/features/tasks/actions";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";

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

async function getDashboardActorContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  familyId: string,
  userId: string
) {
  const [{ data: actor }, { data: perms }] = await Promise.all([
    supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle<{ id: string }>(),
    supabase.rpc("get_my_family_permissions", {
      p_family_id: familyId,
    }),
  ]);
  const permSet = new Set(
    ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
      (p) => p.permission_key
    )
  );
  return { actorId: actor?.id ?? null, permSet };
}

export async function quickAddTaskAction(input: {
  familyId: string;
  title: string;
}) {
  const user = await requireAuthenticatedUser();
  const parsed = quickTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { actorId, permSet } = await getDashboardActorContext(
      supabase,
      parsed.data.familyId,
      user.id
    );
    if (!actorId) {
      return { ok: false, error: "Active family membership required." };
    }
    if (!permSet.has("tasks.manage_all")) {
      return { ok: false, error: "Missing permission: tasks.manage_all" };
    }

    const { error } = await supabase.from("tasks").insert({
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      status: "todo",
      created_by_member_id: actorId,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
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
  const user = await requireAuthenticatedUser();
  const parsed = quickShoppingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid item." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { actorId, permSet } = await getDashboardActorContext(
      supabase,
      parsed.data.familyId,
      user.id
    );
    if (!actorId) {
      return { ok: false, error: "Active family membership required." };
    }
    if (!permSet.has("shopping.manage")) {
      return { ok: false, error: "Missing permission: shopping.manage" };
    }

    const { error } = await supabase.from("shopping_items").insert({
      family_id: parsed.data.familyId,
      name: parsed.data.name,
      added_by_member_id: actorId,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
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
  const user = await requireAuthenticatedUser();
  const parsed = toggleShoppingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid shopping item." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { actorId, permSet } = await getDashboardActorContext(
      supabase,
      parsed.data.familyId,
      user.id
    );
    if (!actorId) {
      return { ok: false, error: "Active family membership required." };
    }
    if (!permSet.has("shopping.manage")) {
      return { ok: false, error: "Missing permission: shopping.manage" };
    }

    const { data: updated, error } = await supabase
      .from("shopping_items")
      .update({
        is_checked: parsed.data.isChecked,
        checked_by_member_id: parsed.data.isChecked ? actorId : null,
        checked_at: parsed.data.isChecked ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.itemId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Shopping item not found." };

    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update item.",
    };
  }
}

const quickCompleteTaskSchema = z.object({
  familyId: z.string().uuid(),
  taskId: z.string().uuid(),
});

export async function quickCompleteTaskAction(input: {
  familyId: string;
  taskId: string;
}) {
  const parsed = quickCompleteTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid task." };
  }

  return toggleTaskStatusAction({
    familyId: parsed.data.familyId,
    taskId: parsed.data.taskId,
    nextStatus: "done",
  });
}
