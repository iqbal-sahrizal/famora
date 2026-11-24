import { NextResponse } from "next/server";
import { processPushOutboxItem } from "@/features/notifications/outbox";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const dispatchSecret = process.env.NOTIFICATIONS_DISPATCH_SECRET || process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const isCronAuthorized = Boolean(dispatchSecret && bearer && bearer === dispatchSecret);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!isCronAuthorized && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    let query = supabase
      .from("notification_outbox")
      .select("id, family_id, attempts, max_attempts")
      .eq("channel", "push")
      .in("status", ["pending", "failed"])
      .lte("next_attempt_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(25);

    if (!isCronAuthorized && user) {
      query = query.eq("recipient_user_id", user.id);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const eligible = (rows ?? []).filter((r) => r.attempts < r.max_attempts);
    let delivered = 0;
    let failed = 0;

    for (const item of eligible) {
      const res = await processPushOutboxItem({
        familyId: item.family_id,
        outboxId: item.id,
      });
      if (res.ok) delivered += 1;
      else failed += 1;
    }

    return NextResponse.json({
      ok: true,
      processed: eligible.length,
      delivered,
      failed,
    });
  } catch {
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
