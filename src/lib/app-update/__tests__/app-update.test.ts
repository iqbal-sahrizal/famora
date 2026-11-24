import { describe, expect, it } from "vitest";
import {
  androidReleaseManifestSchema,
  evaluateAndroidUpdate,
  formatApkSize,
  isTrustedApkUrl,
  isValidSha256Hex,
} from "../policy";
import type { AndroidReleaseManifest } from "../types";

const SAMPLE_SHA = "a".repeat(64);

const BASE_MANIFEST: AndroidReleaseManifest = {
  success: true,
  platform: "android",
  latestVersion: "1.2.0",
  versionCode: 12,
  minimumSupportedVersionCode: 10,
  downloadUrl: "https://famora-eight.vercel.app/downloads/senvamily-1.2.0.apk",
  releaseNotes: ["Push notifications", "Performance improvements"],
  fileSize: 25_000_000,
  sha256: SAMPLE_SHA,
  publishedAt: "2026-11-24T10:00:00Z",
  enabled: true,
};

describe("Senvamily Android APK Update Policy", () => {
  it("evaluates up_to_date, optional, mandatory, disabled, and no-downgrade states", () => {
    expect(evaluateAndroidUpdate(BASE_MANIFEST, 12).status).toBe("up_to_date");
    expect(evaluateAndroidUpdate(BASE_MANIFEST, 15).status).toBe("up_to_date");
    expect(evaluateAndroidUpdate(BASE_MANIFEST, 11).status).toBe("optional");
    expect(evaluateAndroidUpdate(BASE_MANIFEST, 10).status).toBe("optional");
    expect(evaluateAndroidUpdate(BASE_MANIFEST, 9).status).toBe("mandatory");
    expect(evaluateAndroidUpdate({ ...BASE_MANIFEST, enabled: false }, 5).status).toBe("disabled");
  });

  it("enforces HTTPS and trusted APK download host allowlist", () => {
    expect(isTrustedApkUrl("https://famora-eight.vercel.app/downloads/senvamily-1.2.0.apk")).toBe(
      true
    );
    expect(isTrustedApkUrl("http://famora-eight.vercel.app/downloads/senvamily-1.2.0.apk")).toBe(
      false
    );
    expect(isTrustedApkUrl("https://untrusted-host.example/senvamily.apk")).toBe(false);
  });

  it("validates SHA-256 hex format and disables malformed manifests", () => {
    expect(isValidSha256Hex(SAMPLE_SHA)).toBe(true);
    expect(isValidSha256Hex("not-a-sha256")).toBe(false);

    expect(
      evaluateAndroidUpdate({ ...BASE_MANIFEST, sha256: "invalid" }, 5).status
    ).toBe("disabled");
    expect(
      evaluateAndroidUpdate({ ...BASE_MANIFEST, downloadUrl: "https://evil.example/a.apk" }, 5)
        .status
    ).toBe("disabled");
  });

  it("validates release manifest schema and formats APK size", () => {
    expect(androidReleaseManifestSchema.safeParse(BASE_MANIFEST).success).toBe(true);
    expect(formatApkSize(25_165_824)).toBe("24.0 MB");
    expect(formatApkSize(0)).toBe("—");
  });
});
