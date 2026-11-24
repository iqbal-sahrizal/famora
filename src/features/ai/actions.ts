"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import { retrieveAuthorizedFamilyContext } from "./context";
import {
  AI_RATE_LIMIT_PER_HOUR,
  aiPromptInputSchema,
  checkAiRateLimit,
  classifyAiActionTier,
} from "./policy";
import { generateAiAssistantResponse } from "./provider";
import type { AiProposedAction } from "./types";

async function getAiActor(familyId: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: perms }, { data: actor }] = await Promise.all([
    supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
    supabase
      .from("family_members")
      .select("id, display_name")
      .eq("family_id", familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string; display_name: string }>(),
  ]);

  const permSet = new Set(
    ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
      (p) => p.permission_key
    )
  );
  return { supabase, actor, permSet };
}

export async function sendAiPromptAction(input: {
  familyId: string;
  conversationId?: string | null;
  prompt: string;
}) {
  const parsed = aiPromptInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid prompt.",
    };
  }

  const { supabase, actor, permSet } = await getAiActor(parsed.data.familyId);
  if (!actor || !permSet.has("ai.assistant.use")) {
    return { ok: false, error: "Missing permission: ai.assistant.use" };
  }

  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: usageCount } = await supabase
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("family_id", parsed.data.familyId)
    .eq("member_id", actor.id)
    .eq("status", "ok")
    .gte("created_at", oneHourAgo);

  const rate = checkAiRateLimit(usageCount ?? 0, AI_RATE_LIMIT_PER_HOUR);
  if (!rate.allowed) {
    await supabase.from("ai_usage_logs").insert({
      family_id: parsed.data.familyId,
      member_id: actor.id,
      provider_name: "famora_policy",
      model_name: "rate_limiter",
      status: "rate_limited",
    });
    return {
      ok: false,
      error: "Hourly AI request limit reached. Please try again shortly.",
    };
  }

  let conversationId = parsed.data.conversationId;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (!conversationId) {
    const { data: conv, error: convErr } = await supabase
      .from("ai_conversations")
      .insert({
        family_id: parsed.data.familyId,
        member_id: actor.id,
        title: parsed.data.prompt.slice(0, 80),
      })
      .select("id")
      .single<{ id: string }>();

    if (convErr || !conv) {
      return { ok: false, error: convErr?.message ?? "Could not start chat." };
    }
    conversationId = conv.id;
  } else {
    const { data: existingConv } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("family_id", parsed.data.familyId)
      .eq("member_id", actor.id)
      .maybeSingle<{ id: string }>();

    if (!existingConv) {
      return { ok: false, error: "Conversation not found." };
    }

    const { data: priorRows } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .eq("family_id", parsed.data.familyId)
      .order("created_at", { ascending: false })
      .limit(10);

    history = ((priorRows ?? []) as Array<{ role: "user" | "assistant"; content: string }>).reverse();
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
    history,
  });

  const { error: userMsgErr } = await supabase.from("ai_messages").insert({
    family_id: parsed.data.familyId,
    conversation_id: conversationId,
    member_id: actor.id,
    role: "user",
    content: parsed.data.prompt,
  });
  if (userMsgErr) {
    return { ok: false, error: userMsgErr.message };
  }

  const { data: assistantMsg, error: msgErr } = await supabase
    .from("ai_messages")
    .insert({
      family_id: parsed.data.familyId,
      conversation_id: conversationId,
      member_id: actor.id,
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls,
      proposed_action: result.proposedAction,
      action_status: result.proposedAction ? "pending_confirmation" : "none",
      provider_name: result.providerName,
      model_name: result.modelName,
    })
    .select("id")
    .single<{ id: string }>();

  await Promise.all([
    supabase.from("ai_usage_logs").insert({
      family_id: parsed.data.familyId,
      member_id: actor.id,
      provider_name: result.providerName,
      model_name: result.modelName,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      status: "ok",
    }),
    supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId),
  ]);

  if (msgErr) {
    return { ok: false, error: msgErr.message };
  }

  revalidatePath(routes.familyDomain(parsed.data.familyId, "ai"));
  return {
    ok: true,
    conversationId,
    messageId: assistantMsg?.id,
    content: result.content,
    proposedAction: result.proposedAction,
  };
}

