import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import { computeUnreadCount } from "./realtime-utils";
import type {
  ChatConversationItem,
  ChatMessageItem,
  ChatPageData,
  ChatParticipantInfo,
  ChatReactionSummary,
  ConversationKind,
} from "./types";

export const CHAT_PAGE_SIZE = 30;

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_member_id: string | null;
  client_nonce: string | null;
  body: string;
  reply_to_message_id: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  is_pinned: boolean;
  pinned_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface RawReactionRow {
  message_id: string;
  member_id: string;
  emoji: string;
}

export async function hydrateMessagesPage(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  conversationId: string;
  currentMemberId: string | null;
  memberNameMap: Map<string, string>;
  beforeCreatedAt?: string | null;
  limit?: number;
}): Promise<{ messages: ChatMessageItem[]; hasMoreOlder: boolean }> {
  const limit = params.limit ?? CHAT_PAGE_SIZE;
  let query = params.supabase
    .from("chat_messages")
    .select(
      "id, conversation_id, sender_member_id, client_nonce, body, reply_to_message_id, attachment_path, attachment_name, attachment_mime_type, attachment_size_bytes, is_pinned, pinned_at, edited_at, deleted_at, created_at"
    )
    .eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (params.beforeCreatedAt) {
    query = query.lt("created_at", params.beforeCreatedAt);
  }

  const { data: rawRows } = await query;
  const rows = ((rawRows as RawMessageRow[] | null) ?? []).slice();
  const hasMoreOlder = rows.length > limit;
  const pageRows = hasMoreOlder ? rows.slice(0, limit) : rows;
  pageRows.reverse(); // chronological ascending

  const msgIds = pageRows.map((r) => r.id);
  const replyIds = Array.from(
    new Set(pageRows.map((r) => r.reply_to_message_id).filter((v): v is string => Boolean(v)))
  );

  const [{ data: reactionsData }, { data: replyRowsData }] = await Promise.all([
    msgIds.length > 0
      ? params.supabase
          .from("chat_message_reactions")
          .select("message_id, member_id, emoji")
          .in("message_id", msgIds)
      : Promise.resolve({ data: [] as RawReactionRow[] }),
    replyIds.length > 0
      ? params.supabase
          .from("chat_messages")
          .select("id, sender_member_id, body, deleted_at")
          .in("id", replyIds)
      : Promise.resolve({ data: [] as Array<{ id: string; sender_member_id: string | null; body: string; deleted_at: string | null }> }),
  ]);

  const reactionsByMessage = new Map<string, ChatReactionSummary[]>();
  const grouped = new Map<string, Map<string, { count: number; reactedByMe: boolean; names: string[] }>>();

  for (const r of (reactionsData as RawReactionRow[] | null) ?? []) {
    let byEmoji = grouped.get(r.message_id);
    if (!byEmoji) {
      byEmoji = new Map();
      grouped.set(r.message_id, byEmoji);
    }
    const entry = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false, names: [] };
    entry.count += 1;
    if (params.currentMemberId && r.member_id === params.currentMemberId) {
      entry.reactedByMe = true;
    }
    entry.names.push(params.memberNameMap.get(r.member_id) ?? "Family member");
    byEmoji.set(r.emoji, entry);
  }

  for (const [msgId, byEmoji] of grouped.entries()) {
    reactionsByMessage.set(
      msgId,
      Array.from(byEmoji.entries()).map(([emoji, info]) => ({
        emoji,
        count: info.count,
        reactedByMe: info.reactedByMe,
        memberNames: info.names,
      }))
    );
  }

  const replyMap = new Map<string, { senderName: string; body: string }>();
  for (const rr of (replyRowsData as Array<{ id: string; sender_member_id: string | null; body: string; deleted_at: string | null }> | null) ?? []) {
    replyMap.set(rr.id, {
      senderName:
        (rr.sender_member_id && params.memberNameMap.get(rr.sender_member_id)) ||
        "Family member",
      body: rr.deleted_at ? "Message removed" : rr.body || "Attachment",
    });
  }

  const messages: ChatMessageItem[] = pageRows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    senderMemberId: r.sender_member_id,
    senderName:
      (r.sender_member_id && params.memberNameMap.get(r.sender_member_id)) ||
      "Family member",
    clientNonce: r.client_nonce,
    body: r.deleted_at ? "" : r.body,
    replyToMessageId: r.reply_to_message_id,
    replyPreview: r.reply_to_message_id
      ? replyMap.get(r.reply_to_message_id) ?? null
      : null,
    attachmentPath: r.deleted_at ? null : r.attachment_path,
    attachmentName: r.deleted_at ? null : r.attachment_name,
    attachmentMimeType: r.deleted_at ? null : r.attachment_mime_type,
    attachmentSizeBytes: r.deleted_at ? null : r.attachment_size_bytes,
    isPinned: r.is_pinned && !r.deleted_at,
    pinnedAt: r.pinned_at,
    editedAt: r.edited_at,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    reactions: r.deleted_at ? [] : reactionsByMessage.get(r.id) ?? [],
    deliveryStatus: "sent",
  }));

  return { messages, hasMoreOlder };
}

