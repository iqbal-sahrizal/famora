import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import type {
  LocationShareItem,
  SafetyContactItem,
  SafetyContactType,
  SafetyPageData,
  SafetyProtocolCategory,
  SafetyProtocolItem,
} from "./types";
import { canViewLocationShare } from "./validation";

export async function getSafetyPageData(
  familyId: string
): Promise<SafetyPageData> {
  const denied: SafetyPageData = {
    canView: false,
    canManage: false,
    currentMemberId: null,
    members: [],
    contacts: [],
    protocols: [],
    locationShares: [],
    myLocationShare: null,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return denied;

    const [{ data: perms }, { data: membersData }] = await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase
        .from("family_members")
        .select("id, user_id, display_name")
        .eq("family_id", familyId)
        .eq("status", "active"),
    ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );
    const canManage = permSet.has("safety.contacts_medical.manage");
    const canView = canManage || permSet.has("safety.sos.trigger");
    if (!canView) return denied;

    const members =
      (membersData as Array<{
        id: string;
        user_id: string | null;
        display_name: string;
      }>) ?? [];
    const currentMember = members.find((m) => m.user_id === user.id);
    if (!currentMember) return denied;

    const memberNameMap = new Map(members.map((m) => [m.id, m.display_name]));

    const [{ data: contactsData }, { data: protocolsData }, { data: sharesData }] =
      await Promise.all([
        supabase
          .from("safety_contacts")
          .select(
            "id, contact_type, name, relationship, phone, email, notes, is_primary"
          )
          .eq("family_id", familyId)
          .order("is_primary", { ascending: false })
          .order("name", { ascending: true }),
        supabase
          .from("safety_protocols")
          .select("id, category, title, content, created_at")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("safety_location_shares")
          .select(
            "id, member_id, is_enabled, consent_acknowledged_at, expires_at, shared_with_member_ids, status_label, approximate_area, last_updated_at, revoked_at"
          )
          .eq("family_id", familyId),
      ]);

    const contacts: SafetyContactItem[] = (
      (contactsData as Array<{
        id: string;
        contact_type: SafetyContactType;
        name: string;
        relationship: string;
        phone: string;
        email: string;
        notes: string;
        is_primary: boolean;
      }>) ?? []
    ).map((c) => ({
      id: c.id,
      contactType: c.contact_type,
      name: c.name,
      relationship: c.relationship,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      isPrimary: c.is_primary,
    }));

    const protocols: SafetyProtocolItem[] = (
      (protocolsData as Array<{
        id: string;
        category: SafetyProtocolCategory;
        title: string;
        content: string;
        created_at: string;
      }>) ?? []
    ).map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      content: p.content,
      createdAt: p.created_at,
    }));

    const nowMs = Date.now();
    const rawShares =
      (sharesData as Array<{
        id: string;
        member_id: string;
        is_enabled: boolean;
        consent_acknowledged_at: string | null;
        expires_at: string | null;
        shared_with_member_ids: string[] | null;
        status_label: string;
        approximate_area: string;
        last_updated_at: string | null;
        revoked_at: string | null;
      }>) ?? [];

    const visibleShares: LocationShareItem[] = rawShares
      .filter((s) =>
        canViewLocationShare({
          ownerMemberId: s.member_id,
          viewerMemberId: currentMember.id,
          isEnabled: s.is_enabled,
          consentAcknowledgedAt: s.consent_acknowledged_at,
          expiresAt: s.expires_at,
          revokedAt: s.revoked_at,
          sharedWithMemberIds: s.shared_with_member_ids ?? [],
          nowMs,
        })
      )
      .map((s) => {
        const isExpired =
          s.expires_at ? new Date(s.expires_at).getTime() <= nowMs : true;
        return {
          id: s.id,
          memberId: s.member_id,
          memberName: memberNameMap.get(s.member_id) ?? "Family member",
          isEnabled: s.is_enabled && !s.revoked_at && !isExpired,
          consentAcknowledgedAt: s.consent_acknowledged_at,
          expiresAt: s.expires_at,
          sharedWithMemberIds: s.shared_with_member_ids ?? [],
          statusLabel: s.status_label,
          approximateArea: s.approximate_area,
          lastUpdatedAt: s.last_updated_at,
        };
      });

    const myLocationShare =
      visibleShares.find((s) => s.memberId === currentMember.id) ?? null;

    return {
      canView: true,
      canManage,
      currentMemberId: currentMember.id,
      members: members.map((m) => ({ id: m.id, displayName: m.display_name })),
      contacts,
      protocols,
      locationShares: visibleShares.filter((s) => s.isEnabled),
      myLocationShare,
    };
  } catch {
    return denied;
  }
}
