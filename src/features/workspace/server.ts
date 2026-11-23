import type { User } from "@supabase/supabase-js";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface WorkspaceFamilyOption {
  familyId: string;
  name: string;
  roleKey: string;
}

export interface WorkspaceShellContext {
  userName: string;
  families: WorkspaceFamilyOption[];
  memberLocale?: Locale;
}

export function validateFamilySwitchTarget(
  families: WorkspaceFamilyOption[],
  targetFamilyId: string
): boolean {
  return families.some((f) => f.familyId === targetFamilyId);
}

export async function getWorkspaceShellContext(
  user: User,
  activeFamilyId?: string
): Promise<WorkspaceShellContext> {
  const fallbackName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Member";

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: profile }, { data: memberships }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string }>(),
      supabase
        .from("family_members")
        .select("family_id, families!inner(id, name), family_roles!inner(role_key)")
        .eq("user_id", user.id)
        .eq("status", "active"),
    ]);

    const families: WorkspaceFamilyOption[] = (
      (memberships as Array<{
        family_id: string;
        families: { id: string; name: string } | Array<{ id: string; name: string }>;
        family_roles: { role_key: string } | Array<{ role_key: string }>;
      }>) ?? []
    ).map((m) => {
      const fam = Array.isArray(m.families) ? m.families[0] : m.families;
      const role = Array.isArray(m.family_roles)
        ? m.family_roles[0]
        : m.family_roles;
      return {
        familyId: m.family_id,
        name: fam?.name ?? "Family Space",
        roleKey: role?.role_key ?? "adult",
      };
    });

    let memberLocale: Locale | undefined;
    if (activeFamilyId) {
      const { data: selfMem } = await supabase
        .from("family_members")
        .select("id")
        .eq("family_id", activeFamilyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string }>();

      if (selfMem) {
        const { data: pref } = await supabase
          .from("member_preferences")
          .select("locale")
          .eq("member_id", selfMem.id)
          .maybeSingle<{ locale?: string }>();
        if (pref?.locale) {
          memberLocale = normalizeLocale(pref.locale);
        }
      }
    }

    return {
      userName: profile?.full_name || fallbackName,
      families,
      memberLocale,
    };
  } catch {
    return {
      userName: fallbackName,
      families: [],
    };
  }
}
