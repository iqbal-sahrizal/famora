"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyFamilyMembers } from "@/features/notifications/triggers";
import type { PermissionKey } from "@/types/domain";
import { canAccessConversation } from "./realtime-utils";
import { hydrateMessagesPage } from "./server";
import type { ChatMessageItem, ConversationKind } from "./types";
import {
  editMessageSchema,
  sendMessageMetaSchema,
  validateChatAttachment,
} from "./validation";

async function requireChatAccess(familyId: string, conversationId: string) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: perms }, { data: actor }, { data: conv }, { data: participants }] =
    await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase
        .from("family_members")
        .select("id, display_name")
        .eq("family_id", familyId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle<{ id: string; display_name: string }>(),
      supabase
        .from("chat_conversations")
        .select("id, family_id, kind")
        .eq("id", conversationId)
        .eq("family_id", familyId)
        .maybeSingle<{ id: string; family_id: string; kind: ConversationKind }>(),
      supabase
        .from("chat_participants")
        .select("member_id")
        .eq("conversation_id", conversationId),
    ]);

  const permSet = new Set(
    ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
      (p) => p.permission_key
    )
  );
  const participantIds = (
    (participants as Array<{ member_id: string }>) ?? []
  ).map((p) => p.member_id);

  if (!actor || !conv) {
    return { ok: false as const, error: "Conversation not found or access denied." };
  }

  // Auto-enroll active eligible members into shared family_group / adults_group rooms
  const canAutoJoinRoom =
    (conv.kind === "family_group" && permSet.has("chat.family.participate")) ||
    (conv.kind === "adults_group" &&
      permSet.has("chat.family.participate") &&
      permSet.has("chat.adults_only.participate"));

  if (canAutoJoinRoom && !participantIds.includes(actor.id)) {
    const { error: joinErr } = await supabase.from("chat_participants").insert({
      family_id: familyId,
      conversation_id: conversationId,
      member_id: actor.id,
      role: "member",
    });
    if (!joinErr || joinErr.code === "23505") {
      participantIds.push(actor.id);
    }
  }

  const allowed = canAccessConversation({
    conversationKind: conv.kind,
    participantMemberIds: participantIds,
    actorMemberId: actor.id,
    actorPermissions: permSet,
  });

  if (!allowed) {
    return {
      ok: false as const,
      error: "You do not have permission to access this conversation.",
    };
  }

  return {
    ok: true as const,
    supabase,
    actor,
    permSet,
    conversation: conv,
  };
}

