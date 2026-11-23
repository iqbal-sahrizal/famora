"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronUp,
  Edit3,
  FileText,
  Hash,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  Reply,
  Send,
  SmilePlus,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatLocalizedTime } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  createDirectConversationAction,
  createTopicConversationAction,
  deleteChatMessageAction,
  editChatMessageAction,
  getChatAttachmentSignedUrlAction,
  loadConversationMessagesAction,
  markConversationReadAction,
  sendChatMessageAction,
  toggleChatReactionAction,
  togglePinChatMessageAction,
} from "../actions";
import {
  computePreservedScrollTop,
  markOptimisticFailed,
  mergeAndSortMessages,
  shouldAutoScrollToBottom,
} from "../realtime-utils";
import type {
  ChatConversationItem,
  ChatMessageItem,
  ChatPageData,
} from "../types";
import { isChatImageMimeType, validateChatAttachment } from "../validation";

const QUICK_REACTIONS = ["❤️", "👍", "😂", "🎉", "🙏"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FamilyChatView({
  familyId,
  data,
}: {
  familyId: string;
  data: ChatPageData;
}) {
  const { locale, t, te } = useLocale();
  const isOnline = useOnlineStatus();
  const [conversations, setConversations] = React.useState<ChatConversationItem[]>(
    data.conversations
  );
  const [activeConvId, setActiveConvId] = React.useState<string | null>(
    data.initialConversationId
  );
  const [mobileShowThread, setMobileShowThread] = React.useState(false);

  const [messagesByConv, setMessagesByConv] = React.useState<
    Record<string, ChatMessageItem[]>
  >(() =>
    data.initialConversationId
      ? { [data.initialConversationId]: data.initialMessages }
      : {}
  );
  const [hasMoreByConv, setHasMoreByConv] = React.useState<
    Record<string, boolean>
  >(() =>
    data.initialConversationId
      ? { [data.initialConversationId]: data.hasMoreOlder }
      : {}
  );
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [loadingThread, setLoadingThread] = React.useState(false);

  // Composer & interactive message state
  const [draft, setDraft] = React.useState("");
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [replyTo, setReplyTo] = React.useState<ChatMessageItem | null>(null);
  const [editingMsg, setEditingMsg] = React.useState<ChatMessageItem | null>(null);
  const [editBody, setEditBody] = React.useState("");
  const [showNewChatSheet, setShowNewChatSheet] = React.useState(false);
  const [newChannelTitle, setNewChannelTitle] = React.useState("");
  const [newChannelAdultsOnly, setNewChannelAdultsOnly] = React.useState(false);

  // Realtime status, typing indicators, scroll management
  const [realtimeStatus, setRealtimeStatus] = React.useState<
    "connected" | "reconnecting" | "offline"
  >(isOnline ? "connected" : "offline");
  const [typingMembers, setTypingMembers] = React.useState<Record<string, string>>(
    {}
  );
  const [showNewMessagesPill, setShowNewMessagesPill] = React.useState(false);
  const [signedUrls, setSignedUrls] = React.useState<Record<string, string>>({});

  // Track failed optimistic payloads so retry can resend with the exact same clientNonce
  const failedPayloadsRef = React.useRef<
    Map<
      string,
      {
        conversationId: string;
        body: string;
        replyToMessageId: string | null;
        file: File | null;
      }
    >
  >(new Map());

  const messageListRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const isNearBottomRef = React.useRef(true);
  const pendingScrollRestoreRef = React.useRef<{
    prevScrollHeight: number;
    prevScrollTop: number;
  } | null>(null);
  const typingChannelRef = React.useRef<ReturnType<
    ReturnType<typeof createSupabaseBrowserClient>["channel"]
  > | null>(null);
  const lastTypingBroadcastRef = React.useRef(0);

  const activeConversation = React.useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId]
  );

  const activeMessages = React.useMemo(
    () => (activeConvId ? messagesByConv[activeConvId] ?? [] : []),
    [messagesByConv, activeConvId]
  );

  const pinnedMessages = React.useMemo(
    () => activeMessages.filter((m) => m.isPinned && !m.deletedAt),
    [activeMessages]
  );

  const memberNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data.members) {
      map.set(m.id, m.displayName);
    }
    return map;
  }, [data.members]);

  // Preserve scroll position synchronously when older messages are prepended
  React.useLayoutEffect(() => {
    const el = messageListRef.current;
    const pending = pendingScrollRestoreRef.current;
    if (el && pending) {
      el.scrollTop = computePreservedScrollTop(
        pending.prevScrollHeight,
        pending.prevScrollTop,
        el.scrollHeight
      );
      pendingScrollRestoreRef.current = null;
    }
  }, [activeMessages]);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowNewMessagesPill(false);
    isNearBottomRef.current = true;
  }, []);

  // Scroll to bottom on initial conversation switch
  React.useEffect(() => {
    if (!activeConvId) return;
    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
    return () => cancelAnimationFrame(raf);
  }, [activeConvId, scrollToBottom]);

  // Sync unread count when viewing bottom of active conversation
  const syncReadReceipt = React.useCallback(
    async (convId: string, msgs: ChatMessageItem[]) => {
      const lastPersisted = [...msgs]
        .reverse()
        .find((m) => m.deliveryStatus !== "sending" && m.deliveryStatus !== "failed");
      if (!lastPersisted) return;

      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );

      await markConversationReadAction({
        familyId,
        conversationId: convId,
        lastMessageId: lastPersisted.id,
      });
    },
    [familyId]
  );

  // Sync missed messages upon reconnection or conversation switch
  const syncLatestMessages = React.useCallback(
    async (convId: string) => {
      const res = await loadConversationMessagesAction({
        familyId,
        conversationId: convId,
      });
      if (!res.ok) return;
      setMessagesByConv((prev) => ({
        ...prev,
        [convId]: mergeAndSortMessages(prev[convId] ?? [], res.messages),
      }));
      setHasMoreByConv((prev) => ({
        ...prev,
        [convId]: res.hasMoreOlder,
      }));
    },
    [familyId]
  );

  // Realtime subscription for messages, reactions, typing, and reconnection sync
  React.useEffect(() => {
    if (!isOnline) {
      setRealtimeStatus("offline");
      return;
    }
    if (!activeConvId) return;

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`chat:${familyId}:${activeConvId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
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
          };
          if (!row?.id) return;

          const incoming: ChatMessageItem = {
            id: row.id,
            conversationId: row.conversation_id,
            senderMemberId: row.sender_member_id,
            senderName:
              (row.sender_member_id && memberNameMap.get(row.sender_member_id)) ||
              t("chat.memberFallback"),
            clientNonce: row.client_nonce,
            body: row.deleted_at ? "" : row.body,
            replyToMessageId: row.reply_to_message_id,
            replyPreview: null,
            attachmentPath: row.deleted_at ? null : row.attachment_path,
            attachmentName: row.deleted_at ? null : row.attachment_name,
            attachmentMimeType: row.deleted_at ? null : row.attachment_mime_type,
            attachmentSizeBytes: row.deleted_at ? null : row.attachment_size_bytes,
            isPinned: Boolean(row.is_pinned && !row.deleted_at),
            pinnedAt: row.pinned_at,
            editedAt: row.edited_at,
            deletedAt: row.deleted_at,
            createdAt: row.created_at,
            reactions: [],
            deliveryStatus: "sent",
          };

          setMessagesByConv((prev) => {
            const nextList = mergeAndSortMessages(prev[activeConvId] ?? [], [
              incoming,
            ]);
            if (isNearBottomRef.current) {
              requestAnimationFrame(() => scrollToBottom("smooth"));
              void syncReadReceipt(activeConvId, nextList);
            } else if (row.sender_member_id !== data.currentMemberId) {
              setShowNewMessagesPill(true);
            }
            return { ...prev, [activeConvId]: nextList };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_reactions",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        () => {
          void syncLatestMessages(activeConvId);
        }
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const senderId = String(payload.payload?.memberId ?? "");
        const senderName = String(payload.payload?.displayName ?? t("chat.someoneFallback"));
        if (!senderId || senderId === data.currentMemberId) return;
        setTypingMembers((prev) => ({ ...prev, [senderId]: senderName }));
        setTimeout(() => {
          setTypingMembers((prev) => {
            const copy = { ...prev };
            delete copy[senderId];
            return copy;
          });
        }, 3500);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
          void syncLatestMessages(activeConvId);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("reconnecting");
        }
      });

    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [
    activeConvId,
    data.currentMemberId,
    familyId,
    isOnline,
    memberNameMap,
    scrollToBottom,
    syncLatestMessages,
    syncReadReceipt,
    t,
  ]);

  if (!data.canParticipate) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={t("chat.restrictedTitle")}
          description={t("chat.restrictedDesc")}
        />
      </Card>
    );
  }

  const handleSelectConversation = async (convId: string) => {
    setActiveConvId(convId);
    setMobileShowThread(true);
    setReplyTo(null);
    setEditingMsg(null);
    setShowNewMessagesPill(false);

    if (!messagesByConv[convId]) {
      setLoadingThread(true);
      await syncLatestMessages(convId);
      setLoadingThread(false);
    }

    const currentMsgs = messagesByConv[convId] ?? [];
    if (currentMsgs.length > 0) {
      void syncReadReceipt(convId, currentMsgs);
    }
  };

  const handleLoadOlder = async () => {
    if (!activeConvId || loadingOlder || activeMessages.length === 0) return;
    const oldest = activeMessages[0];
    const el = messageListRef.current;
    if (el) {
      pendingScrollRestoreRef.current = {
        prevScrollHeight: el.scrollHeight,
        prevScrollTop: el.scrollTop,
      };
    }

    setLoadingOlder(true);
    const res = await loadConversationMessagesAction({
      familyId,
      conversationId: activeConvId,
      beforeCreatedAt: oldest.createdAt,
    });
    setLoadingOlder(false);

    if (!res.ok) {
      pendingScrollRestoreRef.current = null;
      toast.error(te(res.error));
      return;
    }

    setMessagesByConv((prev) => ({
      ...prev,
      [activeConvId]: mergeAndSortMessages(res.messages, prev[activeConvId] ?? []),
    }));
    setHasMoreByConv((prev) => ({
      ...prev,
      [activeConvId]: res.hasMoreOlder,
    }));
  };

  const broadcastTyping = () => {
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current < 1500) return;
    lastTypingBroadcastRef.current = now;
    void typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: {
        memberId: data.currentMemberId,
        displayName: data.currentMemberName,
      },
    });
  };

  const dispatchMessage = async (params: {
    convId: string;
    body: string;
    clientNonce: string;
    replyToMessageId: string | null;
    replyPreview: { senderName: string; body: string } | null;
    file: File | null;
    isRetry?: boolean;
  }) => {
    const optimistic: ChatMessageItem = {
      id: `optimistic-${params.clientNonce}`,
      conversationId: params.convId,
      senderMemberId: data.currentMemberId,
      senderName: data.currentMemberName,
      clientNonce: params.clientNonce,
      body: params.body,
      replyToMessageId: params.replyToMessageId,
      replyPreview: params.replyPreview,
      attachmentPath: null,
      attachmentName: params.file ? params.file.name : null,
      attachmentMimeType: params.file ? params.file.type : null,
      attachmentSizeBytes: params.file ? params.file.size : null,
      isPinned: false,
      pinnedAt: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      reactions: [],
      deliveryStatus: "sending",
    };

    setMessagesByConv((prev) => ({
      ...prev,
      [params.convId]: mergeAndSortMessages(prev[params.convId] ?? [], [
        optimistic,
      ]),
    }));

    if (!params.isRetry) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }

    const fd = new FormData();
    fd.set("familyId", familyId);
    fd.set("conversationId", params.convId);
    fd.set("body", params.body);
    fd.set("clientNonce", params.clientNonce);
    if (params.replyToMessageId) {
      fd.set("replyToMessageId", params.replyToMessageId);
    }
    if (params.file) {
      fd.set("file", params.file);
    }

    const res = await sendChatMessageAction(fd);
    if (!res.ok || !res.message) {
      failedPayloadsRef.current.set(params.clientNonce, {
        conversationId: params.convId,
        body: params.body,
        replyToMessageId: params.replyToMessageId,
        file: params.file,
      });
      setMessagesByConv((prev) => ({
        ...prev,
        [params.convId]: markOptimisticFailed(
          prev[params.convId] ?? [],
          params.clientNonce
        ),
      }));
      toast.error(te(res.error));
      return;
    }

    failedPayloadsRef.current.delete(params.clientNonce);
    const persisted = res.message;
    setMessagesByConv((prev) => ({
      ...prev,
      [params.convId]: mergeAndSortMessages(prev[params.convId] ?? [], [
        { ...persisted, replyPreview: params.replyPreview },
      ]),
    }));
    setConversations((prev) =>
      prev.map((c) =>
        c.id === params.convId
          ? {
              ...c,
              lastMessageAt: persisted.createdAt,
              lastMessagePreview:
                persisted.body ||
                (persisted.attachmentName
                  ? t("chat.attachmentPreview", { name: persisted.attachmentName })
                  : ""),
              unreadCount: 0,
            }
          : c
      )
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConvId) return;
    const trimmed = draft.trim();
    if (!trimmed && !pendingFile) return;

    if (pendingFile) {
      const check = validateChatAttachment({
        name: pendingFile.name,
        type: pendingFile.type,
        size: pendingFile.size,
      });
      if (!check.valid) {
        toast.error(te(check.error));
        return;
      }
    }

    const clientNonce = crypto.randomUUID();
    const currentFile = pendingFile;
    const currentReply = replyTo;
    setDraft("");
    setPendingFile(null);
    setReplyTo(null);

    await dispatchMessage({
      convId: activeConvId,
      body: trimmed,
      clientNonce,
      replyToMessageId: currentReply?.id ?? null,
      replyPreview: currentReply
        ? {
            senderName: currentReply.senderName,
            body: currentReply.body || currentReply.attachmentName || t("chat.attachmentLabel"),
          }
        : null,
      file: currentFile,
    });
  };

  const handleRetry = async (msg: ChatMessageItem) => {
    if (!msg.clientNonce) return;
    const saved = failedPayloadsRef.current.get(msg.clientNonce);
    await dispatchMessage({
      convId: saved?.conversationId ?? msg.conversationId,
      body: saved?.body ?? msg.body,
      clientNonce: msg.clientNonce,
      replyToMessageId: saved?.replyToMessageId ?? msg.replyToMessageId,
      replyPreview: msg.replyPreview,
      file: saved?.file ?? null,
      isRetry: true,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMsg || !activeConvId) return;
    const res = await editChatMessageAction({
      familyId,
      conversationId: activeConvId,
      messageId: editingMsg.id,
      body: editBody,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setMessagesByConv((prev) => ({
      ...prev,
      [activeConvId]: (prev[activeConvId] ?? []).map((m) =>
        m.id === editingMsg.id
          ? { ...m, body: editBody.trim(), editedAt: res.editedAt ?? new Date().toISOString() }
          : m
      ),
    }));
    setEditingMsg(null);
    setEditBody("");
  };

  const handleDelete = async (msg: ChatMessageItem) => {
    if (!activeConvId) return;
    const res = await deleteChatMessageAction({
      familyId,
      conversationId: activeConvId,
      messageId: msg.id,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setMessagesByConv((prev) => ({
      ...prev,
      [activeConvId]: (prev[activeConvId] ?? []).map((m) =>
        m.id === msg.id
          ? {
              ...m,
              body: "",
              attachmentPath: null,
              isPinned: false,
              deletedAt: res.deletedAt ?? new Date().toISOString(),
            }
          : m
      ),
    }));
  };

  const handleToggleReaction = async (msg: ChatMessageItem, emoji: string) => {
    if (!activeConvId) return;
    const res = await toggleChatReactionAction({
      familyId,
      conversationId: activeConvId,
      messageId: msg.id,
      emoji,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    void syncLatestMessages(activeConvId);
  };

  const handleTogglePin = async (msg: ChatMessageItem) => {
    if (!activeConvId) return;
    const nextPin = !msg.isPinned;
    const res = await togglePinChatMessageAction({
      familyId,
      conversationId: activeConvId,
      messageId: msg.id,
      pin: nextPin,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setMessagesByConv((prev) => ({
      ...prev,
      [activeConvId]: (prev[activeConvId] ?? []).map((m) =>
        m.id === msg.id ? { ...m, isPinned: nextPin } : m
      ),
    }));
  };

  const handleOpenAttachment = async (msg: ChatMessageItem) => {
    if (!activeConvId || !msg.attachmentPath) return;
    if (signedUrls[msg.id]) {
      window.open(signedUrls[msg.id], "_blank", "noopener,noreferrer");
      return;
    }
    const res = await getChatAttachmentSignedUrlAction({
      familyId,
      conversationId: activeConvId,
      attachmentPath: msg.attachmentPath,
    });
    if (!res.ok || !res.signedUrl) {
      toast.error(te(res.error));
      return;
    }
    setSignedUrls((prev) => ({ ...prev, [msg.id]: res.signedUrl! }));
    window.open(res.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleStartDirectChat = async (targetMemberId: string) => {
    const res = await createDirectConversationAction({
      familyId,
      targetMemberId,
    });
    if (!res.ok || !res.conversationId) {
      toast.error(te(res.error));
      return;
    }
    setShowNewChatSheet(false);
    const member = data.members.find((m) => m.id === targetMemberId);
    setConversations((prev) => {
      if (prev.some((c) => c.id === res.conversationId)) return prev;
      return [
        {
          id: res.conversationId!,
          familyId,
          kind: "direct",
          title: member?.displayName ?? t("chat.directFallbackTitle"),
          lastMessageAt: null,
          lastMessagePreview: null,
          unreadCount: 0,
          participants: [],
        },
        ...prev,
      ];
    });
    await handleSelectConversation(res.conversationId);
  };

  const handleCreateTopicChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createTopicConversationAction({
      familyId,
      title: newChannelTitle,
      adultsOnly: newChannelAdultsOnly,
    });
    if (!res.ok || !res.conversationId) {
      toast.error(te(res.error));
      return;
    }
    setConversations((prev) => [
      {
        id: res.conversationId!,
        familyId,
        kind: newChannelAdultsOnly ? "adults_group" : "topic",
        title: newChannelTitle.trim(),
        lastMessageAt: null,
        lastMessagePreview: null,
        unreadCount: 0,
        participants: [],
      },
      ...prev,
    ]);
    setNewChannelTitle("");
    setNewChannelAdultsOnly(false);
    setShowNewChatSheet(false);
    await handleSelectConversation(res.conversationId);
  };

  const typingList = Object.values(typingMembers);

  // Read receipt names on the latest outgoing message
  const latestMyMessage = [...activeMessages]
    .reverse()
    .find(
      (m) =>
        m.senderMemberId === data.currentMemberId &&
        m.deliveryStatus !== "sending" &&
        m.deliveryStatus !== "failed"
    );
  const readByOthers =
    latestMyMessage && activeConversation
      ? activeConversation.participants
          .filter(
            (p) =>
              p.memberId !== data.currentMemberId &&
              (p.lastReadMessageId === latestMyMessage.id ||
                new Date(p.lastReadAt).getTime() >=
                  new Date(latestMyMessage.createdAt).getTime())
          )
          .map((p) => p.displayName)
      : [];

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] lg:h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr]">
        {/* Conversation List Sidebar */}
        <aside
          className={cn(
            "flex min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50",
            mobileShowThread ? "hidden md:flex" : "flex"
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3.5">
            <div>
              <h1 className="font-heading text-[18px] font-bold">{t("chat.title")}</h1>
              <p className="text-[12px] text-[var(--text-muted)]">
                {t("chat.convCount", { count: conversations.length })}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setShowNewChatSheet(true)}
            >
              <Plus className="h-4 w-4" />
              {t("chat.newBtn")}
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain p-2.5">
            {conversations.map((conv) => {
              const active = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => void handleSelectConversation(conv.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors cursor-pointer",
                    active
                      ? "bg-[var(--accent-primary)]/12 text-[var(--text-primary)] ring-1 ring-[var(--accent-primary)]/30"
                      : "hover:bg-[var(--bg-subtle)]"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      conv.kind === "family_group"
                        ? "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]"
                        : conv.kind === "adults_group"
                        ? "bg-[var(--tint-lavender)] text-[var(--tint-lavender-fg)]"
                        : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    )}
                  >
                    {conv.kind === "family_group" ? (
                      <Users className="h-4 w-4" />
                    ) : conv.kind === "adults_group" ? (
                      <Lock className="h-4 w-4" />
                    ) : conv.kind === "topic" ? (
                      <Hash className="h-4 w-4" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold">
                        {conv.title}
                      </span>
                      {conv.unreadCount > 0 && (
                        <Badge variant="forest" className="shrink-0">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-[var(--text-muted)]">
                      {conv.lastMessagePreview || t("chat.noMessagesYet")}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Active Conversation Thread */}
        <section
          className={cn(
            "relative flex min-h-0 flex-col bg-[var(--bg-surface)]",
            mobileShowThread ? "flex" : "hidden md:flex"
          )}
        >
          {/* Thread Header */}
          <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                aria-label={t("chat.backAria")}
                onClick={() => setMobileShowThread(false)}
                className="rounded-xl p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] md:hidden cursor-pointer"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-heading text-[16px] font-bold">
                    {activeConversation?.title ?? t("chat.selectConv")}
                  </h2>
                  {activeConversation?.kind === "adults_group" && (
                    <Badge variant="neutral">{t("chat.adultsOnlyBadge")}</Badge>
                  )}
                </div>
                <p className="truncate text-[12px] text-[var(--text-muted)]">
                  {typingList.length > 0
                    ? typingList.length === 1
                      ? t("chat.typingSingle", { names: typingList.join(", ") })
                      : t("chat.typingPlural", { names: typingList.join(", ") })
                    : t("chat.participantsCount", {
                        count: activeConversation?.participants.length ?? 0,
                      })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant={
                  realtimeStatus === "connected"
                    ? "sage"
                    : realtimeStatus === "reconnecting"
                    ? "peach"
                    : "neutral"
                }
                className="gap-1"
              >
                {realtimeStatus === "offline" ? (
                  <WifiOff className="h-3 w-3" />
                ) : (
                  <Wifi className="h-3 w-3" />
                )}
                {realtimeStatus === "connected"
                  ? t("chat.status.live")
                  : realtimeStatus === "reconnecting"
                  ? t("chat.status.syncing")
                  : t("chat.status.offline")}
              </Badge>
            </div>
          </header>

          {/* Pinned Message Banner */}
          {pinnedMessages.length > 0 && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--tint-sand)]/50 px-4 py-2 text-[12.5px]">
              <div className="flex min-w-0 items-center gap-2">
                <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
                <span className="truncate font-medium">
                  <strong>{t("chat.pinnedPrefix", { sender: pinnedMessages[pinnedMessages.length - 1].senderName })}</strong>{" "}
                  {pinnedMessages[pinnedMessages.length - 1].body || t("chat.attachmentLabel")}
                </span>
              </div>
            </div>
          )}

          {/* Independent Message Scroll List (never steals page scroll or triggers PTR) */}
          <div
            ref={messageListRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const nearBottom = shouldAutoScrollToBottom({
                scrollHeight: el.scrollHeight,
                scrollTop: el.scrollTop,
                clientHeight: el.clientHeight,
              });
              isNearBottomRef.current = nearBottom;
              if (nearBottom) {
                setShowNewMessagesPill(false);
                if (activeConvId && (activeConversation?.unreadCount ?? 0) > 0) {
                  void syncReadReceipt(activeConvId, activeMessages);
                }
              }
            }}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain touch-pan-y px-4 py-4"
          >
            {activeConvId && hasMoreByConv[activeConvId] && (
              <div className="flex justify-center pb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={loadingOlder}
                  onClick={() => void handleLoadOlder()}
                >
                  <ChevronUp className="h-4 w-4" />
                  {loadingOlder ? t("chat.loadingOlder") : t("chat.loadOlder")}
                </Button>
              </div>
            )}

            {loadingThread ? (
              <p className="py-12 text-center text-[13px] text-[var(--text-muted)]">
                {t("chat.loadingMessages")}
              </p>
            ) : activeMessages.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  icon={<MessageCircle className="h-6 w-6" />}
                  title={t("chat.emptyTitle")}
                  description={t("chat.emptyDesc")}
                />
              </div>
            ) : (
              activeMessages.map((msg) => {
                const isMe = msg.senderMemberId === data.currentMemberId;
                const isDeleted = Boolean(msg.deletedAt);
                const isImage = isChatImageMimeType(msg.attachmentMimeType);

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "group flex flex-col gap-1",
                      isMe ? "items-end" : "items-start"
                    )}
                  >
                    <div className="flex items-center gap-2 px-1 text-[11.5px] text-[var(--text-muted)]">
                      <span className="font-medium text-[var(--text-secondary)]">
                        {isMe ? t("chat.youLabel") : msg.senderName}
                      </span>
                      <span>{formatLocalizedTime(msg.createdAt, locale)}</span>
                      {msg.editedAt && !isDeleted && <span>{t("chat.editedTag")}</span>}
                      {msg.isPinned && !isDeleted && (
                        <Pin className="h-3 w-3 text-[var(--accent-primary)]" />
                      )}
                    </div>

                    <div
                      className={cn(
                        "max-w-[85%] sm:max-w-[72%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-xs",
                        isDeleted
                          ? "border border-dashed border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)] italic"
                          : isMe
                          ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                          : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)]"
                      )}
                    >
                      {isDeleted ? (
                        <span>{t("chat.deletedBody")}</span>
                      ) : (
                        <>
                          {msg.replyPreview && (
                            <div
                              className={cn(
                                "mb-2 rounded-xl border-l-2 px-2.5 py-1.5 text-[12px]",
                                isMe
                                  ? "border-white/60 bg-black/15 text-white/90"
                                  : "border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                              )}
                            >
                              <p className="font-semibold">
                                {msg.replyPreview.senderName}
                              </p>
                              <p className="truncate">{msg.replyPreview.body}</p>
                            </div>
                          )}

                          {msg.body && (
                            <p className="whitespace-pre-wrap break-words">
                              {msg.body}
                            </p>
                          )}

                          {msg.attachmentName && (
                            <button
                              type="button"
                              onClick={() => void handleOpenAttachment(msg)}
                              className={cn(
                                "mt-2 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] font-medium cursor-pointer",
                                isMe
                                  ? "bg-black/15 text-white hover:bg-black/25"
                                  : "bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]"
                              )}
                            >
                              {isImage ? (
                                <ImageIcon className="h-4 w-4 shrink-0" />
                              ) : (
                                <FileText className="h-4 w-4 shrink-0" />
                              )}
                              <span className="truncate max-w-[200px]">
                                {msg.attachmentName}
                              </span>
                              {msg.attachmentSizeBytes ? (
                                <span className="text-[11px] opacity-80">
                                  ({formatBytes(msg.attachmentSizeBytes)})
                                </span>
                              ) : null}
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Reactions Row */}
                    {msg.reactions.length > 0 && !isDeleted && (
                      <div className="flex flex-wrap gap-1 px-1">
                        {msg.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            title={r.memberNames.join(", ")}
                            onClick={() => void handleToggleReaction(msg, r.emoji)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] cursor-pointer",
                              r.reactedByMe
                                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                                : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]"
                            )}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Delivery status / Retry / Hover Actions */}
                    <div className="flex items-center gap-1.5 px-1">
                      {isMe && msg.deliveryStatus === "sending" && (
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {t("chat.sendingStatus")}
                        </span>
                      )}
                      {isMe && msg.deliveryStatus === "failed" && (
                        <button
                          type="button"
                          onClick={() => void handleRetry(msg)}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--tint-peach)] px-2 py-0.5 text-[11px] font-medium text-[var(--tint-peach-fg)] cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {t("chat.failedRetry")}
                        </button>
                      )}
                      {isMe &&
                        msg.id === latestMyMessage?.id &&
                        msg.deliveryStatus === "sent" && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                            {readByOthers.length > 0 ? (
                              <>
                                <CheckCheck className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                                {t("chat.seenBy", { names: readByOthers.join(", ") })}
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                {t("chat.sentStatus")}
                              </>
                            )}
                          </span>
                        )}

                      {!isDeleted && msg.deliveryStatus === "sent" && (
                        <div className="flex items-center gap-1 opacity-85 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            aria-label={t("chat.replyAria")}
                            onClick={() => setReplyTo(msg)}
                            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => void handleToggleReaction(msg, emoji)}
                              className="rounded-lg px-1 py-0.5 text-[12px] hover:bg-[var(--bg-subtle)] cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-label={msg.isPinned ? t("chat.unpinAria") : t("chat.pinAria")}
                            onClick={() => void handleTogglePin(msg)}
                            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          {isMe && (
                            <>
                              <button
                                type="button"
                                aria-label={t("chat.editAria")}
                                onClick={() => {
                                  setEditingMsg(msg);
                                  setEditBody(msg.body);
                                }}
                                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={t("chat.deleteAria")}
                                onClick={() => void handleDelete(msg)}
                                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Floating New Messages Pill */}
          {showNewMessagesPill && (
            <div className="pointer-events-none absolute bottom-20 left-0 right-0 flex justify-center">
              <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-primary)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--accent-primary-fg)] shadow-[var(--shadow-float)] cursor-pointer"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                {t("chat.newMessagesPill")}
              </button>
            </div>
          )}

          {/* Reply / Edit / Pending Attachment Bars + Composer */}
          {activeConvId && (
            <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
              {editingMsg ? (
                <form onSubmit={handleSaveEdit} className="flex items-center gap-2">
                  <Input
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder={t("chat.editPlaceholder")}
                    autoFocus
                  />
                  <Button type="submit" size="sm">
                    {t("common.save")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingMsg(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </form>
              ) : (
                <>
                  {replyTo && (
                    <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--bg-subtle)] px-3 py-1.5 text-[12px]">
                      <span className="truncate">
                        {t("chat.replyingTo", { sender: replyTo.senderName })}{" "}
                        {replyTo.body || replyTo.attachmentName || t("chat.attachmentLabel")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                        className="p-0.5 text-[var(--text-muted)] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {pendingFile && (
                    <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--tint-sage)]/50 px-3 py-1.5 text-[12px]">
                      <span className="truncate font-medium">
                        {t("chat.attachedFile", {
                          name: pendingFile.name,
                          size: `${Math.max(1, Math.round(pendingFile.size / 1024))} KB`,
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingFile(null)}
                        className="p-0.5 text-[var(--text-muted)] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSend} className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        if (file) {
                          const check = validateChatAttachment({
                            name: file.name,
                            type: file.type,
                            size: file.size,
                          });
                          if (!check.valid) {
                            toast.error(te(check.error));
                            return;
                          }
                          setPendingFile(file);
                        }
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("chat.attachAria")}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Input
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        broadcastTyping();
                      }}
                      placeholder={t("chat.messagePlaceholder", { title: activeConversation?.title ?? "" })}
                      className="flex-1"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!draft.trim() && !pendingFile}
                      aria-label={t("chat.sendAria")}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* New Direct Message or Channel Bottom Sheet */}
      <BottomSheet
        open={showNewChatSheet}
        onClose={() => setShowNewChatSheet(false)}
        title={t("chat.newConvTitle")}
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t("chat.privateMemberChat")}
            </p>
            <div className="space-y-1.5">
              {data.members
                .filter((m) => m.id !== data.currentMemberId)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void handleStartDirectChat(m.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-left text-[14px] font-medium hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    <span>{m.displayName}</span>
                    <SmilePlus className="h-4 w-4 text-[var(--text-muted)]" />
                  </button>
                ))}
            </div>
          </div>

          <form
            onSubmit={handleCreateTopicChannel}
            className="space-y-3 border-t border-[var(--border-subtle)] pt-4"
          >
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t("chat.createGroupChannel")}
            </p>
            <Input
              value={newChannelTitle}
              onChange={(e) => setNewChannelTitle(e.target.value)}
              placeholder={t("chat.channelPlaceholder")}
              required
            />
            {data.canParticipateAdultsOnly && (
              <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={newChannelAdultsOnly}
                  onChange={(e) => setNewChannelAdultsOnly(e.target.checked)}
                />
                {t("chat.adultsOnlyCheckbox")}
              </label>
            )}
            <Button type="submit" className="w-full">
              {t("chat.createChannelBtn")}
            </Button>
          </form>
        </div>
      </BottomSheet>
    </div>
  );
}
