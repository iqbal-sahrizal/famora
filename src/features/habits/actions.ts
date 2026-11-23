"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import { createHabitSchema, updateHabitSchema } from "./validation";

export async function createHabitAction(input: {
  familyId: string;
  scope?: "personal" | "family_challenge";
  category:
    | "reading"
    | "exercise"
    | "sleep"
    | "mindfulness"
    | "learning"
    | "routine"
    | "other";
  title: string;
  description?: string;
  cadence?: "daily" | "weekly";
  targetPerPeriod?: number;
  targetUnit?: "times" | "minutes" | "pages" | "hours";
  reminderTime?: string | null;
}) {
  const parsed = createHabitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid habit details.",
    };
  }

  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: perms }, { data: actor }] = await Promise.all([
    supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    }),
    supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>(),
  ]);

  if (!actor) return { ok: false, error: "Active membership required." };
  const permSet = new Set(
    ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
      (p) => p.permission_key
    )
  );
  if (
    parsed.data.scope === "family_challenge" &&
    !permSet.has("habits.manage_all")
  ) {
    return {
      ok: false,
      error: "Only authorized adults can launch family challenges.",
    };
  }

  const { error } = await supabase.from("habits").insert({
    family_id: parsed.data.familyId,
    owner_member_id: actor.id,
    scope: parsed.data.scope,
    category: parsed.data.category,
    title: parsed.data.title,
    description: parsed.data.description,
    cadence: parsed.data.cadence,
    target_per_period: parsed.data.targetPerPeriod,
    target_unit: parsed.data.targetUnit,
    reminder_time: parsed.data.reminderTime,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "habits"));
  return { ok: true };
}

export async function updateHabitAction(input: {
  familyId: string;
  habitId: string;
  category:
    | "reading"
    | "exercise"
    | "sleep"
    | "mindfulness"
    | "learning"
    | "routine"
    | "other";
  title: string;
  description?: string;
  cadence?: "daily" | "weekly";
  targetPerPeriod?: number;
  targetUnit?: "times" | "minutes" | "pages" | "hours";
  reminderTime?: string | null;
}) {
  const parsed = updateHabitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid habit details.",
    };
  }

  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: perms }, { data: actor }] = await Promise.all([
    supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    }),
    supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>(),
  ]);

  if (!actor) return { ok: false, error: "Active membership required." };
  const permSet = new Set(
    ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
      (p) => p.permission_key
    )
  );

  const { data: existing, error: fetchError } = await supabase
    .from("habits")
    .select("id, owner_member_id")
    .eq("id", parsed.data.habitId)
    .eq("family_id", parsed.data.familyId)
    .maybeSingle<{ id: string; owner_member_id: string | null }>();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing) return { ok: false, error: "Habit not found." };

  if (existing.owner_member_id !== actor.id && !permSet.has("habits.manage_all")) {
    return { ok: false, error: "Not authorized to edit this habit." };
  }

  const { error } = await supabase
    .from("habits")
    .update({
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      cadence: parsed.data.cadence,
      target_per_period: parsed.data.targetPerPeriod,
      target_unit: parsed.data.targetUnit,
      reminder_time: parsed.data.reminderTime,
    })
    .eq("id", parsed.data.habitId)
    .eq("family_id", parsed.data.familyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "habits"));
  return { ok: true };
}

export async function logHabitCompletionAction(input: {
  familyId: string;
  habitId: string;
  valueCompleted?: number;
  logDate?: string;
}) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();

  const { data: actor } = await supabase
    .from("family_members")
    .select("id")
    .eq("family_id", input.familyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();

  if (!actor) return { ok: false, error: "Active membership required." };

  const logDate = input.logDate ?? new Date().toISOString().slice(0, 10);
  const increment = Math.max(1, Math.min(1000, input.valueCompleted ?? 1));

  const { data: existing } = await supabase
    .from("habit_logs")
    .select("id, value_completed")
    .eq("habit_id", input.habitId)
    .eq("member_id", actor.id)
    .eq("log_date", logDate)
    .maybeSingle<{ id: string; value_completed: number }>();

  if (existing) {
    const { error } = await supabase
      .from("habit_logs")
      .update({ value_completed: existing.value_completed + increment })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("habit_logs").insert({
      family_id: input.familyId,
      habit_id: input.habitId,
      member_id: actor.id,
      log_date: logDate,
      value_completed: increment,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(routes.familyDomain(input.familyId, "habits"));
  return { ok: true };
}

export async function archiveHabitAction(input: {
  familyId: string;
  habitId: string;
}) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();

  const { data: actor } = await supabase
    .from("family_members")
    .select("id")
    .eq("family_id", input.familyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();

  if (!actor) return { ok: false, error: "Active membership required." };

  const { error } = await supabase
    .from("habits")
    .update({ is_active: false })
    .eq("id", input.habitId)
    .eq("family_id", input.familyId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(input.familyId, "habits"));
  return { ok: true };
}
