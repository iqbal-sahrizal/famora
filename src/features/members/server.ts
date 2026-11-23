import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FamilyRole } from "@/types/domain";

export interface DirectoryMemberItem {
  id: string;
  userId: string | null;
  displayName: string;
  roleKey: FamilyRole;
  roleDisplayName: string;
  isManagedChild: boolean;
  status: "active" | "invited" | "suspended" | "removed";
  joinedAt: string;
}

export interface DirectoryInvitationItem {
  id: string;
  email: string;
  roleKey: FamilyRole;
  roleDisplayName: string;
  status: "pending" | "accepted" | "rejected" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  invitationId: string;
  familyId: string;
  familyName: string;
  roleKey: FamilyRole;
  roleDisplayName: string;
  invitedEmail: string;
  status: string;
  expiresAt: string;
}

export async function getFamilyMembersData(familyId: string, userId: string): Promise<{
  members: DirectoryMemberItem[];
  invitations: DirectoryInvitationItem[];
  currentMemberId: string | null;
  currentRoleKey: FamilyRole | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Note: pin_hash is intentionally excluded (also enforced by Postgres column grant)
    const { data: memberRows } = await supabase
      .from("family_members")
      .select(
        `
        id,
        user_id,
        display_name,
        is_managed_child,
        status,
        joined_at,
        family_roles!inner(role_key, display_name)
      `
      )
      .eq("family_id", familyId)
      .neq("status", "removed")
      .order("joined_at", { ascending: true });

    const members: DirectoryMemberItem[] = (
      (memberRows as unknown as Array<{
        id: string;
        user_id: string | null;
        display_name: string;
        is_managed_child: boolean;
        status: "active" | "invited" | "suspended" | "removed";
        joined_at: string;
        family_roles: { role_key: FamilyRole; display_name: string };
      }>) ?? []
    ).map((m) => ({
      id: m.id,
      userId: m.user_id,
      displayName: m.display_name,
      roleKey: m.family_roles.role_key,
      roleDisplayName: m.family_roles.display_name,
      isManagedChild: m.is_managed_child,
      status: m.status,
      joinedAt: m.joined_at,
    }));

    const currentMember = members.find((m) => m.userId === userId) ?? null;

    const { data: inviteRows } = await supabase
      .from("family_invitations")
      .select(
        `
        id,
        email,
        status,
        expires_at,
        created_at,
        family_roles!inner(role_key, display_name)
      `
      )
      .eq("family_id", familyId)
      .order("created_at", { ascending: false });

    const invitations: DirectoryInvitationItem[] = (
      (inviteRows as unknown as Array<{
        id: string;
        email: string;
        status: "pending" | "accepted" | "rejected" | "revoked" | "expired";
        expires_at: string;
        created_at: string;
        family_roles: { role_key: FamilyRole; display_name: string };
      }>) ?? []
    ).map((inv) => ({
      id: inv.id,
      email: inv.email,
      roleKey: inv.family_roles.role_key,
      roleDisplayName: inv.family_roles.display_name,
      status: inv.status,
      expiresAt: inv.expires_at,
      createdAt: inv.created_at,
    }));

    return {
      members,
      invitations,
      currentMemberId: currentMember?.id ?? null,
      currentRoleKey: currentMember?.roleKey ?? null,
    };
  } catch {
    return {
      members: [],
      invitations: [],
      currentMemberId: null,
      currentRoleKey: null,
    };
  }
}

export async function getInvitationPreviewByToken(
  token: string
): Promise<InvitationPreview | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_invitation_preview", {
      p_token: token,
    });
    if (error || !data || !Array.isArray(data) || data.length === 0) {
      return null;
    }
    const row = data[0] as {
      invitation_id: string;
      family_id: string;
      family_name: string;
      role_key: FamilyRole;
      role_display_name: string;
      invited_email: string;
      status: string;
      expires_at: string;
    };
    return {
      invitationId: row.invitation_id,
      familyId: row.family_id,
      familyName: row.family_name,
      roleKey: row.role_key,
      roleDisplayName: row.role_display_name,
      invitedEmail: row.invited_email,
      status: row.status,
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
}