export async function sendChatMessageAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  message?: ChatMessageItem;
}> {
  const parsed = sendMessageMetaSchema.safeParse({
    familyId: formData.get("familyId"),
    conversationId: formData.get("conversationId"),
    body: formData.get("body") ?? "",
    clientNonce: formData.get("clientNonce"),
    replyToMessageId: formData.get("replyToMessageId")
      ? String(formData.get("replyToMessageId"))
      : null,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid message payload.",
    };
  }

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!parsed.data.body && !hasFile) {
    return { ok: false, error: "Write a message or attach a file." };
  }

  const access = await requireChatAccess(
    parsed.data.familyId,
    parsed.data.conversationId
  );
  if (!access.ok) return { ok: false, error: access.error };

  let attachmentPath: string | null = null;
  let attachmentName: string | null = null;
  let attachmentMimeType: string | null = null;
  let attachmentSizeBytes: number | null = null;

  if (hasFile) {
    const check = validateChatAttachment({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!check.valid || !check.safeName) {
      return { ok: false, error: check.error ?? "Invalid attachment." };
    }

    attachmentPath = `${parsed.data.familyId}/${parsed.data.conversationId}/${crypto.randomUUID()}-${check.safeName}`;
    attachmentName = check.safeName;
    attachmentMimeType = file.type;
    attachmentSizeBytes = file.size;

    const { error: uploadErr } = await access.supabase.storage
      .from("chat-attachments")
      .upload(attachmentPath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      return { ok: false, error: uploadErr.message };
    }
  }

  if (parsed.data.replyToMessageId) {
    const { data: replyTarget } = await access.supabase
      .from("chat_messages")
      .select("id")
      .eq("id", parsed.data.replyToMessageId)
      .eq("conversation_id", parsed.data.conversationId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{ id: string }>();
    if (!replyTarget) {
      if (attachmentPath) {
        await access.supabase.storage.from("chat-attachments").remove([attachmentPath]);
      }
      return { ok: false, error: "Reply target message not found in this conversation." };
    }
  }

  const { data: inserted, error: insertErr } = await access.supabase
    .from("chat_messages")
    .insert({
      family_id: parsed.data.familyId,
      conversation_id: parsed.data.conversationId,
      sender_member_id: access.actor.id,
      client_nonce: parsed.data.clientNonce,
      body: parsed.data.body,
      reply_to_message_id: parsed.data.replyToMessageId,
      attachment_path: attachmentPath,
      attachment_name: attachmentName,
      attachment_mime_type: attachmentMimeType,
      attachment_size_bytes: attachmentSizeBytes,
    })
    .select(
      "id, conversation_id, sender_member_id, client_nonce, body, reply_to_message_id, attachment_path, attachment_name, attachment_mime_type, attachment_size_bytes, is_pinned, pinned_at, edited_at, deleted_at, created_at"
    )
    .maybeSingle<{
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
    }>();

  // Idempotent retry handling if client_nonce was already persisted
  if (insertErr?.code === "23505") {
    if (attachmentPath) {
      await access.supabase.storage.from("chat-attachments").remove([attachmentPath]);
    }
    const { data: existing } = await access.supabase
      .from("chat_messages")
      .select(
        "id, conversation_id, sender_member_id, client_nonce, body, reply_to_message_id, attachment_path, attachment_name, attachment_mime_type, attachment_size_bytes, is_pinned, pinned_at, edited_at, deleted_at, created_at"
      )
      .eq("conversation_id", parsed.data.conversationId)
      .eq("client_nonce", parsed.data.clientNonce)
      .maybeSingle<typeof inserted extends infer T ? NonNullable<T> : never>();

    if (existing) {
      return {
        ok: true,
        message: {
          id: existing.id,
          conversationId: existing.conversation_id,
          senderMemberId: existing.sender_member_id,
          senderName: access.actor.display_name,
          clientNonce: existing.client_nonce,
          body: existing.body,
          replyToMessageId: existing.reply_to_message_id,
          replyPreview: null,
          attachmentPath: existing.attachment_path,
          attachmentName: existing.attachment_name,
          attachmentMimeType: existing.attachment_mime_type,
          attachmentSizeBytes: existing.attachment_size_bytes,
          isPinned: existing.is_pinned,
          pinnedAt: existing.pinned_at,
          editedAt: existing.edited_at,
          deletedAt: existing.deleted_at,
          createdAt: existing.created_at,
          reactions: [],
          deliveryStatus: "sent",
        },
      };
    }
  }

  if (insertErr || !inserted) {
    if (attachmentPath) {
      await access.supabase.storage
        .from("chat-attachments")
        .remove([attachmentPath]);
    }
    return { ok: false, error: insertErr?.message ?? "Could not send message." };
  }

  await Promise.all([
    access.supabase
      .from("chat_conversations")
      .update({ last_message_at: inserted.created_at })
      .eq("id", parsed.data.conversationId),
    access.supabase
      .from("chat_participants")
      .update({
        last_read_message_id: inserted.id,
        last_read_at: inserted.created_at,
      })
      .eq("conversation_id", parsed.data.conversationId)
      .eq("member_id", access.actor.id),
  ]);

  revalidatePath(routes.familyDomain(parsed.data.familyId, "chat"));
  void notifyFamilyMembers({
    familyId: parsed.data.familyId,
    excludeMemberId: access.actor.id,
    category: "chat",
    domain: "chat",
    title: `Pesan baru dari ${access.actor.display_name}`,
    body: "Buka Senvamily untuk melihat pesan keluarga.",
    deepLink: routes.familyDomain(parsed.data.familyId, "chat"),
    idempotencyPrefix: `chat:${inserted.id}`,
  });
  return {
    ok: true,
    message: {
      id: inserted.id,
      conversationId: inserted.conversation_id,
      senderMemberId: inserted.sender_member_id,
      senderName: access.actor.display_name,
      clientNonce: inserted.client_nonce,
      body: inserted.body,
      replyToMessageId: inserted.reply_to_message_id,
      replyPreview: null,
      attachmentPath: inserted.attachment_path,
      attachmentName: inserted.attachment_name,
      attachmentMimeType: inserted.attachment_mime_type,
      attachmentSizeBytes: inserted.attachment_size_bytes,
      isPinned: inserted.is_pinned,
      pinnedAt: inserted.pinned_at,
      editedAt: inserted.edited_at,
      deletedAt: inserted.deleted_at,
      createdAt: inserted.created_at,
      reactions: [],
      deliveryStatus: "sent",
    },
  };
}

export async function editChatMessageAction(input: {
  familyId: string;
  conversationId: string;
  messageId: string;
  body: string;
}) {
  const parsed = editMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid edit." };
  }

  const access = await requireChatAccess(
    parsed.data.familyId,
    parsed.data.conversationId
  );
  if (!access.ok) return { ok: false, error: access.error };

  const editedAt = new Date().toISOString();
  const { error } = await access.supabase
    .from("chat_messages")
    .update({ body: parsed.data.body, edited_at: editedAt })
    .eq("id", parsed.data.messageId)
    .eq("conversation_id", parsed.data.conversationId)
    .eq("sender_member_id", access.actor.id)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.familyDomain(parsed.data.familyId, "chat"));
  return { ok: true, editedAt };
}

