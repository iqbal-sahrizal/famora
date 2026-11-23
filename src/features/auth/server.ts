import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

/**
 * Sanitizes a post-auth redirect target to prevent open-redirect attacks.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = "/onboarding"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }
  return candidate;
}

/**
 * Validates the current user on the server via Supabase Auth getUser().
 * Returns null if unauthenticated, expired, or Supabase is unconfigured.
 */
export async function getOptionalAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Server-side authentication guard for protected layouts, pages, and actions.
 * Redirects to /login when the session is missing or expired.
 */
export async function requireAuthenticatedUser(redirectTo?: string): Promise<User> {
  const user = await getOptionalAuthenticatedUser();
  if (!user) {
    const target = redirectTo
      ? `${routes.login}?redirectTo=${encodeURIComponent(safeRedirectPath(redirectTo))}`
      : routes.login;
    redirect(target);
  }
  return user;
}

/**
 * Ensures the authenticated user has an initialized row in public.profiles.
 */
export async function ensureProfileInitialized(user: User): Promise<ProfileRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (existing) return existing;

    const fallbackName =
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
      user.email?.split("@")[0] ||
      "Famora Member";

    const { data: created } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          full_name: fallbackName.slice(0, 120),
          default_timezone: "UTC",
          locale: "en-US",
        },
        { onConflict: "id" }
      )
      .select("*")
      .single<ProfileRow>();

    return created ?? null;
  } catch {
    return null;
  }
}
