import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeNextRetryDelaySeconds,
  evaluateDeliveryDecision,
  sanitizePushPayload,
  validateNotificationRecipient,
} from "./logic";
import type { NotificationCategory, NotificationPreferences } from "./types";
import { dispatchVapidPushNotification } from "./vapid";

export async function enqueueFamilyNotification(params: {
  familyId: string;
  recipientMemberId: string;
  category: NotificationCategory;
  domain: string;
  title: string;
  body: string;
  deepLink: string;
  idempotencyKey: string;
  scheduledFor?: string;
}): Promise<{ ok: boolean; notificationId?: string; deduplicated?: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();

  const { data: member } = await supabase
    .from("family_members")
    .select("id, family_id, user_id, status")
    .eq("id", params.recipientMemberId)
    .maybeSingle<{
      id: string;
      family_id: string;
      user_id: string | null;
      status: string;
    }>();

  if (!member) {
    return { ok: false, error: "Recipient member not found." };
  }

  const check = validateNotificationRecipient({
    recipientFamilyId: member.family_id,
    targetFamilyId: params.familyId,
    recipientStatus: member.status,
  });
  if (!check.valid) {
    return { ok: false, error: check.error };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("notifications")
    .insert({
      family_id: params.familyId,
      recipient_member_id: params.recipientMemberId,
      category: params.category,
      domain: params.domain,
      title: params.title,
      body: params.body,
      deep_link: params.deepLink,
      idempotency_key: params.idempotencyKey,
      scheduled_for: params.scheduledFor ?? new Date().toISOString(),
      push_status: "pending",
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertErr?.code === "23505") {
    return { ok: true, deduplicated: true };
  }
  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? "Could not enqueue notification." };
  }

  const safePushPayload = sanitizePushPayload({
    category: params.category,
    title: params.title,
    deepLink: params.deepLink,
  });

  await supabase.from("notification_outbox").upsert(
    [
      {
        family_id: params.familyId,
        notification_id: inserted.id,
        recipient_member_id: params.recipientMemberId,
        recipient_user_id: member.user_id,
        idempotency_key: params.idempotencyKey,
        channel: "in_app",
        payload: { title: params.title, body: params.body, url: params.deepLink },
        status: "delivered",
        attempts: 1,
        delivered_at: new Date().toISOString(),
      },
      {
        family_id: params.familyId,
        notification_id: inserted.id,
        recipient_member_id: params.recipientMemberId,
        recipient_user_id: member.user_id,
        idempotency_key: params.idempotencyKey,
        channel: "push",
        payload: safePushPayload,
        status: "pending",
        attempts: 0,
      },
    ],
    { onConflict: "idempotency_key,channel", ignoreDuplicates: true }
  );

  return { ok: true, notificationId: inserted.id };
}

