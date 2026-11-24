import { z } from "zod";
import { PRODUCTION_APP_URL } from "@/lib/env";
import type { AndroidReleaseManifest, UpdateEvaluation } from "./types";

export const androidReleaseManifestSchema = z.object({
  success: z.boolean(),
  platform: z.literal("android"),
  latestVersion: z.string().min(1),
  versionCode: z.number().int().nonnegative(),
  minimumSupportedVersionCode: z.number().int().nonnegative(),
  downloadUrl: z.string(),
  releaseNotes: z.array(z.string()).default([]),
  fileSize: z.number().nonnegative(),
  sha256: z.string(),
  publishedAt: z.string(),
  enabled: z.boolean(),
});

export function getTrustedApkHosts(): string[] {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(PRODUCTION_APP_URL).hostname.toLowerCase());
  } catch {
    // ignore
  }
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supaUrl) {
    try {
      hosts.add(new URL(supaUrl).hostname.toLowerCase());
    } catch {
      // ignore
    }
  }
  const customHost = process.env.NEXT_PUBLIC_APK_TRUSTED_HOST;
  if (customHost) {
    hosts.add(customHost.trim().toLowerCase());
  }
  return Array.from(hosts);
}

export function isTrustedApkUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return getTrustedApkHosts().includes(host);
  } catch {
    return false;
  }
}

export function isValidSha256Hex(sha256: string): boolean {
  return /^[a-f0-9]{64}$/i.test(sha256.trim());
}

export function evaluateAndroidUpdate(
  manifest: AndroidReleaseManifest | null | undefined,
  installedVersionCode: number
): UpdateEvaluation {
  if (!manifest || !manifest.enabled || manifest.versionCode <= 0) {
    return { status: "disabled", manifest: manifest ?? null, installedVersionCode };
  }

  if (
    !isTrustedApkUrl(manifest.downloadUrl) ||
    !isValidSha256Hex(manifest.sha256)
  ) {
    return { status: "disabled", manifest, installedVersionCode };
  }

  // Never downgrade an installed app that is at or above latestVersion
  if (installedVersionCode >= manifest.versionCode) {
    return { status: "up_to_date", manifest, installedVersionCode };
  }

  if (installedVersionCode < manifest.minimumSupportedVersionCode) {
    return { status: "mandatory", manifest, installedVersionCode };
  }

  return { status: "optional", manifest, installedVersionCode };
}

export function formatApkSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
