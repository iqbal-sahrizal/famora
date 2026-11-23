"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Clock,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { formatLocalizedDateTime } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  registerPushSubscriptionAction,
  retryOutboxDispatchAction,
  revokeDeviceSubscriptionAction,
  updateNotificationPreferencesAction,
} from "../actions";
import { ALL_NOTIFICATION_CATEGORIES } from "../logic";
import type {
  NotificationCategory,
  NotificationsPageData,
} from "../types";

const CATEGORY_KEYS: Record<NotificationCategory, Parameters<ReturnType<typeof useLocale>["t"]>[0]> = {
  invitation: "notifications.cat.invitation",
  announcement: "notifications.cat.announcement",
  calendar: "notifications.cat.calendar",
  task_assignment: "notifications.cat.task_assignment",
  task_deadline: "notifications.cat.task_deadline",
  shopping: "notifications.cat.shopping",
  bill_reminder: "notifications.cat.bill_reminder",
  document_expiration: "notifications.cat.document_expiration",
  chat: "notifications.cat.chat",
  activity: "notifications.cat.activity",
};

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export function FamilyNotificationsView({
  familyId,
  data,
}: {
  familyId: string;
  data: NotificationsPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [selectedCat, setSelectedCat] = React.useState<
    "all" | NotificationCategory
  >("all");
  const [inAppEnabled, setInAppEnabled] = React.useState(
    data.preferences.inAppEnabled
  );
  const [pushEnabled, setPushEnabled] = React.useState(
    data.preferences.pushEnabled
  );
  const [emailEnabled, setEmailEnabled] = React.useState(
    data.preferences.emailEnabled
  );
  const [digestEnabled, setDigestEnabled] = React.useState(
    data.preferences.digestEnabled
  );
  const [quietStart, setQuietStart] = React.useState(
    data.preferences.quietHoursStart ?? ""
  );
  const [quietEnd, setQuietEnd] = React.useState(
    data.preferences.quietHoursEnd ?? ""
  );
  const [disabledCategories, setDisabledCategories] = React.useState<
    NotificationCategory[]
  >(data.preferences.disabledCategories);
  const [subscribingPush, setSubscribingPush] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(
    () =>
      data.notifications.filter(
        (n) => selectedCat === "all" || n.category === selectedCat
      ),
    [data.notifications, selectedCat]
  );

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await updateNotificationPreferencesAction({
      familyId,
      inAppEnabled,
      pushEnabled,
      emailEnabled,
      digestEnabled,
      quietHoursStart: quietStart || null,
      quietHoursEnd: quietEnd || null,
      disabledCategories,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("notifications.toast.prefsSaved"));
    router.refresh();
  };

  const handleEnableBrowserPush = async () => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      toast.error(t("notifications.toast.pushUnsupported"));
      return;
    }

    if (!data.vapidPublicKey) {
      toast.error(t("notifications.toast.vapidMissing"));
      return;
    }

    setSubscribingPush(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error(t("notifications.toast.permDenied"));
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.vapidPublicKey),
      });

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!json.endpoint || !p256dh || !auth) {
        toast.error(t("notifications.toast.keysIncomplete"));
        return;
      }

      const res = await registerPushSubscriptionAction({
        familyId,
        deviceLabel: navigator.userAgent.includes("Mobile")
          ? "Mobile Browser"
          : "Desktop Browser",
        deviceFingerprint: `web-${btoa(json.endpoint).slice(0, 32)}`,
        platform: "web",
        endpoint: json.endpoint,
        p256dh,
        auth,
      });

      if (!res.ok) {
        toast.error(te(res.error));
        return;
      }
      toast.success(t("notifications.toast.subscribed"));
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to subscribe to Web Push."
      );
    } finally {
      setSubscribingPush(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.subtitle")}
        badge={
          data.unreadCount > 0 ? (
            <Badge variant="forest">{t("notifications.unread", { count: data.unreadCount })}</Badge>
          ) : undefined
        }
        actions={
          data.unreadCount > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await markAllNotificationsReadAction({ familyId });
                router.refresh();
              }}
            >
              <CheckCheck className="h-4 w-4" />
              {t("notifications.markAllRead")}
            </Button>
          ) : undefined
        }
      />

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCat("all")}
          className={cn(
            "rounded-full px-3 py-1.5 text-[12.5px] font-medium cursor-pointer",
            selectedCat === "all"
              ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
              : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
          )}
        >
          All
        </button>
        {ALL_NOTIFICATION_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCat(cat)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-medium cursor-pointer",
              selectedCat === cat
                ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            )}
          >
            {t(CATEGORY_KEYS[cat])}
          </button>
        ))}
      </div>

      {/* Inbox List */}
      <Section title={t("notifications.inboxTitle")}>
        {filtered.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title={t("notifications.emptyTitle")}
              description={t("notifications.emptyDesc")}
            />
          </Card>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((n) => (
              <Card
                key={n.id}
                className={cn(
                  "flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between",
                  !n.readAt && "border-l-4 border-l-[var(--accent-primary)]"
                )}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{t(CATEGORY_KEYS[n.category])}</Badge>
                    {!n.readAt && <Badge variant="forest">{t("notifications.unreadBadge")}</Badge>}
                    <span className="text-[11.5px] text-[var(--text-muted)]">
                      {formatLocalizedDateTime(n.createdAt, locale)}
                    </span>
                  </div>
                  <p className="font-heading text-[15px] font-bold">{n.title}</p>
                  {n.body && (
                    <p className="text-[13px] text-[var(--text-secondary)]">
                      {n.body}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {n.deepLink && (
                    <Link
                      href={n.deepLink}
                      className="rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[var(--bg-subtle)]"
                    >
                      Open
                    </Link>
                  )}
                  {!n.readAt && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await markNotificationReadAction({
                          familyId,
                          notificationId: n.id,
                        });
                        router.refresh();
                      }}
                    >
                      <Check className="h-4 w-4" />
                      Mark Read
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete notification ${n.title}`}
                    disabled={deletingId === n.id}
                    onClick={async () => {
                      setDeletingId(n.id);
                      const res = await deleteNotificationAction({
                        familyId,
                        notificationId: n.id,
                      });
                      setDeletingId(null);
                      if (!res.ok) {
                        toast.error(te(res.error));
                        return;
                      }
                      toast.success(t("notifications.toast.deleted"));
                      router.refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-[var(--accent-danger)]" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* Preferences + Web Push Devices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={t("notifications.prefsTitle")}>
          <Card className="p-5">
            <form onSubmit={handleSavePreferences} className="space-y-4">
              <div className="space-y-2 text-[13.5px]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={inAppEnabled}
                    onChange={(e) => setInAppEnabled(e.target.checked)}
                  />
                  In-app notifications
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pushEnabled}
                    onChange={(e) => setPushEnabled(e.target.checked)}
                  />
                  Web Push notifications (privacy-sanitized payloads)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                  />
                  Email notifications
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={digestEnabled}
                    onChange={(e) => setDigestEnabled(e.target.checked)}
                  />
                  Daily family digest
                </label>
              </div>

              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
                  <Clock className="h-3.5 w-3.5" />
                  Quiet Hours (UTC)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                  />
                  <Input
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
                  <BellOff className="h-3.5 w-3.5" />
                  Mute Specific Categories
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-[12.5px]">
                  {ALL_NOTIFICATION_CATEGORIES.map((cat) => (
                    <label key={cat} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={disabledCategories.includes(cat)}
                        onChange={(e) =>
                          setDisabledCategories((prev) =>
                            e.target.checked
                              ? [...prev, cat]
                              : prev.filter((c) => c !== cat)
                          )
                        }
                      />
                      {t(CATEGORY_KEYS[cat])}
                    </label>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full">
                Save Notification Preferences
              </Button>
            </form>
          </Card>
        </Section>

        <Section title={t("notifications.devicesTitle")}>
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-heading text-[15px] font-bold">
                  {t("notifications.devicesTitle")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={subscribingPush}
                onClick={() => void handleEnableBrowserPush()}
              >
                <Smartphone className="h-4 w-4" />
                {subscribingPush ? t("notifications.connecting") : t("notifications.subscribe")}
              </Button>
            </div>

            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              {data.devices.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  {t("notifications.emptyDesc")}
                </p>
              ) : (
                data.devices.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-[13px]"
                  >
                    <div>
                      <p className="font-semibold">{d.deviceLabel}</p>
                      <p className="text-[11.5px] text-[var(--text-muted)]">
                        {d.platform} ·{" "}
                        {d.revokedAt
                          ? t("notifications.revoked")
                          : d.hasPushSubscription
                          ? t("notifications.pushActive")
                          : t("notifications.noPushEndpoint")}
                      </p>
                    </div>
                    {!d.revokedAt && (
                      <button
                        type="button"
                        aria-label={t("notifications.revokeAria")}
                        onClick={async () => {
                          await revokeDeviceSubscriptionAction({
                            familyId,
                            deviceId: d.id,
                          });
                          router.refresh();
                        }}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </Section>
      </div>

      {/* Outbox Delivery Status */}
      {data.outboxLogs.length > 0 && (
        <Section title={t("notifications.outboxTitle")}>
          <Card className="divide-y divide-[var(--border-subtle)]">
            {data.outboxLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]"
              >
                <div>
                  <span className="font-semibold uppercase">{log.channel}</span>{" "}
                  · Attempts: {log.attempts}
                  {log.lastError ? ` · ${log.lastError}` : ""}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      log.status === "delivered"
                        ? "sage"
                        : log.status === "failed"
                        ? "danger"
                        : "neutral"
                    }
                  >
                    {log.status}
                  </Badge>
                  {log.channel === "push" && log.status === "failed" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await retryOutboxDispatchAction({
                          familyId,
                          outboxId: log.id,
                        });
                        router.refresh();
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </div>
  );
}
