import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import { AI_RATE_LIMIT_PER_HOUR, checkAiRateLimit } from "./policy";
import type {
  AiAssistantPageData,
  AiConversationItem,
  AiMessageItem,
  AiProposedAction,
  AiToolCallRecord,
} from "./types";

export async function getAiAssistantPageData(
  familyId: string,
  requestedConvId?: string | null
): Promise<AiAssistantPageData> {
  const denied: AiAssistantPageData = {
    canUse: false,
    canViewFinance: false,
    conversations: [],
    activeConversationId: null,
    messages: [],
    rateLimitRemaining: 0,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return denied;

    const [{ data: perms }, { data: actor }] = await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase
        .from("family_members")
        .select("id")
        .eq("family_id", familyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string }>(),
    ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );
    if (!actor || !permSet.has("ai.assistant.use")) return denied;

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const [{ data: convRows }, { count: usageCount }] = await Promise.all([
      supabase
        .from("ai_conversations")
        .select("id, title, updated_at")
        .eq("family_id", familyId)
        .eq("member_id", actor.id)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("family_id", familyId)
        .eq("member_id", actor.id)
        .eq("status", "ok")
        .gte("created_at", oneHourAgo),
    ]);

    const conversations: AiConversationItem[] = (
      (convRows as Array<{ id: string; title: string; updated_at: string }>) ??
      []
    ).map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
    }));

    const activeConversationId =
      (requestedConvId &&
        conversations.some((c) => c.id === requestedConvId) &&
        requestedConvId) ||
      conversations[0]?.id ||
      null;

    let messages: AiMessageItem[] = [];
    if (activeConversationId) {
      const { data: msgRows } = await supabase
        .from("ai_messages")
        .select(
          "id, conversation_id, role, content, tool_calls, proposed_action, action_status, provider_name, model_name, created_at"
        )
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true });

      messages = (
        (msgRows as Array<{
          id: string;
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
          tool_calls: AiToolCallRecord[] | null;
          proposed_action: AiProposedAction | null;
          action_status: "none" | "pending_confirmation" | "confirmed" | "cancelled";
          provider_name: string;
          model_name: string;
          created_at: string;
        }>) ?? []
      ).map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        role: m.role,
        content: m.content,
        toolCalls: m.tool_calls ?? [],
        proposedAction: m.proposed_action,
        actionStatus: m.action_status,
        providerName: m.provider_name,
        modelName: m.model_name,
        createdAt: m.created_at,
      }));
    }

    const rate = checkAiRateLimit(usageCount ?? 0, AI_RATE_LIMIT_PER_HOUR);

    return {
      canUse: true,
      canViewFinance: permSet.has("finance.transactions.manage"),
      conversations,
      activeConversationId,
      messages,
      rateLimitRemaining: rate.remaining,
    };
  } catch {
    return denied;
  }
}
