"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { toast } from "sonner";
import { validateNotificationDeepLink } from "@/features/notifications/logic";
import { getInstalledAndroidVersion } from "@/lib/app-update/native-updater";

const DEVICE_FP_KEY = "senvamily:android-device-fingerprint";

export function getOrCreateAndroidDeviceFingerprint(): string {
  if (typeof window === "undefined") return "android-device-unknown";
  try {
    const existing = window.localStorage.getItem(DEVICE_FP_KEY);
    if (existing && existing.length >= 8) return existing;
    const generated = `and_${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_FP_KEY, generated);
    return generated;
  } catch {
    return "android-device-fallback";
  }
}

export async function registerFcmTokenWithBackend(fcmToken: string): Promise<boolean> {
  try {
    const versionInfo = await getInstalledAndroidVersion();
    const res = await fetch("/api/notifications/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceLabel: "Senvamily Android",
        deviceFingerprint: getOrCreateAndroidDeviceFingerprint(),
        fcmToken,
        appVersionCode: versionInfo?.versionCode,
        appVersionName: versionInfo?.versionName,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function unregisterCurrentAndroidDevice(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/notifications/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceFingerprint: getOrCreateAndroidDeviceFingerprint(),
      }),
    });
  } catch {
    // Best-effort cleanup on sign out
  }
}

/**
 * Initializes native Android FCM push listeners ONLY after authentication is active.
 * Never auto-prompts for permission on startup.
 */
export function PushInitializer() {
  const router = useRouter();

  React.useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
      return;
    }

    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    const setup = async () => {
      try {
        const regHandle = await PushNotifications.addListener("registration", (token) => {
          void registerFcmTokenWithBackend(token.value);
        });
        handles.push(regHandle);

        const fgHandle = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            const rawUrl =
              typeof notification.data?.url === "string" ? notification.data.url : "/";
            const safeUrl = validateNotificationDeepLink(rawUrl);
            toast.info(notification.title || "Senvamily", {
              description: notification.body || undefined,
              action:
                safeUrl !== "/"
                  ? {
                      label: "Buka",
                      onClick: () => router.push(safeUrl),
                    }
                  : undefined,
            });
          }
        );
        handles.push(fgHandle);

        const actionHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const rawUrl =
              typeof action.notification.data?.url === "string"
                ? action.notification.data.url
                : "/";
            const safeUrl = validateNotificationDeepLink(rawUrl);
            router.push(safeUrl);
          }
        );
        handles.push(actionHandle);

        const versionInfo = await getInstalledAndroidVersion();
        if (cancelled || versionInfo?.fcmConfigured !== true) {
          return;
        }

        const perm = await PushNotifications.checkPermissions();
        if (!cancelled && perm.receive === "granted") {
          await PushNotifications.register();
        }
      } catch {
        // Native push plugin unavailable or Firebase not configured yet
      }
    };

    void setup();

    return () => {
      cancelled = true;
      for (const handle of handles) {
        void handle.remove();
      }
    };
  }, [router]);

  return null;
}