const aiMessageActionSchema = z.object({
  familyId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export async function confirmAiProposedAction(input: {
  familyId: string;
  messageId: string;
}) {
  const parsed = aiMessageActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid action request." };

  const { supabase, actor, permSet } = await getAiActor(parsed.data.familyId);
  if (!actor || !permSet.has("ai.assistant.use")) {
    return { ok: false, error: "Unauthorized." };
  }

  const { data: msg } = await supabase
    .from("ai_messages")
    .select("id, proposed_action, action_status")
    .eq("id", parsed.data.messageId)
    .eq("family_id", parsed.data.familyId)
    .eq("member_id", actor.id)
    .maybeSingle<{
      id: string;
      proposed_action: AiProposedAction | null;
      action_status: string;
    }>();

  if (!msg || !msg.proposed_action || msg.action_status !== "pending_confirmation") {
    return { ok: false, error: "No pending action found." };
  }

  const tier = classifyAiActionTier(msg.proposed_action.actionType);
  if (tier === "restricted") {
    return { ok: false, error: "Restricted action cannot be executed by AI." };
  }

  if (msg.proposed_action.actionType === "create_shopping_items" && !permSet.has("shopping.manage")) {
    return { ok: false, error: "Missing permission: shopping.manage" };
  }
  if (msg.proposed_action.actionType === "create_task" && !permSet.has("tasks.manage_all")) {
    return { ok: false, error: "Missing permission: tasks.manage_all" };
  }
  if (msg.proposed_action.actionType === "create_calendar_event" && !permSet.has("calendar.family.manage")) {
    return { ok: false, error: "Missing permission: calendar.family.manage" };
  }

  const supportedTypes = new Set([
    "create_shopping_items",
    "create_task",
    "create_calendar_event",
  ]);
  if (!supportedTypes.has(msg.proposed_action.actionType)) {
    return { ok: false, error: "This proposed action type is not supported yet." };
  }

  const { data: claimed, error: claimErr } = await supabase
    .from("ai_messages")
    .update({ action_status: "confirmed" })
    .eq("id", msg.id)
    .eq("family_id", parsed.data.familyId)
    .eq("member_id", actor.id)
    .eq("action_status", "pending_confirmation")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (claimErr || !claimed) {
    return { ok: false, error: claimErr?.message ?? "No pending action found." };
  }

  const revertPending = async () => {
    await supabase
      .from("ai_messages")
      .update({ action_status: "pending_confirmation" })
      .eq("id", msg.id)
      .eq("family_id", parsed.data.familyId);
  };

  if (msg.proposed_action.actionType === "create_shopping_items") {
    const items =
      (msg.proposed_action.payload.items as Array<{
        name: string;
        category: string;
        quantity: string;
      }>) ?? [];

    if (items.length > 0) {
      const { error: insertErr } = await supabase.from("shopping_items").insert(
        items.map((item) => ({
          family_id: parsed.data.familyId,
          added_by_member_id: actor.id,
          name: item.name,
          category: item.category || "Groceries",
          quantity: item.quantity || "1",
          unit: "pcs",
        }))
      );
      if (insertErr) {
        await revertPending();
        return { ok: false, error: insertErr.message };
      }
    }
    revalidatePath(routes.familyDomain(parsed.data.familyId, "shopping"));
  } else if (msg.proposed_action.actionType === "create_task") {
    const p = msg.proposed_action.payload;
    const title = String(p.title ?? "").trim();
    if (!title) {
      await revertPending();
      return { ok: false, error: "Invalid task title in proposed action." };
    }
    const { error: taskErr } = await supabase.from("tasks").insert({
      family_id: parsed.data.familyId,
      created_by_member_id: actor.id,
      title,
      description: String(p.description ?? ""),
      category: String(p.category ?? "household"),
      priority: String(p.priority ?? "normal"),
      due_at: p.dueAt ? String(p.dueAt) : null,
      status: "todo",
    });
    if (taskErr) {
      await revertPending();
      return { ok: false, error: taskErr.message };
    }
    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
  } else if (msg.proposed_action.actionType === "create_calendar_event") {
    const p = msg.proposed_action.payload;
    const title = String(p.title ?? "").trim();
    const startAt = String(p.startAt ?? "");
    const endAt = String(p.endAt ?? "");
    if (!title || !startAt || !endAt) {
      await revertPending();
      return { ok: false, error: "Invalid calendar event details in proposed action." };
    }
    const { error: calErr } = await supabase.from("calendar_events").insert({
      family_id: parsed.data.familyId,
      created_by_member_id: actor.id,
      title,
      description: String(p.description ?? ""),
      location: String(p.location ?? ""),
      start_at: startAt,
      end_at: endAt,
      all_day: Boolean(p.allDay),
      category: String(p.category ?? "family"),
      visibility: "family",
    });
    if (calErr) {
      await revertPending();
      return { ok: false, error: calErr.message };
    }
    revalidatePath(routes.familyDomain(parsed.data.familyId, "calendar"));
  }

  revalidatePath(routes.familyDomain(parsed.data.familyId, "ai"));
  revalidatePath(routes.familyDashboard(parsed.data.familyId));
  return { ok: true };
}

export async function cancelAiProposedAction(input: {
  familyId: string;
  messageId: string;
}) {
  const parsed = aiMessageActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid action request." };

  const { supabase, actor } = await getAiActor(parsed.data.familyId);
  if (!actor) return { ok: false, error: "Unauthorized." };

  const { error } = await supabase
    .from("ai_messages")
    .update({ action_status: "cancelled" })
    .eq("id", parsed.data.messageId)
    .eq("family_id", parsed.data.familyId)
    .eq("member_id", actor.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.familyDomain(parsed.data.familyId, "ai"));
  return { ok: true };
}
