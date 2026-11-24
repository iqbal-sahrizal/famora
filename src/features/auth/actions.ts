"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { resolveAppUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getActionAppUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) {
      return resolveAppUrl(`${proto}://${host}`);
    }
  } catch {
    // Outside request context (e.g., unit tests)
  }
  return resolveAppUrl();
}
import {
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ProfileUpdateInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "./schemas";
import { ensureProfileInitialized, safeRedirectPath } from "./server";

export interface AuthActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  redirectTo?: string;
}

export async function loginAction(input: LoginInput): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid credentials." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return { ok: false, error: "Invalid email or password." };
    }

    if (data.user) {
      await ensureProfileInitialized(data.user);
    }

    return {
      ok: true,
      redirectTo: safeRedirectPath(parsed.data.redirectTo, routes.onboarding),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to sign in right now.",
    };
  }
}

export async function registerAction(input: RegisterInput): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid registration details." };
  }

  try {
    const appUrl = await getActionAppUrl();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: `${appUrl}${routes.authCallback}?next=${encodeURIComponent(routes.onboarding)}`,
      },
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    if (data.session && data.user) {
      await ensureProfileInitialized(data.user);
      return { ok: true, redirectTo: routes.onboarding };
    }

    return {
      ok: true,
      message: "Check your inbox to verify your email address.",
      redirectTo: `${routes.verifyEmail}?email=${encodeURIComponent(parsed.data.email)}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to create account right now.",
    };
  }
}

export async function forgotPasswordAction(
  input: ForgotPasswordInput
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email." };
  }

  try {
    const appUrl = await getActionAppUrl();
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${appUrl}${routes.authCallback}?next=${encodeURIComponent(routes.resetPassword)}`,
    });

    // Always return generic success to prevent email enumeration
    return {
      ok: true,
      message: "If an account exists for that email, a password reset link has been sent.",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to send reset link.",
    };
  }
}

export async function resetPasswordAction(
  input: ResetPasswordInput
): Promise<AuthActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        error: "Your recovery session has expired. Request a new reset link.",
      };
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      message: "Password updated successfully.",
      redirectTo: routes.onboarding,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to update password.",
    };
  }
}

export async function logoutAction(): Promise<AuthActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return { ok: true, redirectTo: routes.login };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to sign out.",
    };
  }
}

export async function updateProfileAction(
  input: ProfileUpdateInput
): Promise<AuthActionResult> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid profile data." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, error: "Session expired. Please sign in again." };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        default_timezone: parsed.data.defaultTimezone,
        locale: parsed.data.locale,
      })
      .eq("id", user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(routes.account);
    return { ok: true, message: "Profile settings updated." };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to update profile.",
    };
  }
}
