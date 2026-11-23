import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@/types/domain";
import {
  canAccessConversation,
  computePreservedScrollTop,
  computeUnreadCount,
  markOptimisticFailed,
  mergeAndSortMessages,
  shouldAutoScrollToBottom,
} from "../realtime-utils";
import type { ChatMessageItem } from "../types";
import { isChatImageMimeType, validateChatAttachment } from "../validation";

function makeMsg(overrides: Partial<ChatMessageItem> = {}): ChatMessageItem {
  return {
    id: "m-1",
    conversationId: "conv-1",
    senderMemberId: "mem-1",
    senderName: "Parent",
    clientNonce: null,
    body: "Hello family",
    replyToMessageId: null,
    replyPreview: null,
    attachmentPath: null,
    attachmentName: null,
    attachmentMimeType: null,
    attachmentSizeBytes: null,
    isPinned: false,
    pinnedAt: null,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-11-22T10:00:00.000Z",
    reactions: [],
    deliveryStatus: "sent",
    ...overrides,
  };
}

describe("Family Chat — Security, Realtime & UX Helpers", () => {
  it("blocks unauthorized users, non-participants, and non-adults from restricted conversations", () => {
    const standardPerms = new Set<PermissionKey>(["chat.family.participate"]);
    const adultPerms = new Set<PermissionKey>([
      "chat.family.participate",
      "chat.adults_only.participate",
    ]);

    // Non-participant in direct conversation
    expect(
      canAccessConversation({
        conversationKind: "direct",
        participantMemberIds: ["mem-1", "mem-2"],
        actorMemberId: "mem-3",
        actorPermissions: standardPerms,
      })
    ).toBe(false);

    // Child/teen without adults_only permission blocked from adults_group
    expect(
      canAccessConversation({
        conversationKind: "adults_group",
        participantMemberIds: ["mem-1", "mem-child"],
        actorMemberId: "mem-child",
        actorPermissions: standardPerms,
      })
    ).toBe(false);

    // Missing chat.family.participate
    expect(
      canAccessConversation({
        conversationKind: "family_group",
        participantMemberIds: ["mem-1"],
        actorMemberId: "mem-1",
        actorPermissions: new Set<PermissionKey>(),
      })
    ).toBe(false);

    // Authorized adult participant allowed
    expect(
      canAccessConversation({
        conversationKind: "adults_group",
        participantMemberIds: ["mem-1", "mem-2"],
        actorMemberId: "mem-2",
        actorPermissions: adultPerms,
      })
    ).toBe(true);
  });

  it("deduplicates optimistic, realtime, and retried messages and sorts deterministically", () => {
    const nonce = "11111111-1111-4111-8111-111111111111";
    const optimistic = makeMsg({
      id: `optimistic-${nonce}`,
      clientNonce: nonce,
      body: "On my way home",
      createdAt: "2026-11-22T10:05:00.000Z",
      deliveryStatus: "sending",
    });

    const failed = markOptimisticFailed([optimistic], nonce);
    expect(failed[0].deliveryStatus).toBe("failed");

    const persisted = makeMsg({
      id: "db-msg-99",
      clientNonce: nonce,
      body: "On my way home",
      createdAt: "2026-11-22T10:05:01.000Z",
      deliveryStatus: "sent",
    });

    const older = makeMsg({
      id: "db-msg-10",
      body: "Earlier message",
      createdAt: "2026-11-22T09:50:00.000Z",
    });

    // Simulate duplicate delivery of persisted + older + failed optimistic
    const merged = mergeAndSortMessages(failed, [persisted, persisted, older]);
    expect(merged.map((m) => m.id)).toEqual(["db-msg-10", "db-msg-99"]);
    expect(merged[1].deliveryStatus).toBe("sent");
  });

  it("computes unread counts excluding own and deleted messages", () => {
    const count = computeUnreadCount({
      currentMemberId: "mem-me",
      lastReadAt: "2026-11-22T10:00:00.000Z",
      messages: [
        {
          createdAt: "2026-11-22T09:59:00.000Z",
          senderMemberId: "mem-other",
          deletedAt: null,
        },
        {
          createdAt: "2026-11-22T10:01:00.000Z",
          senderMemberId: "mem-me",
          deletedAt: null,
        },
        {
          createdAt: "2026-11-22T10:02:00.000Z",
          senderMemberId: "mem-other",
          deletedAt: "2026-11-22T10:03:00.000Z",
        },
        {
          createdAt: "2026-11-22T10:04:00.000Z",
          senderMemberId: "mem-other",
          deletedAt: null,
        },
      ],
    });
    expect(count).toBe(1);
  });

  it("controls smart auto-scroll and preserves scroll offset when prepending older messages", () => {
    expect(
      shouldAutoScrollToBottom({
        scrollHeight: 1000,
        scrollTop: 550,
        clientHeight: 400,
      })
    ).toBe(true);

    expect(
      shouldAutoScrollToBottom({
        scrollHeight: 1000,
        scrollTop: 200,
        clientHeight: 400,
      })
    ).toBe(false);

    expect(computePreservedScrollTop(800, 120, 1350)).toBe(670);
  });

  it("validates and sanitizes chat image and file attachments", () => {
    expect(
      validateChatAttachment({
        name: "script.exe",
        type: "application/x-msdownload",
        size: 1024,
      }).valid
    ).toBe(false);

    expect(
      validateChatAttachment({
        name: "huge.png",
        type: "image/png",
        size: 15 * 1024 * 1024,
      }).valid
    ).toBe(false);

    const ok = validateChatAttachment({
      name: "../../family photo (1).png",
      type: "image/png",
      size: 2048,
    });
    expect(ok.valid).toBe(true);
    expect(ok.safeName).toBe("family_photo__1_.png");
    expect(isChatImageMimeType("image/png")).toBe(true);
    expect(isChatImageMimeType("application/pdf")).toBe(false);
  });
});
