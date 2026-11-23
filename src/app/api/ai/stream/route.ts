import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import { retrieveAuthorizedFamilyContext } from "@/features/ai/context";
import {
  AI_RATE_LIMIT_PER_HOUR,
  aiPromptInputSchema,
  checkAiRateLimit,
} from "@/features/ai/policy";
import { generateAiAssistantResponse } from "@/features/ai/provider";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = aiPromptInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const [{ data: perms }, { data: actor }] = await Promise.all([
      supabase.rpc("get_my_family_permissions", {
        p_family_id: parsed.data.familyId,
      }),
      supabase
        .from("family_members")
        .select("id, display_name")
        .eq("family_id", parsed.data.familyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string; display_name: string }>(),
    ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );
    if (!actor || !permSet.has("ai.assistant.use")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: usageCount } = await supabase
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("family_id", parsed.data.familyId)
      .eq("member_id", actor.id)
      .gte("created_at", oneHourAgo);

    const rate = checkAiRateLimit(usageCount ?? 0, AI_RATE_LIMIT_PER_HOUR);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded." },
        { status: 429 }
      );
    }

    const context = await retrieveAuthorizedFamilyContext({
      familyId: parsed.data.familyId,
      memberName: actor.display_name,
      permissions: permSet,
    });

    const result = await generateAiAssistantResponse({
      prompt: parsed.data.prompt,
      context,
      permissions: permSet,
    });

    const encoder = new TextEncoder();
    const chunks = result.content.match(/.{1,36}/gs) ?? [result.content];
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise((r) => setTimeout(r, 12));
        }
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "AI assistant request failed." },
      { status: 500 }
    );
  }
}
