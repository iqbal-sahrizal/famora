import { NextResponse } from "next/server";
import { z } from "zod";
import { fcmDeviceRegistrationSchema } from "@/features/notifications/logic";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = fcmDeviceRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid device payload" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("user_devices").upsert(
      {
        user_id: user.id,
        device_label: parsed.data.deviceLabel,
        device_fingerprint: parsed.data.deviceFingerprint,
        platform: "android_fcm",
        fcm_token: parsed.data.fcmToken,
        app_version_code: parsed.data.appVersionCode ?? null,
        app_version_name: parsed.data.appVersionName ?? null,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "user_id,device_fingerprint" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to register device" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = z
      .object({
        deviceFingerprint: z.string().trim().min(8).max(160).optional(),
        fcmToken: z.string().trim().min(16).max(4096).optional(),
      })
      .safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid unregister payload" }, { status: 400 });
    }

    let query = supabase
      .from("user_devices")
      .update({
        fcm_token: null,
        revoked_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (parsed.data.deviceFingerprint) {
      query = query.eq("device_fingerprint", parsed.data.deviceFingerprint);
    } else if (parsed.data.fcmToken) {
      query = query.eq("fcm_token", parsed.data.fcmToken);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to unregister device" }, { status: 500 });
  }
}
