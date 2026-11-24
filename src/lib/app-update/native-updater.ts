"use client";

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface InstalledAndroidVersion {
  versionCode: number;
  versionName: string;
}

export interface DownloadProgressEvent {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

interface AppUpdaterNativePlugin {
  getAppVersion(): Promise<InstalledAndroidVersion>;
  downloadAndVerifyApk(options: {
    url: string;
    sha256: string;
    versionCode: number;
  }): Promise<{ filePath: string; sha256: string; fileSize: number }>;
  canRequestPackageInstalls(): Promise<{ granted: boolean }>;
  openUnknownSourcesSettings(): Promise<void>;
  installApk(options: { filePath: string }): Promise<{ status: "launched" | "completed" | "cancelled" }>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (event: DownloadProgressEvent) => void
  ): Promise<PluginListenerHandle>;
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

export async function canRequestAndroidPackageInstalls(): Promise<boolean> {
  if (!isNativeAndroidUpdaterAvailable()) return false;
  const res = await AppUpdater.canRequestPackageInstalls();
  return Boolean(res.granted);
}

export async function openAndroidUnknownSourcesSettings(): Promise<void> {
  if (!isNativeAndroidUpdaterAvailable()) return;
  await AppUpdater.openUnknownSourcesSettings();
}

export async function downloadAndVerifyAndroidApk(params: {
  url: string;
  sha256: string;
  versionCode: number;
}): Promise<{ filePath: string; sha256: string; fileSize: number }> {
  return AppUpdater.downloadAndVerifyApk(params);
}

export async function installVerifiedAndroidApk(filePath: string) {
  return AppUpdater.installApk({ filePath });
}

export async function addApkDownloadProgressListener(
  cb: (event: DownloadProgressEvent) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeAndroidUpdaterAvailable()) return null;
  return AppUpdater.addListener("downloadProgress", cb);
}
