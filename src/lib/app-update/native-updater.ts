"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { isTrustedApkUrl } from "./policy";

export interface InstalledAndroidVersion {
  versionCode: number;
  versionName: string;
  fcmConfigured?: boolean;
}

interface AppUpdaterNativePlugin {
  getAppVersion(): Promise<InstalledAndroidVersion>;
  openDownloadUrl(options: { url: string }): Promise<void>;
}

const AppUpdater = registerPlugin<AppUpdaterNativePlugin>("AppUpdater");

export function isNativeAndroidUpdaterAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android"
  );
}

export async function getInstalledAndroidVersion(): Promise<InstalledAndroidVersion | null> {
  if (!isNativeAndroidUpdaterAvailable()) return null;
  try {
    return await AppUpdater.getAppVersion();
  } catch {
    return null;
  }
}

export async function openAndroidApkDownloadInBrowser(url: string): Promise<void> {
  if (!isTrustedApkUrl(url)) {
    throw new Error("URL unduhan APK tidak dipercaya.");
  }
  if (isNativeAndroidUpdaterAvailable()) {
    await AppUpdater.openDownloadUrl({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
