"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteFamilySchema,
  updateFamilyPreferencesSchema,
  updateFamilyPrivacySchema,
  updateMemberOverrideSchema,
  updatePersonalPreferencesSchema,
  type DeleteFamilyInput,
  type UpdateFamilyPreferencesInput,
  type UpdateFamilyPrivacyInput,
  type UpdateMemberOverrideInput,
  type UpdatePersonalPreferencesInput,
} from "./schemas";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
  warning?: string;
}

async function assertServerPermission(
  familyId: string,
  permissionKey: string
): Promise<{ allowed: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: perms, error } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: familyId,
  });

  if (error || !Array.isArray(perms)) {
    return { allowed: false, error: "Unable to verify permissions." };
  }

  const hasPerm = (perms as Array<{ permission_key: string }>).some(
    (p) => p.permission_key === permissionKey
  );

  return hasPerm
    ? { allowed: true }
    : { allowed: false, error: `Missing permission: ${permissionKey}` };
}

export async function updateFamilyPreferencesAction(
  input: UpdateFamilyPreferencesInput
): Promise<SettingsActionResult> {
  await requireAuthenticatedUser();
  const parsed = updateFamilyPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid preferences." };
  }

  const permCheck = await assertServerPermission(
    parsed.data.familyId,
    "family.settings.manage"
  );
  if (!permCheck.allowed) {
    return { ok: false, error: permCheck.error };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("families")
      .update({
        name: parsed.data.name,
        description: parsed.data.description,
        timezone: parsed.data.timezone,
        currency_code: parsed.data.currencyCode,
        preferences: {
          week_starts_on: parsed.data.weekStartsOn,
          date_format: parsed.data.dateFormat,
        },
      })
      .eq("id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "settings"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update family preferences.",
    };
  }
}

export async function updateFamilyPrivacyAction(
  input: UpdateFamilyPrivacyInput
): Promise<SettingsActionResult> {
  await requireAuthenticatedUser();
  const parsed = updateFamilyPrivacySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid privacy settings." };
  }

  const permCheck = await assertServerPermission(
    parsed.data.familyId,
    "family.settings.manage"
  );
  if (!permCheck.allowed) {
    return { ok: false, error: permCheck.error };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("families")
      .update({
        privacy_settings: {
          allow_member_directory: parsed.data.allowMemberDirectory,
          require_mfa_for_vault: parsed.data.requireMfaForVault,
          allow_guest_memories: parsed.data.allowGuestMemories,
          child_kiosk_enabled: parsed.data.childKioskEnabled,
        },
      })
      .eq("id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "settings"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update privacy settings.",
    };
  }
}

export async function updateMemberPermissionOverrideAction(
  input: UpdateMemberOverrideInput
): Promise<SettingsActionResult> {
  await requireAuthenticatedUser();
  const parsed = updateMemberOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid permission override." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("set_member_permission_override", {
      p_family_id: parsed.data.familyId,
      p_target_member_id: parsed.data.memberId,
      p_permission_key: parsed.data.permissionKey,
      p_effect: parsed.data.effect,
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "settings"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update override.",
    };
  }
}

export async function updatePersonalPreferencesAction(
  input: UpdatePersonalPreferencesInput
): Promise<SettingsActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = updatePersonalPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid personal preferences." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: member } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!member) return { ok: false, error: "Active membership not found." };

    const { error } = await supabase
      .from("member_preferences")
      .upsert(
        {
          family_id: parsed.data.familyId,
          member_id: member.id,
          theme_mode: parsed.data.themeMode,
          locale: parsed.data.locale,
          digest_enabled: parsed.data.digestEnabled,
          notification_channels: {
            push: parsed.data.pushEnabled,
            email: parsed.data.emailEnabled,
            in_app: parsed.data.inAppEnabled,
          },
        },
        { onConflict: "member_id" }
      );

    if (error) return { ok: false, error: error.message };

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE_NAME, parsed.data.locale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });

    revalidatePath("/", "layout");
    revalidatePath(routes.familyDomain(parsed.data.familyId, "settings"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save personal preferences.",
    };
  }
}

