"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Clock,
  Lock,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { registerFcmTokenWithBackend } from "@/components/notifications/push-initializer";
import { getInstalledAndroidVersion } from "@/lib/app-update/native-updater";
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
  system_update: "notifications.cat.system_update",
  app_update: "notifications.cat.app_update",
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

async function computeEndpointFingerprint(endpoint: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(endpoint);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `web-${hex.slice(0, 32)}`;
  }
  return `web-${btoa(endpoint).slice(-32)}`;
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
  const [itemsState, setItemsState] = React.useState(data.notifications);
  React.useEffect(() => {
    setItemsState(data.notifications);
  }, [data.notifications]);

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

  React.useEffect(() => {
    setInAppEnabled(data.preferences.inAppEnabled);
    setPushEnabled(data.preferences.pushEnabled);
    setEmailEnabled(data.preferences.emailEnabled);
    setDigestEnabled(data.preferences.digestEnabled);
    setQuietStart(data.preferences.quietHoursStart ?? "");
    setQuietEnd(data.preferences.quietHoursEnd ?? "");
    setDisabledCategories(data.preferences.disabledCategories);
  }, [data.preferences]);

  const [subscribingPush, setSubscribingPush] = React.useState(false);
  const [savingPrefs, setSavingPrefs] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [retryingOutboxId, setRetryingOutboxId] = React.useState<string | null>(null);

  const unreadCount = React.useMemo(
    () => itemsState.filter((n) => !n.readAt).length,
    [itemsState]
  );

  const filtered = React.useMemo(
    () =>
      itemsState.filter(
        (n) => selectedCat === "all" || n.category === selectedCat
      ),
    [itemsState, selectedCat]
  );

  if (!data.canView) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={t("notifications.restrictedTitle")}
          description={t("notifications.restrictedDesc")}
        />
      </Card>
    );
  }

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
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
    setSavingPrefs(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("notifications.toast.prefsSaved"));
    router.refresh();
  };

  const handleEnableBrowserPush = async () => {
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      setSubscribingPush(true);
      try {
        const versionInfo = await getInstalledAndroidVersion();
        if (versionInfo?.fcmConfigured !== true) {
          toast.error(t("notifications.toast.pushUnsupported"));
          return;
        }
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== "granted") {
          toast.error(t("notifications.toast.permDenied"));
          return;
        }
        await PushNotifications.addListener("registration", (token) => {
          void registerFcmTokenWithBackend(token.value);
        });
        await PushNotifications.register();
        toast.success(t("notifications.toast.subscribed"));
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? te(err.message) : t("notifications.pushSubscribeFail")
        );
      } finally {
        setSubscribingPush(false);
      }
      return;
    }

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

      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.vapidPublicKey),
        });
      }

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!json.endpoint || !p256dh || !auth) {
        toast.error(t("notifications.toast.keysIncomplete"));
        return;
      }

      const deviceFingerprint = await computeEndpointFingerprint(json.endpoint);
      const res = await registerPushSubscriptionAction({
        familyId,
        deviceLabel: navigator.userAgent.includes("Mobile")
          ? t("notifications.mobileBrowser")
          : t("notifications.desktopBrowser"),
        deviceFingerprint,
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
        err instanceof Error ? te(err.message) : t("notifications.pushSubscribeFail")
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
          unreadCount > 0 ? (
            <Badge variant="forest">{t("notifications.unread", { count: unreadCount })}</Badge>
          ) : undefined
        }
        actions={
          unreadCount > 0 ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={markingAll}
              disabled={markingAll}
              onClick={async () => {
                const previous = itemsState;
                const nowIso = new Date().toISOString();
                setMarkingAll(true);
                setItemsState((prev) =>
                  prev.map((item) => (item.readAt ? item : { ...item, readAt: nowIso }))
                );
                const res = await markAllNotificationsReadAction({ familyId });
                setMarkingAll(false);
                if (!res.ok) {
                  setItemsState(previous);
                  toast.error(te(res.error));
                  return;
                }
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
            "inline-flex min-h-11 sm:min-h-0 items-center rounded-full px-4 py-2 sm:px-3 sm:py-1.5 text-[12.5px] font-medium cursor-pointer",
            selectedCat === "all"
              ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
              : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
          )}
        >
          {t("notifications.all")}
        </button>
        {ALL_NOTIFICATION_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCat(cat)}
            className={cn(
              "inline-flex min-h-11 sm:min-h-0 items-center rounded-full px-4 py-2 sm:px-3 sm:py-1.5 text-[12.5px] font-medium cursor-pointer",
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

                <div className="flex flex-wrap shrink-0 items-center gap-2">
                  {n.deepLink && n.deepLink.startsWith(`/f/${familyId}`) && (
                    <Link
                      href={n.deepLink}
                      className="inline-flex min-h-11 sm:min-h-0 items-center rounded-xl border border-[var(--border-subtle)] px-3.5 py-2 sm:px-3 sm:py-1.5 text-[12.5px] font-medium hover:bg-[var(--bg-subtle)]"
                    >
                      {t("notifications.openBtn")}
                    </Link>
                  )}
                  {!n.readAt && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const previous = itemsState;
                        const nowIso = new Date().toISOString();
                        setItemsState((prev) =>
                          prev.map((item) =>
                            item.id === n.id ? { ...item, readAt: nowIso } : item
                          )
                        );
                        const res = await markNotificationReadAction({
                          familyId,
                          notificationId: n.id,
                        });
                        if (!res.ok) {
                          setItemsState(previous);
                          toast.error(te(res.error));
                          return;
                        }
                        router.refresh();
                      }}
                    >
                      <Check className="h-4 w-4" />
                      {t("notifications.markRead")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("notifications.deleteAria", { title: n.title })}
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
              <div className="space-y-1 text-[13.5px]">
                <label className="flex min-h-11 sm:min-h-0 items-center gap-2.5 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inAppEnabled}
                    onChange={(e) => setInAppEnabled(e.target.checked)}
                    className="h-4 w-4 accent-[#315C49]"
                  />
                  {t("notifications.inAppLabel")}
                </label>
                <label className="flex min-h-11 sm:min-h-0 items-center gap-2.5 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushEnabled}
                    onChange={(e) => setPushEnabled(e.target.checked)}
                    className="h-4 w-4 accent-[#315C49]"
                  />
                  {t("notifications.pushLabel")}
                </label>
                <label className="flex min-h-11 sm:min-h-0 items-center gap-2.5 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    className="h-4 w-4 accent-[#315C49]"
                  />
                  {t("notifications.emailLabel")}
                </label>
                <label className="flex min-h-11 sm:min-h-0 items-center gap-2.5 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={digestEnabled}
                    onChange={(e) => setDigestEnabled(e.target.checked)}
                    className="h-4 w-4 accent-[#315C49]"
                  />
                  {t("notifications.digestLabel")}
                </label>
              </div>

              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
                  <Clock className="h-3.5 w-3.5" />
                  {t("notifications.quietHoursLabel")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="time"
                    aria-label={`${t("notifications.quietHoursLabel")} start`}
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                  />
                  <Input
                    type="time"
                    aria-label={`${t("notifications.quietHoursLabel")} end`}
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
                  <BellOff className="h-3.5 w-3.5" />
                  {t("notifications.muteCatsLabel")}
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-[12.5px]">
                  {ALL_NOTIFICATION_CATEGORIES.map((cat) => (
                    <label
                      key={cat}
                      className="flex min-h-11 sm:min-h-0 items-center gap-2 py-1 cursor-pointer"
                    >
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
                        className="h-4 w-4 accent-[#315C49]"
                      />
                      {t(CATEGORY_KEYS[cat])}
                    </label>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full" isLoading={savingPrefs}>
                {t("notifications.savePrefsBtn")}
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
                        disabled={revokingId === d.id}
                        onClick={async () => {
                          setRevokingId(d.id);
                          const res = await revokeDeviceSubscriptionAction({
                            familyId,
                            deviceId: d.id,
                          });
                          setRevokingId(null);
                          if (!res.ok) {
                            toast.error(te(res.error));
                            return;
                          }
                          router.refresh();
                        }}
                        className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer disabled:opacity-50"
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
                <div className="min-w-0">
                  <span className="font-semibold uppercase">{log.channel}</span>{" "}
                  · {t("notifications.attemptsLabel", { count: log.attempts })}
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
                      isLoading={retryingOutboxId === log.id}
                      disabled={retryingOutboxId === log.id}
                      onClick={async () => {
                        setRetryingOutboxId(log.id);
                        const res = await retryOutboxDispatchAction({
                          familyId,
                          outboxId: log.id,
                        });
                        setRetryingOutboxId(null);
                        if (!res.ok) {
                          toast.error(te(res.error));
                          return;
                        }
                        router.refresh();
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t("notifications.retryBtn")}
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
