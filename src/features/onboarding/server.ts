import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OnboardingFamilyContext {
  familyId: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
  currencyCode: string;
  onboardingCompletedAt: string | null;
  roleKey: string;
}

/**
 * Loads the authenticated user's active families and detects any interrupted
 * onboarding session so the user can resume seamlessly.
 */
export async function getOnboardingStateForUser(userId: string): Promise<{
  families: OnboardingFamilyContext[];
  incompleteFamily: OnboardingFamilyContext | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("family_members")
      .select(
        `
        family_id,
        family_roles!inner(role_key),
        families!inner(id, name, slug, description, timezone, currency_code, onboarding_completed_at, deleted_at)
      `
      )
      .eq("user_id", userId)
      .eq("status", "active");

    if (error || !data) {
      return { families: [], incompleteFamily: null };
    }

    const families: OnboardingFamilyContext[] = [];
    for (const row of data as unknown as Array<{
      family_id: string;
      family_roles: { role_key: string };
      families: {
        id: string;
        name: string;
        slug: string;
        description: string;
        timezone: string;
        currency_code: string;
        onboarding_completed_at: string | null;
        deleted_at: string | null;
      };
    }>) {
      if (row.families.deleted_at) continue;
      families.push({
        familyId: row.families.id,
        name: row.families.name,
        slug: row.families.slug,
        description: row.families.description ?? "",
        timezone: row.families.timezone,
        currencyCode: row.families.currency_code,
        onboardingCompletedAt: row.families.onboarding_completed_at,
        roleKey: row.family_roles.role_key,
      });
    }

    const incompleteFamily =
      families.find((f) => f.onboardingCompletedAt === null) ?? null;

    return { families, incompleteFamily };
  } catch {
    return { families: [], incompleteFamily: null };
  }
}
