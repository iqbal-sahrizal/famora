import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockRoleKey = "child";
let mockMemberId = "mem-1";
let mockAnnouncementAuthorId = "mem-1";
const updatedAnnouncements: Array<Record<string, unknown>> = [];
const deletedAnnouncementIds: string[] = [];
const mockRpc = vi.fn(
  async (): Promise<{ error: { message: string } | null }> => ({ error: null })
);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: mockMemberId, family_roles: { role_key: mockRoleKey } },
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "family_announcements") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "ann-1", author_member_id: mockAnnouncementAuthorId },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedAnnouncements.push(payload);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn((_col: string, val: string) => {
              deletedAnnouncementIds.push(val);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          })),
        };
      }
      if (table === "family_polls") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "poll-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "family_poll_options") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    }),
  })),
}));

import {
  castPollVoteAction,
  createAnnouncementAction,
  createPollAction,
  deleteAnnouncementAction,
  updateAnnouncementAction,
} from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POLL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPT_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ANN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("Famora Noticeboard — Announcements & Polls Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoleKey = "child";
    mockMemberId = "mem-1";
    mockAnnouncementAuthorId = "mem-1";
    updatedAnnouncements.length = 0;
    deletedAnnouncementIds.length = 0;
  });

  it("blocks child and guest roles from publishing announcements or creating polls", async () => {
    const annRes = await createAnnouncementAction({
      familyId: FAM_ID,
      title: "Unauthorized note",
      body: "Testing permission check",
      audience: "all",
      pinned: false,
    });
    expect(annRes.ok).toBe(false);
    expect(annRes.error).toContain("adult");

    const pollRes = await createPollAction({
      familyId: FAM_ID,
      question: "Bedtime?",
      description: "",
      options: ["10 PM", "11 PM"],
      allowMultiple: false,
      isAnonymous: false,
      allowVoteEdit: true,
      visibility: "family",
      expiresAt: null,
    });
    expect(pollRes.ok).toBe(false);
  });

  it("allows adults/owners to publish targeted announcements and private polls", async () => {
    mockRoleKey = "owner";

    const annRes = await createAnnouncementAction({
      familyId: FAM_ID,
      title: "Adults Dinner Planning",
      body: "Let's review budget before booking.",
      audience: "adults_only",
      pinned: true,
    });
    expect(annRes.ok).toBe(true);

    const pollRes = await createPollAction({
      familyId: FAM_ID,
      question: "Holiday destination?",
      description: "",
      options: ["Mountains", "Beach"],
      allowMultiple: false,
      isAnonymous: true,
      allowVoteEdit: false,
      visibility: "adults_only",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
    expect(pollRes.ok).toBe(true);
  });

  it("enforces server-side poll voting via cast_poll_vote RPC and surfaces expiration errors", async () => {
    mockRpc.mockResolvedValueOnce({
      error: { message: "This poll has expired or closed" },
    });
    const expiredVote = await castPollVoteAction({
      familyId: FAM_ID,
      pollId: POLL_ID,
      optionIds: [OPT_1],
    });
    expect(expiredVote.ok).toBe(false);
    expect(expiredVote.error).toContain("expired");

    mockRpc.mockResolvedValueOnce({ error: null });
    const validVote = await castPollVoteAction({
      familyId: FAM_ID,
      pollId: POLL_ID,
      optionIds: [OPT_1],
    });
    expect(validVote.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("cast_poll_vote", {
      p_poll_id: POLL_ID,
      p_option_ids: [OPT_1],
    });
  });

  it("blocks non-author adults from editing or deleting another member's announcement", async () => {
    mockRoleKey = "adult";
    mockMemberId = "mem-2";
    mockAnnouncementAuthorId = "mem-1";

    const editRes = await updateAnnouncementAction({
      familyId: FAM_ID,
      announcementId: ANN_ID,
      title: "Hijacked Title",
      body: "Unauthorized edit",
      audience: "all",
      pinned: false,
    });
    expect(editRes.ok).toBe(false);
    expect(editRes.error).toContain("author");
    expect(updatedAnnouncements).toHaveLength(0);

    const delRes = await deleteAnnouncementAction({
      familyId: FAM_ID,
      announcementId: ANN_ID,
    });
    expect(delRes.ok).toBe(false);
    expect(delRes.error).toContain("author");
    expect(deletedAnnouncementIds).toHaveLength(0);
  });

  it("allows announcement author or family admin/owner to edit and delete announcements", async () => {
    mockRoleKey = "adult";
    mockMemberId = "mem-1";
    mockAnnouncementAuthorId = "mem-1";

    const editRes = await updateAnnouncementAction({
      familyId: FAM_ID,
      announcementId: ANN_ID,
      title: "Updated Dinner Plan",
      body: "Moved to 7 PM.",
      audience: "all",
      pinned: true,
    });
    expect(editRes.ok).toBe(true);
    expect(updatedAnnouncements).toHaveLength(1);
    expect(updatedAnnouncements[0].title).toBe("Updated Dinner Plan");

    mockRoleKey = "admin";
    mockMemberId = "mem-admin";
    mockAnnouncementAuthorId = "mem-1";

    const delRes = await deleteAnnouncementAction({
      familyId: FAM_ID,
      announcementId: ANN_ID,
    });
    expect(delRes.ok).toBe(true);
    expect(deletedAnnouncementIds).toEqual([ANN_ID]);
  });
});
