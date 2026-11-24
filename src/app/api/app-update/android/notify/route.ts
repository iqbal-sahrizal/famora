import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { dispatchFcmPushNotification } from "@/features/notifications/fcm";
import { isTrustedApkUrl } from "@/lib/app-update/policy";
import { clientEnv, getServerEnv } from "@/lib/env";

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATIONS_DISPATCH_SECRET || process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!secret || bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverEnv = getServerEnv();
  if (!clientEnv.NEXT_PUBLIC_SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase service credentials not configured" }, { status: 500 });
  }

  const admin = createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: release } = await admin
    .from("app_releases")
    .select("version_code, minimum_supported_version_code, latest_version, download_url, sha256, enabled")
    .eq("platform", "android")
    .eq("enabled", true)
    .order("version_code", { ascending: false })
    .limit(1)
    .maybeSingle<{
      version_code: number;
      minimum_supported_version_code: number;
      latest_version: string;
      download_url: string;
      sha256: string;
      enabled: boolean;
    }>();

  if (!release || !release.enabled || !isTrustedApkUrl(release.download_url)) {
    return NextResponse.json({ error: "No valid enabled Android release found" }, { status: 404 });
  }

  // Verify APK URL is reachable before sending notifications
  const headRes = await fetch(release.download_url, { method: "HEAD" }).catch(() => null);
  if (!headRes || !headRes.ok) {
    return NextResponse.json(
      { error: "APK download URL is not reachable yet" },
      { status: 422 }
    );
  }

  // Idempotency check per versionCode
  const { error: lockErr } = await admin
    .from("app_release_notifications")
    .insert({ release_version_code: release.version_code, recipients_count: 0 });

  if (lockErr?.code === "23505") {
    return NextResponse.json({ ok: true, deduplicated: true, versionCode: release.version_code });
  }

  const { data: devices } = await admin
    .from("user_devices")
    .select("id, user_id, fcm_token, app_version_code")
    .eq("platform", "android_fcm")
    .is("revoked_at", null)
    .not("fcm_token", "is", null);

  const targets = (devices ?? []).filter(
    (d) =>
      typeof d.fcm_token === "string" &&
      (d.app_version_code == null || d.app_version_code < release.version_code)
  );

  let sentCount = 0;
  const isMandatory = release.minimum_supported_version_code >= release.version_code;

  for (const device of targets) {
    const res = await dispatchFcmPushNotification({
      fcmToken: device.fcm_token as string,
      title: isMandatory ? "Update Diperlukan" : "Senvamily Update Tersedia",
      body: isMandatory
        ? "Versi Senvamily yang kamu gunakan sudah tidak didukung. Silakan update untuk melanjutkan."
        : "Versi Senvamily terbaru sudah tersedia. Update sekarang untuk menikmati fitur terbaru.",
      deepLink: "/?update=1",
      channelId: "senvamily_updates",
      data: {
        type: "app_update",
        versionCode: String(release.version_code),
      },
    });
    if (res.ok) {
      sentCount += 1;
    } else if (res.unregistered) {
      await admin
        .from("user_devices")
        .update({ fcm_token: null, revoked_at: new Date().toISOString() })
        .eq("id", device.id);
    }
  }

  await admin
    .from("app_release_notifications")
    .update({ recipients_count: sentCount })
    .eq("release_version_code", release.version_code);

  return NextResponse.json({
    ok: true,
    versionCode: release.version_code,
    targetedDevices: targets.length,
    sentCount,
  });
}