export async function getChatPageData(
  familyId: string,
  requestedConversationId?: string | null
): Promise<ChatPageData> {
  const denied: ChatPageData = {
    canParticipate: false,
    canParticipateAdultsOnly: false,
    currentMemberId: null,
    currentMemberName: "Member",
    members: [],
    conversations: [],
    initialConversationId: null,
    initialMessages: [],
    hasMoreOlder: false,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return denied;

    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: familyId,
    });
    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const canParticipate = permSet.has("chat.family.participate");
    const canParticipateAdultsOnly = permSet.has("chat.adults_only.participate");
    if (!canParticipate) return denied;

    const { data: membersData } = await supabase
      .from("family_members")
      .select("id, user_id, display_name, status")
      .eq("family_id", familyId)
      .eq("status", "active");

    const members = ((membersData as Array<{ id: string; user_id: string | null; display_name: string }>) ?? []).map(
      (m) => ({
        id: m.id,
        userId: m.user_id,
        displayName: m.display_name,
      })
    );
    const currentMember = members.find((m) => m.userId === user.id) ?? null;
    if (!currentMember) return denied;

    const memberNameMap = new Map<string, string>(
      members.map((m) => [m.id, m.displayName])
    );

    // Ensure default Family Group conversation exists and current member is enrolled
    const { data: existingConvs } = await supabase
      .from("chat_conversations")
      .select("id, family_id, kind, title, last_message_at")
      .eq("family_id", familyId)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    let convRows =
      (existingConvs as Array<{
        id: string;
        family_id: string;
        kind: ConversationKind;
        title: string;
        last_message_at: string | null;
      }> | null) ?? [];

    let familyGroup = convRows.find((c) => c.kind === "family_group");
    if (!familyGroup) {
      const { data: created } = await supabase
        .from("chat_conversations")
        .insert({
          family_id: familyId,
          kind: "family_group",
          title: "Family Chat",
          created_by_member_id: currentMember.id,
        })
        .select("id, family_id, kind, title, last_message_at")
        .maybeSingle<{
          id: string;
          family_id: string;
          kind: ConversationKind;
          title: string;
          last_message_at: string | null;
        }>();
      if (created) {
        familyGroup = created;
        convRows = [created, ...convRows];
      }
    }

    if (familyGroup) {
      await supabase
        .from("chat_participants")
        .upsert(
          {
            family_id: familyId,
            conversation_id: familyGroup.id,
            member_id: currentMember.id,
            role: "member",
          },
          { onConflict: "conversation_id,member_id", ignoreDuplicates: true }
        );
    }

    if (canParticipateAdultsOnly) {
      const adultsGroups = convRows.filter((c) => c.kind === "adults_group");
      for (const ag of adultsGroups) {
        await supabase
          .from("chat_participants")
          .upsert(
            {
              family_id: familyId,
              conversation_id: ag.id,
              member_id: currentMember.id,
              role: "member",
            },
            { onConflict: "conversation_id,member_id", ignoreDuplicates: true }
          );
      }
    }

    const visibleConvs = convRows.filter(
      (c) => c.kind !== "adults_group" || canParticipateAdultsOnly
    );
    const convIds = visibleConvs.map((c) => c.id);

    const [{ data: participantRows }, { data: recentMsgs }] = await Promise.all([
      convIds.length > 0
        ? supabase
            .from("chat_participants")
            .select("conversation_id, member_id, role, last_read_message_id, last_read_at")
            .in("conversation_id", convIds)
        : Promise.resolve({ data: [] }),
      convIds.length > 0
        ? supabase
            .from("chat_messages")
            .select("id, conversation_id, sender_member_id, body, attachment_name, deleted_at, created_at")
            .in("conversation_id", convIds)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] }),
    ]);

    const participantsByConv = new Map<string, ChatParticipantInfo[]>();
    for (const p of (participantRows as Array<{
      conversation_id: string;
      member_id: string;
      role: "owner" | "member";
      last_read_message_id: string | null;
      last_read_at: string;
    }> | null) ?? []) {
      const list = participantsByConv.get(p.conversation_id) ?? [];
      list.push({
        memberId: p.member_id,
        displayName: memberNameMap.get(p.member_id) ?? "Family member",
        role: p.role,
        lastReadMessageId: p.last_read_message_id,
        lastReadAt: p.last_read_at,
      });
      participantsByConv.set(p.conversation_id, list);
    }

    const msgsByConv = new Map<
      string,
      Array<{
        senderMemberId: string | null;
        body: string;
        attachmentName: string | null;
        deletedAt: string | null;
        createdAt: string;
      }>
    >();
    for (const m of (recentMsgs as Array<{
      conversation_id: string;
      sender_member_id: string | null;
      body: string;
      attachment_name: string | null;
      deleted_at: string | null;
      created_at: string;
    }> | null) ?? []) {
      const list = msgsByConv.get(m.conversation_id) ?? [];
      list.push({
        senderMemberId: m.sender_member_id,
        body: m.body,
        attachmentName: m.attachment_name,
        deletedAt: m.deleted_at,
        createdAt: m.created_at,
      });
      msgsByConv.set(m.conversation_id, list);
    }

    const conversations: ChatConversationItem[] = visibleConvs
      .filter((c) => {
        const ps = participantsByConv.get(c.id) ?? [];
        return (
          c.kind === "family_group" ||
          ps.some((p) => p.memberId === currentMember.id)
        );
      })
      .map((c) => {
        const ps = participantsByConv.get(c.id) ?? [];
        const myPart = ps.find((p) => p.memberId === currentMember.id) ?? null;
        const convMsgs = msgsByConv.get(c.id) ?? [];
        const latest = convMsgs.find((m) => !m.deletedAt);
        const otherMember =
          c.kind === "direct"
            ? ps.find((p) => p.memberId !== currentMember.id)
            : null;
        const resolvedTitle =
          c.kind === "direct" && otherMember
            ? otherMember.displayName
            : c.title;

        return {
          id: c.id,
          familyId: c.family_id,
          kind: c.kind,
          title: resolvedTitle,
          lastMessageAt: c.last_message_at,
          lastMessagePreview: latest
            ? latest.body || (latest.attachmentName ? `Attachment: ${latest.attachmentName}` : "")
            : null,
          unreadCount: computeUnreadCount({
            messages: convMsgs,
            lastReadAt: myPart?.lastReadAt ?? null,
            currentMemberId: currentMember.id,
          }),
          participants: ps,
        };
      });

    const initialConversationId =
      (requestedConversationId &&
        conversations.some((c) => c.id === requestedConversationId) &&
        requestedConversationId) ||
      conversations[0]?.id ||
      null;

    const initialPage = initialConversationId
      ? await hydrateMessagesPage({
          supabase,
          conversationId: initialConversationId,
          currentMemberId: currentMember.id,
          memberNameMap,
        })
      : { messages: [], hasMoreOlder: false };

    return {
      canParticipate,
      canParticipateAdultsOnly,
      currentMemberId: currentMember.id,
      currentMemberName: currentMember.displayName,
      members: members.map((m) => ({ id: m.id, displayName: m.displayName })),
      conversations,
      initialConversationId,
      initialMessages: initialPage.messages,
      hasMoreOlder: initialPage.hasMoreOlder,
    };
  } catch {
    return denied;
  }
}
