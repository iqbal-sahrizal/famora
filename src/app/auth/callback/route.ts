import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ensureProfileInitialized, safeRedirectPath } from "@/features/auth/server";
import { resolveAppUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
  "email",
]);

/**
 * Handles PKCE code exchange and token_hash OTP verification for email verification
 * and password recovery links without logging sensitive tokens.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const appUrl = resolveAppUrl(origin);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), routes.onboarding);

  if (searchParams.get("error")) {
    return NextResponse.redirect(
      `${appUrl}${routes.verifyEmail}?status=error&next=${encodeURIComponent(next)}`
    );
  }

  try {
    const supabase = await createSupabaseServerClient();

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        await ensureProfileInitialized(data.user);
        if (next === routes.resetPassword) {
          return NextResponse.redirect(`${appUrl}${routes.resetPassword}`);
        }
        return NextResponse.redirect(
          `${appUrl}${routes.verifyEmail}?status=verified&next=${encodeURIComponent(next)}`
        );
      }
    } else if (tokenHash && typeParam && ALLOWED_OTP_TYPES.has(typeParam)) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: typeParam,
      });
      if (!error && data.user) {
        await ensureProfileInitialized(data.user);
        if (next === routes.resetPassword || typeParam === "recovery") {
          return NextResponse.redirect(`${appUrl}${routes.resetPassword}`);
        }
        return NextResponse.redirect(
          `${appUrl}${routes.verifyEmail}?status=verified&next=${encodeURIComponent(next)}`
        );
      }
    }
  } catch {
    // Fall through to verification error state without exposing tokens
  }

  return NextResponse.redirect(
    `${appUrl}${routes.verifyEmail}?status=error&next=${encodeURIComponent(next)}`
  );
}