export async function processPushOutboxItem(params: {
  familyId: string;
  outboxId: string;
  expectedRecipientMemberId?: string;
}): Promise<{ ok: boolean; status: string; error?: string }> {
  const supabase = await createSupabaseServerClient();

  const { data: outbox } = await supabase
    .from("notification_outbox")
    .select(
      "id, family_id, notification_id, recipient_member_id, recipient_user_id, channel, payload, status, attempts, max_attempts"
    )
    .eq("id", params.outboxId)
    .eq("family_id", params.familyId)
    .maybeSingle<{
      id: string;
      family_id: string;
      notification_id: string;
      recipient_member_id: string;
      recipient_user_id: string | null;
      channel: "in_app" | "push";
      payload: { title: string; body: string; url: string };
      status: string;
      attempts: number;
      max_attempts: number;
    }>();

  if (!outbox || outbox.channel !== "push") {
    return { ok: false, status: "not_found", error: "Outbox item not found." };
  }

  if (
    params.expectedRecipientMemberId &&
    outbox.recipient_member_id !== params.expectedRecipientMemberId
  ) {
    return {
      ok: false,
      status: "forbidden",
      error: "Not authorized to retry this notification.",
    };
  }

  const [{ data: notif }, { data: prefRow }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, category")
      .eq("id", outbox.notification_id)
      .maybeSingle<{ id: string; category: NotificationCategory }>(),
    supabase
      .from("member_preferences")
      .select(
        "quiet_hours_start, quiet_hours_end, digest_enabled, notification_channels, disabled_categories"
      )
      .eq("member_id", outbox.recipient_member_id)
      .maybeSingle<{
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        digest_enabled: boolean;
        notification_channels: { in_app?: boolean; push?: boolean; email?: boolean };
        disabled_categories: NotificationCategory[] | null;
      }>(),
  ]);

  const prefs: NotificationPreferences = {
    inAppEnabled: prefRow?.notification_channels?.in_app ?? true,
    pushEnabled: prefRow?.notification_channels?.push ?? true,
    emailEnabled: prefRow?.notification_channels?.email ?? true,
    digestEnabled: prefRow?.digest_enabled ?? true,
    quietHoursStart: prefRow?.quiet_hours_start ?? null,
    quietHoursEnd: prefRow?.quiet_hours_end ?? null,
    disabledCategories: prefRow?.disabled_categories ?? [],
  };

  const decision = evaluateDeliveryDecision({
    channel: "push",
    category: notif?.category ?? "activity",
    preferences: prefs,
    nowDate: new Date(),
  });

  if (!decision.deliver) {
    await Promise.all([
      supabase
        .from("notification_outbox")
        .update({ status: "suppressed", last_error: decision.reason ?? null })
        .eq("id", outbox.id),
      supabase
        .from("notifications")
        .update({ push_status: decision.reason ?? "suppressed_preference" })
        .eq("id", outbox.notification_id),
      supabase.from("notification_delivery_logs").insert({
        family_id: outbox.family_id,
        outbox_id: outbox.id,
        status: "suppressed",
        error_message: decision.reason ?? "suppressed",
      }),
    ]);
    return { ok: true, status: decision.reason ?? "suppressed" };
  }

  if (!outbox.recipient_user_id) {
    return { ok: false, status: "skipped", error: "Recipient has no user account." };
  }

  const { data: devices } = await supabase
    .from("user_devices")
    .select("id, push_endpoint, push_p256dh, push_auth")
    .eq("user_id", outbox.recipient_user_id)
    .is("revoked_at", null)
    .not("push_endpoint", "is", null);

  const activeDevices =
    (devices as Array<{
      id: string;
      push_endpoint: string;
      push_p256dh: string | null;
      push_auth: string | null;
    }>) ?? [];
  if (activeDevices.length === 0) {
    await Promise.all([
      supabase
        .from("notifications")
        .update({ push_status: "skipped" })
        .eq("id", outbox.notification_id),
      supabase
        .from("notification_outbox")
        .update({ status: "suppressed", last_error: "No active push devices." })
        .eq("id", outbox.id),
    ]);
    return { ok: true, status: "no_active_devices" };
  }

  let anyDelivered = false;
  let lastErrMsg = "";

  for (const device of activeDevices) {
    const res = await dispatchVapidPushNotification({
      endpoint: device.push_endpoint,
      p256dh: device.push_p256dh ?? "",
      auth: device.push_auth ?? "",
      payload: outbox.payload,
    });

    if (res.ok) {
      anyDelivered = true;
      await supabase.from("notification_delivery_logs").insert({
        family_id: outbox.family_id,
        outbox_id: outbox.id,
        device_id: device.id,
        status: "sent",
        http_status: res.statusCode ?? 201,
      });
    } else {
      lastErrMsg = res.error ?? "Delivery failed";
      if (res.expired) {
        await supabase
          .from("user_devices")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", device.id);
      }
      await supabase.from("notification_delivery_logs").insert({
        family_id: outbox.family_id,
        outbox_id: outbox.id,
        device_id: device.id,
        status: res.expired ? "expired_subscription" : "failed",
        http_status: res.statusCode ?? null,
        error_message: lastErrMsg,
      });
    }
  }

  const nextAttempts = outbox.attempts + 1;
  if (anyDelivered) {
    const nowIso = new Date().toISOString();
    await Promise.all([
      supabase
        .from("notification_outbox")
        .update({
          status: "delivered",
          attempts: nextAttempts,
          delivered_at: nowIso,
          last_error: null,
        })
        .eq("id", outbox.id),
      supabase
        .from("notifications")
        .update({ push_status: "sent" })
        .eq("id", outbox.notification_id),
    ]);
    return { ok: true, status: "delivered" };
  }

  const delaySec = computeNextRetryDelaySeconds(nextAttempts);
  const nextAttemptAt = new Date(Date.now() + delaySec * 1000).toISOString();

  await Promise.all([
    supabase
      .from("notification_outbox")
      .update({
        status: "failed",
        attempts: nextAttempts,
        next_attempt_at: nextAttemptAt,
        last_error: lastErrMsg,
      })
      .eq("id", outbox.id),
    supabase
      .from("notifications")
      .update({ push_status: "failed" })
      .eq("id", outbox.notification_id),
  ]);

  return { ok: false, status: "failed", error: lastErrMsg };
}
