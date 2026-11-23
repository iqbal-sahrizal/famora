"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { clientEnv } from "@/lib/env";
import { routes } from "@/lib/routes";
import { createInvitationToken } from "@/lib/security/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  invitationTargetSchema,
  inviteMemberSchema,
  memberTargetSchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema,
  type InviteMemberInput,
  type UpdateMemberRoleInput,
  type UpdateMemberStatusInput,
} from "./schemas";

export interface MemberActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function inviteFamilyMemberAction(
  input: InviteMemberInput
): Promise<MemberActionResult<{ inviteUrl: string; emailDelivery: "link_only" }>> {
  const user = await requireAuthenticatedUser();
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invite input." };
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
      return { ok: false, error: "Not authorized to invite members." };
    }

    const { data: role } = await supabase
      .from("family_roles")
      .select("id")
      .eq("role_key", parsed.data.roleKey)
      .is("family_id", null)
      .maybeSingle<{ id: string }>();

    if (!role) {
      return { ok: false, error: "Selected role does not exist." };
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const { data: existingPending } = await supabase
      .from("family_invitations")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .ilike("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      return { ok: false, error: "A pending invitation already exists for this email." };
    }

    // Generate cryptographically secure token; persist ONLY its SHA-256 hash
    const { rawToken, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const { error } = await supabase.from("family_invitations").insert({
      family_id: parsed.data.familyId,
      email: normalizedEmail,
      role_id: role.id,
      token_hash: tokenHash,
      invited_by_member_id: actor.id,
      status: "pending",
      expires_at: expiresAt,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "family"));
    return {
      ok: true,
      data: {
        inviteUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`,
        emailDelivery: "link_only",
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create invitation.",
    };
  }
}

export async function resendInvitationAction(params: {
  familyId: string;
  invitationId: string;
}): Promise<MemberActionResult<{ inviteUrl: string }>> {
  await requireAuthenticatedUser();
  const parsed = invitationTargetSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: "Invalid invitation reference." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { rawToken, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    // Rotating token_hash invalidates any previous plaintext link
    const { error } = await supabase
      .from("family_invitations")
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        status: "pending",
      })
      .eq("id", parsed.data.invitationId)
      .eq("family_id", parsed.data.familyId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "family"));
    return {
      ok: true,
      data: {
        inviteUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to resend invitation.",
    };
  }
}

export async function revokeInvitationAction(params: {
  familyId: string;
  invitationId: string;
}): Promise<MemberActionResult> {
  await requireAuthenticatedUser();
  const parsed = invitationTargetSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: "Invalid invitation reference." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("family_invitations")
      .update({ status: "revoked" })
      .eq("id", parsed.data.invitationId)
      .eq("family_id", parsed.data.familyId)
      .eq("status", "pending");

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "family"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to revoke invitation.",
    };
  }
}

export async function acceptInvitationByTokenAction(
  token: string
): Promise<MemberActionResult<{ memberId: string }>> {
  await requireAuthenticatedUser(`/invite/${encodeURIComponent(token)}`);
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("accept_family_invitation", {
      p_token: token,
    });
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Invitation is invalid or expired." };
    }
    return { ok: true, data: { memberId: String(data) } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to accept invitation.",
    };
  }
}

export async function rejectInvitationByTokenAction(
  token: string
): Promise<MemberActionResult> {
  await requireAuthenticatedUser(`/invite/${encodeURIComponent(token)}`);
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("reject_family_invitation", {
      p_token: token,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to decline invitation.",
    };
  }
}

export async function updateMemberRoleAction(
  input: UpdateMemberRoleInput
): Promise<MemberActionResult> {
  await requireAuthenticatedUser();
  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid role update." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: role } = await supabase
      .from("family_roles")
      .select("id")
      .eq("role_key", parsed.data.roleKey)
      .is("family_id", null)
      .maybeSingle<{ id: string }>();

    if (!role) return { ok: false, error: "Role not found." };

    const { error } = await supabase
      .from("family_members")
      .update({ role_id: role.id })
      .eq("id", parsed.data.memberId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "family"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update role.",
    };
  }
}

export async function updateMemberStatusAction(
  input: UpdateMemberStatusInput
): Promise<MemberActionResult> {
  await requireAuthenticatedUser();
  const parsed = updateMemberStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid status update." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("family_members")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.memberId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "family"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update member status.",
    };
  }
}

export async function removeMemberAction(params: {
  familyId: string;
  memberId: string;
}): Promise<MemberActionResult> {
  await requireAuthenticatedUser();
  const parsed = memberTargetSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: "Invalid member reference." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("family_members")
      .update({ status: "removed" })
      .eq("id", parsed.data.memberId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "family"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to remove member.",
    };
  }
}

export async function transferOwnershipAction(params: {
  familyId: string;
  memberId: string;
}): Promise<MemberActionResult> {
  await requireAuthenticatedUser();
  const parsed = memberTargetSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: "Invalid ownership transfer target." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("transfer_family_ownership", {
      p_family_id: parsed.data.familyId,
      p_target_member_id: parsed.data.memberId,
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "family"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to transfer ownership.",
    };
  }
}
