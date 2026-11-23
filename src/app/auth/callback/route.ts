import { NextResponse } from "next/server";
import { ensureProfileInitialized, safeRedirectPath } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Handles PKCE code exchange for email verification and password recovery links.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), routes.onboarding);

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        await ensureProfileInitialized(data.user);
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch {
      // Fall through to login error redirect
    }
  }

  return NextResponse.redirect(`${origin}${routes.login}?error=verification_failed`);
}
