"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
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

const quickCompleteTaskSchema = z.object({
  familyId: z.string().uuid(),
  taskId: z.string().uuid(),
});

export async function quickCompleteTaskAction(input: {
  familyId: string;
  taskId: string;
}) {
  const user = await requireAuthenticatedUser();
  const parsed = quickCompleteTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid task." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: actor }, { data: perms }, { data: task }] = await Promise.all([
      supabase
        .from("family_members")
        .select("id")
        .eq("family_id", parsed.data.familyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string }>(),
      supabase.rpc("get_my_family_permissions", {
        p_family_id: parsed.data.familyId,
      }),
      supabase
        .from("tasks")
        .select("id, family_id, assigned_member_id")
        .eq("id", parsed.data.taskId)
        .eq("family_id", parsed.data.familyId)
        .maybeSingle<{
          id: string;
          family_id: string;
          assigned_member_id: string | null;
        }>(),
    ]);

    if (!actor) {
      return { ok: false, error: "Active family membership required." };
    }
    if (!task) {
      return { ok: false, error: "Task not found." };
    }

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );
    let canComplete =
      permSet.has("tasks.manage_all") || task.assigned_member_id === actor.id;

    if (!canComplete) {
      const { data: assigneeRow } = await supabase
        .from("task_assignees")
        .select("member_id")
        .eq("task_id", task.id)
        .eq("member_id", actor.id)
        .maybeSingle<{ member_id: string }>();
      canComplete = Boolean(assigneeRow);
    }

    if (!canComplete) {
      return {
        ok: false,
        error: "You do not have permission to complete this task.",
      };
    }

    const { error } = await supabase
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.taskId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };

    await supabase.from("task_history").insert({
      family_id: parsed.data.familyId,
      task_id: parsed.data.taskId,
      actor_member_id: actor.id,
      action: "completed",
      details: { source: "dashboard_quick_complete" },
    });

    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not complete task.",
    };
  }
}
