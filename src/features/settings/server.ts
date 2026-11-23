import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FamilyRole, PermissionKey } from "@/types/domain";

export interface RolePermissionMatrixRow {
  roleKey: FamilyRole;
  displayName: string;
  description: string;
  permissions: PermissionKey[];
}

export interface FamilySettingsPayload {
  family: {
    id: string;
    name: string;
    description: string;
    timezone: string;
    currencyCode: string;
    weekStartsOn: "sunday" | "monday";
    dateFormat: "MMM d, yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
    privacy: {
      allowMemberDirectory: boolean;
      requireMfaForVault: boolean;
      allowGuestMemories: boolean;
      childKioskEnabled: boolean;
    };
  } | null;
  myPermissions: PermissionKey[];
  roleMatrix: RolePermissionMatrixRow[];
  members: Array<{
    id: string;
    userId: string | null;
    displayName: string;
    roleKey: FamilyRole;
    isManagedChild: boolean;
  }>;
  overrides: Array<{
    memberId: string;
    permissionKey: string;
    effect: "allow" | "deny";
  }>;
  personalPrefs: {
    themeMode: "light" | "dark" | "system";
    locale: Locale;
    digestEnabled: boolean;
    pushEnabled: boolean;
    emailEnabled: boolean;
    inAppEnabled: boolean;
  };
}

export async function getFamilySettingsData(
  familyId: string,
  userId: string
): Promise<FamilySettingsPayload> {
  const defaultPayload: FamilySettingsPayload = {
    family: null,
    myPermissions: [],
    roleMatrix: [],
    members: [],
    overrides: [],
    personalPrefs: {
      themeMode: "system",
      locale: DEFAULT_LOCALE,
      digestEnabled: true,
      pushEnabled: true,
      emailEnabled: true,
      inAppEnabled: true,
    },
  };

  try {
    const supabase = await createSupabaseServerClient();

    const [{ data: fam }, { data: myPerms }, { data: rolesData }, { data: membersData }, { data: overridesData }] =
      await Promise.all([
        supabase
          .from("families")
          .select("id, name, description, timezone, currency_code, privacy_settings, preferences")
          .eq("id", familyId)
          .maybeSingle(),
        supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
        supabase
          .from("family_roles")
          .select("role_key, display_name, description, rank_order, role_permissions(permissions(permission_key))")
          .is("family_id", null)
          .order("rank_order", { ascending: true }),
        supabase
          .from("family_members")
          .select("id, user_id, display_name, is_managed_child, family_roles!inner(role_key)")
          .eq("family_id", familyId)
          .eq("status", "active"),
        supabase
          .from("member_permission_overrides")
          .select("member_id, effect, permissions!inner(permission_key)")
          .eq("family_id", familyId),
      ]);

    const members = (
      (membersData as unknown as Array<{
        id: string;
        user_id: string | null;
        display_name: string;
        is_managed_child: boolean;
        family_roles: { role_key: FamilyRole };
      }>) ?? []
    ).map((m) => ({
      id: m.id,
      userId: m.user_id,
      displayName: m.display_name,
      roleKey: m.family_roles.role_key,
      isManagedChild: m.is_managed_child,
    }));

    const selfMember = members.find((m) => m.userId === userId);
    let personalPrefs = defaultPayload.personalPrefs;

    if (selfMember) {
      const { data: prefs } = await supabase
        .from("member_preferences")
        .select("theme_mode, locale, digest_enabled, notification_channels")
        .eq("member_id", selfMember.id)
        .maybeSingle();

      if (prefs) {
        const ch = (prefs.notification_channels as Record<string, boolean>) ?? {};
        personalPrefs = {
          themeMode: (prefs.theme_mode as "light" | "dark" | "system") ?? "system",
          locale: normalizeLocale((prefs as { locale?: string }).locale),
          digestEnabled: Boolean(prefs.digest_enabled),
          pushEnabled: ch.push ?? true,
          emailEnabled: ch.email ?? true,
          inAppEnabled: ch.in_app ?? true,
        };
      }
    }

    const famPriv = (fam?.privacy_settings as Record<string, boolean>) ?? {};
    const famPref = (fam?.preferences as Record<string, string>) ?? {};

    return {
      family: fam
        ? {
            id: fam.id,
            name: fam.name,
            description: fam.description ?? "",
            timezone: fam.timezone,
            currencyCode: fam.currency_code,
            weekStartsOn: famPref.week_starts_on === "sunday" ? "sunday" : "monday",
            dateFormat:
              (famPref.date_format as "MMM d, yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd") ??
              "MMM d, yyyy",
            privacy: {
              allowMemberDirectory: famPriv.allow_member_directory ?? true,
              requireMfaForVault: famPriv.require_mfa_for_vault ?? true,
              allowGuestMemories: famPriv.allow_guest_memories ?? true,
              childKioskEnabled: famPriv.child_kiosk_enabled ?? false,
            },
          }
        : null,
      myPermissions: ((myPerms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (r) => r.permission_key
      ),
      roleMatrix: (
        (rolesData as unknown as Array<{
          role_key: FamilyRole;
          display_name: string;
          description: string;
          role_permissions: Array<{ permissions: { permission_key: PermissionKey } }>;
        }>) ?? []
      ).map((r) => ({
        roleKey: r.role_key,
        displayName: r.display_name,
        description: r.description,
        permissions: r.role_permissions.map((rp) => rp.permissions.permission_key),
      })),
      members,
      overrides: (
        (overridesData as unknown as Array<{
          member_id: string;
          effect: "allow" | "deny";
          permissions: { permission_key: string };
        }>) ?? []
      ).map((o) => ({
        memberId: o.member_id,
        permissionKey: o.permissions.permission_key,
        effect: o.effect,
      })),
      personalPrefs,
    };
  } catch {
    return defaultPayload;
  }
}
