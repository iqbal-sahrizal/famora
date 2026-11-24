import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  NotificationCategory,
  NotificationItem,
  NotificationPreferences,
  NotificationPushStatus,
  NotificationsPageData,
  OutboxDeliveryItem,
  UserDeviceItem,
} from "./types";

export async function getNotificationsPageData(
  familyId: string
): Promise<NotificationsPageData> {
  const defaultPrefs: NotificationPreferences = {
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: true,
    digestEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    disabledCategories: [],
  };

  const denied: NotificationsPageData = {
    canView: false,
    unreadCount: 0,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    notifications: [],
    preferences: defaultPrefs,
    devices: [],
    outboxLogs: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return denied;

    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) return denied;

    const [
      { data: notifRows },
      { data: prefRow },
      { data: deviceRows },
      { data: outboxRows },
    ] = await Promise.all([
      supabase
        .from("notifications")
        .select(
          "id, category, domain, title, body, deep_link, scheduled_for, read_at, push_status, created_at"
        )
        .eq("family_id", familyId)
        .eq("recipient_member_id", actor.id)
        .lte("scheduled_for", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("member_preferences")
        .select(
          "quiet_hours_start, quiet_hours_end, digest_enabled, notification_channels, disabled_categories"
        )
        .eq("member_id", actor.id)
        .maybeSingle<{
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          digest_enabled: boolean;
          notification_channels: {
            in_app?: boolean;
            push?: boolean;
            email?: boolean;
          };
          disabled_categories: NotificationCategory[] | null;
        }>(),
      supabase
        .from("user_devices")
        .select(
          "id, device_label, platform, push_endpoint, fcm_token, app_version_code, app_version_name, last_seen_at, revoked_at"
        )
        .eq("user_id", user.id)
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("notification_outbox")
        .select(
          "id, channel, status, attempts, last_error, delivered_at, created_at"
        )
        .eq("family_id", familyId)
        .eq("recipient_member_id", actor.id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const notifications: NotificationItem[] = (
      (notifRows as Array<{
        id: string;
        category: NotificationCategory;
        domain: string;
        title: string;
        body: string;
        deep_link: string;
        scheduled_for: string;
        read_at: string | null;
        push_status: NotificationPushStatus;
        created_at: string;
      }>) ?? []
    ).map((n) => ({
      id: n.id,
      category: n.category ?? "activity",
      domain: n.domain,
      title: n.title,
      body: n.body,
      deepLink: n.deep_link,
      scheduledFor: n.scheduled_for,
      readAt: n.read_at,
      pushStatus: n.push_status ?? "pending",
      createdAt: n.created_at,
    }));

    const preferences: NotificationPreferences = prefRow
      ? {
          inAppEnabled: prefRow.notification_channels?.in_app ?? true,
          pushEnabled: prefRow.notification_channels?.push ?? true,
          emailEnabled: prefRow.notification_channels?.email ?? true,
          digestEnabled: prefRow.digest_enabled ?? true,
          quietHoursStart: prefRow.quiet_hours_start
            ? prefRow.quiet_hours_start.slice(0, 5)
            : null,
          quietHoursEnd: prefRow.quiet_hours_end
            ? prefRow.quiet_hours_end.slice(0, 5)
            : null,
          disabledCategories: prefRow.disabled_categories ?? [],
        }
      : defaultPrefs;

    const devices: UserDeviceItem[] = (
      (deviceRows as Array<{
        id: string;
        device_label: string;
        platform: "web" | "ios_pwa" | "android_pwa" | "desktop_pwa" | "android_fcm";
        push_endpoint: string | null;
        fcm_token: string | null;
        app_version_code: number | null;
        app_version_name: string | null;
        last_seen_at: string;
        revoked_at: string | null;
      }>) ?? []
    ).map((d) => ({
      id: d.id,
      deviceLabel: d.device_label,
      platform: d.platform,
      hasPushSubscription: Boolean((d.push_endpoint || d.fcm_token) && !d.revoked_at),
      appVersionCode: d.app_version_code,
      appVersionName: d.app_version_name,
      lastSeenAt: d.last_seen_at,
      revokedAt: d.revoked_at,
    }));

    const outboxLogs: OutboxDeliveryItem[] = (
      (outboxRows as Array<{
        id: string;
        channel: "in_app" | "push";
        status: "pending" | "processing" | "delivered" | "failed" | "suppressed";
        attempts: number;
        last_error: string | null;
        delivered_at: string | null;
        created_at: string;
      }>) ?? []
    ).map((o) => ({
      id: o.id,
      channel: o.channel,
      status: o.status,
      attempts: o.attempts,
      lastError: o.last_error,
      deliveredAt: o.delivered_at,
      createdAt: o.created_at,
    }));

    return {
      canView: true,
      unreadCount: notifications.filter((n) => !n.readAt).length,
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      notifications,
      preferences,
      devices,
      outboxLogs,
    };
  } catch {
    return denied;
  }
}
