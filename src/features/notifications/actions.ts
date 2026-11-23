"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pushSubscriptionSchema, updatePreferencesSchema } from "./logic";
import { processPushOutboxItem } from "./outbox";
import type { NotificationCategory } from "./types";

async function getMemberActor(familyId: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();
  const { data: actor } = await supabase
    .from("family_members")
    .select("id")
    .eq("family_id", familyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();
  return { user, supabase, actor };
}

const notificationTargetSchema = z.object({
  familyId: z.string().uuid(),
  notificationId: z.string().uuid(),
});

export async function markNotificationReadAction(input: {
  familyId: string;
  notificationId: string;
}) {
  const parsed = notificationTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid notification identifier." };

  const { supabase, actor } = await getMemberActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.notificationId)
    .eq("family_id", parsed.data.familyId)
    .eq("recipient_member_id", actor.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "notifications"));
  return { ok: true };
}

export async function markAllNotificationsReadAction(input: {
  familyId: string;
}) {
  const parsed = z.object({ familyId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid family identifier." };

  const { supabase, actor } = await getMemberActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("family_id", parsed.data.familyId)
    .eq("recipient_member_id", actor.id)
    .is("read_at", null);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "notifications"));
  return { ok: true };
}

const deleteNotificationSchema = z.object({
  familyId: z.string().uuid(),
  notificationId: z.string().uuid(),
});

export async function deleteNotificationAction(input: {
  familyId: string;
  notificationId: string;
}) {
  const parsed = deleteNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid notification identifier." };
  }

  const { supabase, actor } = await getMemberActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { data: deleted, error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", parsed.data.notificationId)
    .eq("family_id", parsed.data.familyId)
    .eq("recipient_member_id", actor.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, error: error.message };
  if (!deleted) {
    return { ok: false, error: "Notification not found or not owned by you." };
  }

  revalidatePath(routes.familyDomain(parsed.data.familyId, "notifications"));
  return { ok: true };
}

export async function updateNotificationPreferencesAction(input: {
  familyId: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  digestEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  disabledCategories: NotificationCategory[];
}) {
  const parsed = updatePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid preferences.",
    };
  }

  const { supabase, actor } = await getMemberActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { error } = await supabase.from("member_preferences").upsert(
    {
      family_id: parsed.data.familyId,
      member_id: actor.id,
      quiet_hours_start: parsed.data.quietHoursStart,
      quiet_hours_end: parsed.data.quietHoursEnd,
      digest_enabled: parsed.data.digestEnabled,
      notification_channels: {
        in_app: parsed.data.inAppEnabled,
        push: parsed.data.pushEnabled,
        email: parsed.data.emailEnabled,
      },
      disabled_categories: parsed.data.disabledCategories,
    },
    { onConflict: "member_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "notifications"));
  return { ok: true };
}

export async function registerPushSubscriptionAction(input: {
  familyId: string;
  deviceLabel: string;
  deviceFingerprint: string;
  platform: "web" | "ios_pwa" | "android_pwa" | "desktop_pwa";
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid push subscription.",
    };
  }

  const { user, supabase, actor } = await getMemberActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { error } = await supabase.from("user_devices").upsert(
    {
      user_id: user.id,
      device_label: parsed.data.deviceLabel,
      device_fingerprint: parsed.data.deviceFingerprint,
      platform: parsed.data.platform,
      push_endpoint: parsed.data.endpoint,
      push_p256dh: parsed.data.p256dh,
      push_auth: parsed.data.auth,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id,device_fingerprint" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "notifications"));
  return { ok: true };
}

export async function revokeDeviceSubscriptionAction(input: {
  familyId: string;
  deviceId: string;
}) {
  const parsed = z
    .object({ familyId: z.string().uuid(), deviceId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid device identifier." };

  const { user, supabase, actor } = await getMemberActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { error } = await supabase
    .from("user_devices")
    .update({
      push_endpoint: null,
      push_p256dh: null,
      push_auth: null,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.deviceId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "notifications"));
  return { ok: true };
}

export async function retryOutboxDispatchAction(input: {
  familyId: string;
  outboxId: string;
}) {
  const parsed = z
    .object({ familyId: z.string().uuid(), outboxId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid outbox identifier." };

  const { actor } = await getMemberActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Active membership required." };

  const res = await processPushOutboxItem(parsed.data);
  revalidatePath(routes.familyDomain(parsed.data.familyId, "notifications"));
  return res;
}
