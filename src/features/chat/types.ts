export type ConversationKind = "family_group" | "adults_group" | "direct" | "topic";

export interface ChatReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  memberNames: string[];
}

export interface ChatParticipantInfo {
  memberId: string;
  displayName: string;
  role: "owner" | "member";
  lastReadMessageId: string | null;
  lastReadAt: string;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  senderMemberId: string | null;
  senderName: string;
  clientNonce: string | null;
  body: string;
  replyToMessageId: string | null;
  replyPreview: {
    senderName: string;
    body: string;
  } | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
  isPinned: boolean;
  pinnedAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions: ChatReactionSummary[];
  /** Client-only optimistic delivery state */
  deliveryStatus?: "sending" | "sent" | "failed";
}

export interface ChatConversationItem {
  id: string;
  familyId: string;
  kind: ConversationKind;
  title: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  participants: ChatParticipantInfo[];
}

export interface ChatPageData {
  canParticipate: boolean;
  canParticipateAdultsOnly: boolean;
  currentMemberId: string | null;
  currentMemberName: string;
  members: Array<{ id: string; displayName: string }>;
  conversations: ChatConversationItem[];
  initialConversationId: string | null;
  initialMessages: ChatMessageItem[];
  hasMoreOlder: boolean;
}
