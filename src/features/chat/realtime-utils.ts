import type { PermissionKey } from "@/types/domain";
import type { ChatMessageItem, ConversationKind } from "./types";

/**
 * Deterministically merges incoming/realtime/paginated messages with existing ones.
 * Deduplicates by both persisted `id` and optimistic `clientNonce` so duplicate
 * delivery or retry echoes never create duplicate bubbles.
 */
export function mergeAndSortMessages(
  existing: ChatMessageItem[],
  incoming: ChatMessageItem[]
): ChatMessageItem[] {
  const byId = new Map<string, ChatMessageItem>();
  const nonceToId = new Map<string, string>();

  const upsert = (msg: ChatMessageItem) => {
    const existingIdForNonce = msg.clientNonce
      ? nonceToId.get(msg.clientNonce)
      : undefined;

    // Replace optimistic placeholder when the persisted server row arrives
    if (existingIdForNonce && existingIdForNonce !== msg.id) {
      byId.delete(existingIdForNonce);
    }

    const prev = byId.get(msg.id);
    const merged: ChatMessageItem = prev
      ? {
          ...prev,
          ...msg,
          // Keep existing reactions if incoming realtime payload didn't carry them
          reactions:
            msg.reactions.length > 0 || prev.reactions.length === 0
              ? msg.reactions
              : prev.reactions,
          deliveryStatus: msg.deliveryStatus ?? "sent",
        }
      : {
          ...msg,
          deliveryStatus: msg.deliveryStatus ?? "sent",
        };

    byId.set(msg.id, merged);
    if (merged.clientNonce) {
      nonceToId.set(merged.clientNonce, merged.id);
    }
  };

  for (const m of existing) upsert(m);
  for (const m of incoming) upsert(m);

  return Array.from(byId.values()).sort((a, b) => {
    const timeDiff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
}

export function markOptimisticFailed(
  messages: ChatMessageItem[],
  clientNonce: string
): ChatMessageItem[] {
  return messages.map((m) =>
    m.clientNonce === clientNonce ? { ...m, deliveryStatus: "failed" } : m
  );
}

export function computeUnreadCount(params: {
  messages: Array<{
    createdAt: string;
    senderMemberId: string | null;
    deletedAt: string | null;
  }>;
  lastReadAt: string | null;
  currentMemberId: string | null;
}): number {
  const lastReadMs = params.lastReadAt
    ? new Date(params.lastReadAt).getTime()
    : 0;
  let count = 0;
  for (const m of params.messages) {
    if (m.deletedAt) continue;
    if (params.currentMemberId && m.senderMemberId === params.currentMemberId) {
      continue;
    }
    if (new Date(m.createdAt).getTime() > lastReadMs) {
      count += 1;
    }
  }
  return count;
}

export function shouldAutoScrollToBottom(
  metrics: { scrollHeight: number; scrollTop: number; clientHeight: number },
  thresholdPx = 120
): boolean {
  const distanceFromBottom =
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

export function computePreservedScrollTop(
  prevScrollHeight: number,
  prevScrollTop: number,
  nextScrollHeight: number
): number {
  const addedHeight = Math.max(0, nextScrollHeight - prevScrollHeight);
  return prevScrollTop + addedHeight;
}

export function canAccessConversation(params: {
  conversationKind: ConversationKind;
  participantMemberIds: string[];
  actorMemberId: string | null;
  actorPermissions: Set<PermissionKey>;
}): boolean {
  if (!params.actorMemberId) return false;
  if (!params.actorPermissions.has("chat.family.participate")) return false;
  if (
    params.conversationKind === "adults_group" &&
    !params.actorPermissions.has("chat.adults_only.participate")
  ) {
    return false;
  }
  return params.participantMemberIds.includes(params.actorMemberId);
}
