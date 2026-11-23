"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  choreTemplateSchema,
  familyChallengeSchema,
  reviewChoreSchema,
  rewardItemSchema,
  submitChoreSchema,
  type ChoreTemplateInput,
  type FamilyChallengeInput,
  type ReviewChoreInput,
  type RewardItemInput,
  type SubmitChoreInput,
} from "./schemas";

export interface ChoresActionResult {
  ok: boolean;
  error?: string;
}

async function hasApproverPermission(familyId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: familyId,
  });
  return ((data as Array<{ permission_key: string }>) ?? []).some(
    (p) => p.permission_key === "tasks.approve_chores"
  );
}

export async function createChoreTemplateAction(
  input: ChoreTemplateInput
): Promise<ChoresActionResult> {
  await requireAuthenticatedUser();
  const parsed = choreTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid chore." };
  }

  try {
    if (!(await hasApproverPermission(parsed.data.familyId))) {
      return { ok: false, error: "Missing permission: tasks.approve_chores" };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("chore_templates").insert({
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      default_points: parsed.data.defaultPoints,
      schedule_rule: parsed.data.scheduleRule,
      category: parsed.data.category,
      assigned_member_id: parsed.data.assignedMemberId,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "chores"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create chore.",
    };
  }
}

export async function submitChoreCompletionAction(
  input: SubmitChoreInput
): Promise<ChoresActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = submitChoreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid chore submission." };
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

    if (!actor) return { ok: false, error: "Active membership not found." };

    const { error } = await supabase.from("chore_submissions").insert({
      family_id: parsed.data.familyId,
      template_id: parsed.data.templateId,
      member_id: actor.id,
      title: parsed.data.title,
      points_value: parsed.data.pointsValue,
      note: parsed.data.note,
      status: "pending_approval",
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "chores"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to submit chore.",
    };
  }
}

export async function reviewChoreSubmissionAction(
  input: ReviewChoreInput
): Promise<ChoresActionResult> {
  await requireAuthenticatedUser();
  const parsed = reviewChoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid review request." };

  try {
    if (!(await hasApproverPermission(parsed.data.familyId))) {
      return { ok: false, error: "Missing permission: tasks.approve_chores" };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("approve_chore_submission", {
      p_submission_id: parsed.data.submissionId,
      p_approved: parsed.data.approved,
      p_note: parsed.data.note,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "chores"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to review chore.",
    };
  }
}

export async function createRewardAction(
  input: RewardItemInput
): Promise<ChoresActionResult> {
  await requireAuthenticatedUser();
  const parsed = rewardItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reward." };
  }

  try {
    if (!(await hasApproverPermission(parsed.data.familyId))) {
      return { ok: false, error: "Missing permission: tasks.approve_chores" };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("reward_catalog").insert({
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      cost_points: parsed.data.costPoints,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "chores"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create reward.",
    };
  }
}

export async function redeemRewardAction(params: {
  familyId: string;
  rewardId: string;
}): Promise<ChoresActionResult> {
  await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("redeem_family_reward", {
      p_family_id: params.familyId,
      p_reward_id: params.rewardId,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(params.familyId, "chores"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not redeem reward.",
    };
  }
}

export async function createFamilyChallengeAction(
  input: FamilyChallengeInput
): Promise<ChoresActionResult> {
  await requireAuthenticatedUser();
  const parsed = familyChallengeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid challenge." };

  try {
    if (!(await hasApproverPermission(parsed.data.familyId))) {
      return { ok: false, error: "Missing permission: tasks.approve_chores" };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("family_challenges").insert({
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      target_chores: parsed.data.targetChores,
      bonus_points: parsed.data.bonusPoints,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "chores"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create challenge.",
    };
  }
}
