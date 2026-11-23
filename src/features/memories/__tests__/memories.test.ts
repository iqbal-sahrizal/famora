import { describe, expect, it } from "vitest";
import {
  canViewMemoryResource,
  runWithUploadRetry,
  validateMemoryMediaFile,
} from "../validation";

describe("Family Memories — Visibility, Permissions & Storage Validation", () => {
  it("enforces album and memory visibility across family, shared, adults_only, private, and guest policies", () => {
    // Family-wide album visible to active family members
    expect(
      canViewMemoryResource({
        visibility: "family",
        ownerMemberId: "parent-1",
        sharedWithMemberIds: [],
        viewerMemberId: "child-1",
        canManageMemories: false,
      })
    ).toBe(true);

    // Guest blocked when allowGuestMemories is false
    expect(
      canViewMemoryResource({
        visibility: "family",
        ownerMemberId: "parent-1",
        sharedWithMemberIds: [],
        viewerMemberId: "guest-1",
        canManageMemories: false,
        isGuest: true,
        allowGuestMemories: false,
      })
    ).toBe(false);

    // Adults-only blocked for child/non-manager, allowed for manager
    expect(
      canViewMemoryResource({
        visibility: "adults_only",
        ownerMemberId: "parent-1",
        sharedWithMemberIds: [],
        viewerMemberId: "child-1",
        canManageMemories: false,
      })
    ).toBe(false);
    expect(
      canViewMemoryResource({
        visibility: "adults_only",
        ownerMemberId: "parent-1",
        sharedWithMemberIds: [],
        viewerMemberId: "parent-2",
        canManageMemories: true,
      })
    ).toBe(true);

    // Shared album visible only to owner and listed members
    expect(
      canViewMemoryResource({
        visibility: "shared",
        ownerMemberId: "parent-1",
        sharedWithMemberIds: ["teen-1"],
        viewerMemberId: "teen-2",
        canManageMemories: false,
      })
    ).toBe(false);
    expect(
      canViewMemoryResource({
        visibility: "shared",
        ownerMemberId: "parent-1",
        sharedWithMemberIds: ["teen-1"],
        viewerMemberId: "teen-1",
        canManageMemories: false,
      })
    ).toBe(true);

    // Private journal visible only to its author
    expect(
      canViewMemoryResource({
        visibility: "private",
        ownerMemberId: "teen-1",
        sharedWithMemberIds: [],
        viewerMemberId: "parent-1",
        canManageMemories: true,
      })
    ).toBe(false);
    expect(
      canViewMemoryResource({
        visibility: "private",
        ownerMemberId: "teen-1",
        sharedWithMemberIds: [],
        viewerMemberId: "teen-1",
        canManageMemories: false,
      })
    ).toBe(true);
  });

  it("validates photo and video file types, size limits, and filename sanitization", () => {
    expect(
      validateMemoryMediaFile({
        name: "bad.svg",
        type: "image/svg+xml",
        size: 1024,
      }).valid
    ).toBe(false);

    expect(
      validateMemoryMediaFile({
        name: "huge-photo.jpg",
        type: "image/jpeg",
        size: 20 * 1024 * 1024,
      }).valid
    ).toBe(false);

    const validVideo = validateMemoryMediaFile({
      name: "../vacation/beach clip.mp4",
      type: "video/mp4",
      size: 25 * 1024 * 1024,
    });
    expect(validVideo.valid).toBe(true);
    expect(validVideo.kind).toBe("video");
    expect(validVideo.safeName).toBe("beach_clip.mp4");
  });

  it("retries transient upload failures safely up to maxAttempts", async () => {
    let attempts = 0;
    const result = await runWithUploadRetry(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("Transient network error");
      }
      return "uploaded-ok";
    }, 3);

    expect(result).toBe("uploaded-ok");
    expect(attempts).toBe(2);
  });
});
