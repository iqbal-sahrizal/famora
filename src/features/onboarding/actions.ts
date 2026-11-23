"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createInvitationToken } from "@/lib/security/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  acceptInviteSchema,
  createFamilyStepSchema,
  familyPreferencesStepSchema,
  inviteMemberItemSchema,
  type AcceptInviteInput,
  type CreateFamilyStepInput,
  type FamilyPreferencesStepInput,
  type InviteMemberItem,
} from "./schemas";

export interface OnboardingActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Step 1 + 2: Atomically creates a family and initializes owner membership.
 */
export async function createFamilyOnboardingAction(params: {
  identity: CreateFamilyStepInput;
  preferences: Omit<FamilyPreferencesStepInput, "familyId">;
}): Promise<OnboardingActionResult<{ familyId: string }>> {
  const user = await requireAuthenticatedUser(routes.onboarding);

  const idParsed = createFamilyStepSchema.safeParse(params.identity);
  if (!idParsed.success) {
    return {
      ok: false,
      error: idParsed.error.issues[0]?.message ?? "Invalid family details.",
    };
  }

  const prefParsed = familyPreferencesStepSchema.safeParse(params.preferences);
  if (!prefParsed.success) {
    return {
      ok: false,
      error: prefParsed.error.issues[0]?.message ?? "Invalid preferences.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();

    const { data: familyId, error } = await supabase.rpc(
      "create_family_with_owner",
      {
        p_name: idParsed.data.name,
        p_description: idParsed.data.description,
        p_timezone: prefParsed.data.timezone,
        p_currency_code: prefParsed.data.currencyCode,
        p_avatar_path: idParsed.data.avatarDataUrl ?? null,
      }
    );

    if (error || !familyId) {
      return {
        ok: false,
        error: error?.message ?? "Unable to create family workspace.",
      };
    }

    // Save member theme preference for this family
    const { data: member } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string }>();

    if (member) {
      await supabase
        .from("member_preferences")
        .upsert(
          {
            family_id: familyId,
            member_id: member.id,
            theme_mode: prefParsed.data.themeMode,
          },
          { onConflict: "member_id" }
        );
    }

    revalidatePath(routes.onboarding);
    return { ok: true, data: { familyId: String(familyId) } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create family.",
    };
  }
}

/**
 * Step 3: Sends invitations for a newly created family (deduplicating pending emails).
 */
export async function sendOnboardingInvitesAction(params: {
  familyId: string;
  invites: InviteMemberItem[];
}): Promise<OnboardingActionResult<{ sentCount: number }>> {
  const user = await requireAuthenticatedUser(routes.onboarding);

  for (const invite of params.invites) {
    const parsed = inviteMemberItemSchema.safeParse(invite);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invite entry.",
      };
    }
  }

  try {
    const supabase = await createSupabaseServerClient();

    const { data: actorMember } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", params.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actorMember) {
      return { ok: false, error: "You are not an active member of this family." };
    }

    const { data: roles } = await supabase
      .from("family_roles")
      .select("id, role_key")
      .is("family_id", null);

    const roleMap = new Map((roles ?? []).map((r) => [r.role_key, r.id]));
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let sentCount = 0;
    const seenEmails = new Set<string>();

    for (const invite of params.invites) {
      const normalizedEmail = invite.email.toLowerCase();
      if (seenEmails.has(normalizedEmail)) continue;
      seenEmails.add(normalizedEmail);

      const roleId = roleMap.get(invite.roleKey);
      if (!roleId) continue;

      // Prevent duplicate pending invitations for the same email
      const { data: existing } = await supabase
        .from("family_invitations")
        .select("id")
        .eq("family_id", params.familyId)
        .ilike("email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) continue;

      const { tokenHash } = createInvitationToken();
      const { error } = await supabase.from("family_invitations").insert({
        family_id: params.familyId,
        email: normalizedEmail,
        role_id: roleId,
        token_hash: tokenHash,
        invited_by_member_id: actorMember.id,
        status: "pending",
        expires_at: expiresAt,
      });

      if (!error) sentCount += 1;
    }

    return { ok: true, data: { sentCount } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to send invitations.",
    };
  }
}

/**
 * Step 4: Marks onboarding as completed and returns the Family Dashboard route.
 */
export async function completeOnboardingAction(
  familyId: string
): Promise<OnboardingActionResult<{ redirectTo: string }>> {
  await requireAuthenticatedUser(routes.onboarding);

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("families")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", familyId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(routes.onboarding);
    return { ok: true, data: { redirectTo: routes.familyDashboard(familyId) } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to complete onboarding.",
    };
  }
}

/**
 * Alternative Entry: Accept an existing family invitation token.
 */
export async function acceptInvitationOnboardingAction(
  input: AcceptInviteInput
): Promise<OnboardingActionResult<{ memberId: string }>> {
  await requireAuthenticatedUser(routes.onboarding);

  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid invitation token.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("accept_family_invitation", {
      p_token: parsed.data.token,
    });

    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? "Invitation is invalid or expired.",
      };
    }

    revalidatePath(routes.onboarding);
    return { ok: true, data: { memberId: String(data) } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to accept invitation.",
    };
  }
}