export async function deleteFamilyAction(
  input: DeleteFamilyInput
): Promise<SettingsActionResult> {
  await requireAuthenticatedUser();
  const parsed = deleteFamilySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid deletion request.",
    };
  }

  const permCheck = await assertServerPermission(
    parsed.data.familyId,
    "family.delete"
  );
  if (!permCheck.allowed) {
    return { ok: false, error: permCheck.error };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: family, error: famError } = await supabase
      .from("families")
      .select("id, name")
      .eq("id", parsed.data.familyId)
      .maybeSingle<{ id: string; name: string }>();

    if (famError) return { ok: false, error: famError.message };
    if (!family) return { ok: false, error: "Family workspace not found." };

    if (parsed.data.confirmationName !== family.name) {
      return {
        ok: false,
        error: "Confirmation name does not match the family name.",
      };
    }

    // Collect storage object paths before atomic DB deletion
    const [
      { data: docFiles },
      { data: memoryItems },
      { data: chatMessages },
      { data: childAttachments },
    ] = await Promise.all([
      supabase
        .from("documents")
        .select("storage_path")
        .eq("family_id", parsed.data.familyId),
      supabase
        .from("memory_items")
        .select("storage_path, thumbnail_path")
        .eq("family_id", parsed.data.familyId),
      supabase
        .from("chat_messages")
        .select("attachment_path")
        .eq("family_id", parsed.data.familyId)
        .not("attachment_path", "is", null),
      supabase
        .from("child_attachments")
        .select("storage_path")
        .eq("family_id", parsed.data.familyId),
    ]);

    const docPaths = ((docFiles ?? []) as Array<{ storage_path: string | null }>)
      .map((d) => d.storage_path)
      .filter((p): p is string => Boolean(p));

    const memoryPaths = (
      (memoryItems ?? []) as Array<{
        storage_path: string | null;
        thumbnail_path: string | null;
      }>
    )
      .flatMap((m) => [m.storage_path, m.thumbnail_path])
      .filter((p): p is string => Boolean(p));

    const chatPaths = (
      (chatMessages ?? []) as Array<{ attachment_path: string | null }>
    )
      .map((c) => c.attachment_path)
      .filter((p): p is string => Boolean(p));

    const childAttPaths = (
      (childAttachments ?? []) as Array<{ storage_path: string | null }>
    )
      .map((a) => a.storage_path)
      .filter((p): p is string => Boolean(p));

    const { error: rpcError } = await supabase.rpc("delete_family_workspace", {
      p_family_id: parsed.data.familyId,
    });
    if (rpcError) return { ok: false, error: rpcError.message };

    // Best-effort cleanup of storage buckets with 1 retry for transient failures
    const cleanupWarnings: string[] = [];
    const removeBucketWithRetry = async (bucket: string, paths: string[]) => {
      if (paths.length === 0) return;
      const first = await supabase.storage.from(bucket).remove(paths);
      if (first?.error) {
        const retry = await supabase.storage.from(bucket).remove(paths);
        if (retry?.error) {
          cleanupWarnings.push(`${bucket}: ${retry.error.message}`);
        }
      }
    };

    await Promise.allSettled([
      removeBucketWithRetry("family-documents", docPaths),
      removeBucketWithRetry("family-memories", memoryPaths),
      removeBucketWithRetry("chat-attachments", chatPaths),
      removeBucketWithRetry("family-child-attachments", childAttPaths),
    ]);

    revalidatePath("/", "layout");
    revalidatePath(routes.onboarding);
    return cleanupWarnings.length > 0
      ? { ok: true, warning: `Storage cleanup partial: ${cleanupWarnings.join("; ")}` }
      : { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete family workspace.",
    };
  }
}