const messageActionIdSchema = z.object({
  familyId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export async function deleteChatMessageAction(input: {
  familyId: string;
  conversationId: string;
  messageId: string;
}) {
  const parsed = messageActionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid message." };

  const access = await requireChatAccess(parsed.data.familyId, parsed.data.conversationId);
  if (!access.ok) return { ok: false, error: access.error };

  const { data: targetMsg } = await access.supabase
    .from("chat_messages")
    .select("id, sender_member_id, attachment_path")
    .eq("id", parsed.data.messageId)
    .eq("conversation_id", parsed.data.conversationId)
    .eq("family_id", parsed.data.familyId)
    .maybeSingle<{ id: string; sender_member_id: string | null; attachment_path: string | null }>();

  if (!targetMsg) {
    return { ok: false, error: "Message not found." };
  }
  if (
    targetMsg.sender_member_id !== access.actor.id &&
    !access.permSet.has("chat.adults_only.participate")
  ) {
    return { ok: false, error: "You do not have permission to delete this message." };
  }

  const deletedAt = new Date().toISOString();
  const { data: deleted, error } = await access.supabase
    .from("chat_messages")
    .update({ deleted_at: deletedAt, is_pinned: false })
    .eq("id", parsed.data.messageId)
    .eq("conversation_id", parsed.data.conversationId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, error: error.message };
  if (!deleted) {
    return { ok: false, error: "You do not have permission to delete this message." };
  }
  if (targetMsg.attachment_path) {
    await access.supabase.storage
      .from("chat-attachments")
      .remove([targetMsg.attachment_path]);
  }
  revalidatePath(routes.familyDomain(parsed.data.familyId, "chat"));
  return { ok: true, deletedAt };
}

export async function toggleChatReactionAction(input: {
  familyId: string;
  conversationId: string;
  messageId: string;
  emoji: string;
}) {
  const parsed = messageActionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid reaction." };

  const emoji = input.emoji.trim().slice(0, 16);
  if (!emoji) return { ok: false, error: "Invalid reaction." };

  const access = await requireChatAccess(parsed.data.familyId, parsed.data.conversationId);
  if (!access.ok) return { ok: false, error: access.error };

  const { data: existing } = await access.supabase
    .from("chat_message_reactions")
    .select("id")
    .eq("message_id", parsed.data.messageId)
    .eq("member_id", access.actor.id)
    .eq("emoji", emoji)
    .maybeSingle<{ id: string }>();

  if (existing) {
    const { error } = await access.supabase
      .from("chat_message_reactions")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, added: false };
  }

  const { error } = await access.supabase.from("chat_message_reactions").insert({
    family_id: parsed.data.familyId,
    conversation_id: parsed.data.conversationId,
    message_id: parsed.data.messageId,
    member_id: access.actor.id,
    emoji,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: true };
}

export async function togglePinChatMessageAction(input: {
  familyId: string;
  conversationId: string;
  messageId: string;
  pin: boolean;
}) {
  const parsed = messageActionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid message." };

  const access = await requireChatAccess(parsed.data.familyId, parsed.data.conversationId);
  if (!access.ok) return { ok: false, error: access.error };

  const { data: updated, error } = await access.supabase
    .from("chat_messages")
    .update({
      is_pinned: input.pin,
      pinned_by_member_id: input.pin ? access.actor.id : null,
      pinned_at: input.pin ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.messageId)
    .eq("conversation_id", parsed.data.conversationId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, error: error.message };
  if (!updated) {
    return { ok: false, error: "You do not have permission to pin messages." };
  }
  revalidatePath(routes.familyDomain(parsed.data.familyId, "chat"));
  return { ok: true };
}

export async function markConversationReadAction(input: {
  familyId: string;
  conversationId: string;
  lastMessageId: string | null;
}) {
  const parsed = z
    .object({
      familyId: z.string().uuid(),
      conversationId: z.string().uuid(),
      lastMessageId: z.string().uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid read receipt." };

  const access = await requireChatAccess(parsed.data.familyId, parsed.data.conversationId);
  if (!access.ok) return { ok: false, error: access.error };

  const now = new Date().toISOString();
  const { error } = await access.supabase
    .from("chat_participants")
    .update({
      last_read_message_id: parsed.data.lastMessageId,
      last_read_at: now,
    })
    .eq("conversation_id", parsed.data.conversationId)
    .eq("member_id", access.actor.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, lastReadAt: now };
}

export async function loadConversationMessagesAction(input: {
  familyId: string;
  conversationId: string;
  beforeCreatedAt?: string | null;
}) {
  const parsed = z
    .object({
      familyId: z.string().uuid(),
      conversationId: z.string().uuid(),
      beforeCreatedAt: z.string().nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid conversation.", messages: [] as ChatMessageItem[], hasMoreOlder: false };
  }

  const access = await requireChatAccess(parsed.data.familyId, parsed.data.conversationId);
  if (!access.ok) {
    return { ok: false, error: access.error, messages: [] as ChatMessageItem[], hasMoreOlder: false };
  }

  const { data: membersData } = await access.supabase
    .from("family_members")
    .select("id, display_name")
    .eq("family_id", parsed.data.familyId)
    .eq("status", "active");

  const memberNameMap = new Map<string, string>(
    ((membersData as Array<{ id: string; display_name: string }>) ?? []).map(
      (m) => [m.id, m.display_name]
    )
  );

  const page = await hydrateMessagesPage({
    supabase: access.supabase,
    conversationId: parsed.data.conversationId,
    currentMemberId: access.actor.id,
    memberNameMap,
    beforeCreatedAt: parsed.data.beforeCreatedAt,
  });

  return { ok: true, ...page };
}

export async function createDirectConversationAction(input: {
  familyId: string;
  targetMemberId: string;
}) {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();

  const { data: perms } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: input.familyId,
  });
  const permSet = new Set(
    ((perms as Array<{ permission_key: string }>) ?? []).map(
      (p) => p.permission_key
    )
  );
  if (!permSet.has("chat.family.participate")) {
    return { ok: false, error: "Missing chat permission." };
  }

  const { data: membersData } = await supabase
    .from("family_members")
    .select("id, user_id, display_name")
    .eq("family_id", input.familyId)
    .eq("status", "active");

  const members =
    (membersData as Array<{
      id: string;
      user_id: string | null;
      display_name: string;
    }>) ?? [];
  const actor = members.find((m) => m.user_id === user.id);
  const target = members.find((m) => m.id === input.targetMemberId);
  if (!actor || !target || actor.id === target.id) {
    return { ok: false, error: "Select another active family member." };
  }

  // Check if a direct conversation between actor & target already exists
  const { data: myParts } = await supabase
    .from("chat_participants")
    .select("conversation_id")
    .eq("member_id", actor.id);
  const myConvIds = ((myParts as Array<{ conversation_id: string }>) ?? []).map(
    (p) => p.conversation_id
  );

  if (myConvIds.length > 0) {
    const [{ data: shared }, { data: directConvs }] = await Promise.all([
      supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("member_id", target.id)
        .in("conversation_id", myConvIds),
      supabase
        .from("chat_conversations")
        .select("id")
        .in("id", myConvIds)
        .eq("kind", "direct"),
    ]);

    const directIds = new Set(
      ((directConvs as Array<{ id: string }>) ?? []).map((c) => c.id)
    );
    const existingDirect = ((shared as Array<{ conversation_id: string }>) ?? []).find(
      (s) => directIds.has(s.conversation_id)
    );

    if (existingDirect) {
      return { ok: true, conversationId: existingDirect.conversation_id };
    }
  }

  const { data: conv, error: convErr } = await supabase
    .from("chat_conversations")
    .insert({
      family_id: input.familyId,
      kind: "direct",
      title: `${actor.display_name} & ${target.display_name}`,
      created_by_member_id: actor.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (convErr || !conv) {
    return { ok: false, error: convErr?.message ?? "Could not start conversation." };
  }

  const { error: partErr } = await supabase.from("chat_participants").insert([
    {
      family_id: input.familyId,
      conversation_id: conv.id,
      member_id: actor.id,
      role: "owner",
    },
    {
      family_id: input.familyId,
      conversation_id: conv.id,
      member_id: target.id,
      role: "member",
    },
  ]);

  if (partErr) {
    return { ok: false, error: partErr.message };
  }

  revalidatePath(routes.familyDomain(input.familyId, "chat"));
  return { ok: true, conversationId: conv.id };
}

export async function createTopicConversationAction(input: {
  familyId: string;
  title: string;
  adultsOnly?: boolean;
}) {
  const parsed = z
    .object({
      familyId: z.string().uuid(),
      title: z.string().trim().min(2).max(100),
      adultsOnly: z.boolean().default(false),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Enter a conversation title (2-100 chars)." };
  }

  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();

  const { data: perms } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: parsed.data.familyId,
  });
  const permSet = new Set(
    ((perms as Array<{ permission_key: string }>) ?? []).map(
      (p) => p.permission_key
    )
  );

  if (
    !permSet.has("chat.family.participate") ||
    (parsed.data.adultsOnly && !permSet.has("chat.adults_only.participate"))
  ) {
    return { ok: false, error: "Missing permission for this conversation type." };
  }

  const { data: membersData } = await supabase
    .from("family_members")
    .select("id, user_id")
    .eq("family_id", parsed.data.familyId)
    .eq("status", "active");

  const members =
    (membersData as Array<{ id: string; user_id: string | null }>) ?? [];
  const actor = members.find((m) => m.user_id === user.id);
  if (!actor) return { ok: false, error: "Active membership required." };

  const { data: conv, error: convErr } = await supabase
    .from("chat_conversations")
    .insert({
      family_id: parsed.data.familyId,
      kind: parsed.data.adultsOnly ? "adults_group" : "topic",
      title: parsed.data.title,
      created_by_member_id: actor.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (convErr || !conv) {
    return { ok: false, error: convErr?.message ?? "Could not create channel." };
  }

  const participantRows = (parsed.data.adultsOnly ? [actor] : members).map((m) => ({
    family_id: parsed.data.familyId,
    conversation_id: conv.id,
    member_id: m.id,
    role: m.id === actor.id ? "owner" : "member",
  }));

  await supabase.from("chat_participants").insert(participantRows);
  revalidatePath(routes.familyDomain(parsed.data.familyId, "chat"));
  return { ok: true, conversationId: conv.id };
}

export async function getChatAttachmentSignedUrlAction(input: {
  familyId: string;
  conversationId: string;
  attachmentPath: string;
}) {
  const parsed = z
    .object({
      familyId: z.string().uuid(),
      conversationId: z.string().uuid(),
      attachmentPath: z.string().min(1),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid attachment." };

  const access = await requireChatAccess(parsed.data.familyId, parsed.data.conversationId);
  if (!access.ok) return { ok: false, error: access.error };

  const expectedPrefix = `${parsed.data.familyId}/${parsed.data.conversationId}/`;
  if (!parsed.data.attachmentPath.startsWith(expectedPrefix)) {
    return { ok: false, error: "Attachment does not belong to this conversation." };
  }

  const { data, error } = await access.supabase.storage
    .from("chat-attachments")
    .createSignedUrl(parsed.data.attachmentPath, 120);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not create signed URL." };
  }

  return { ok: true, signedUrl: data.signedUrl };
}
