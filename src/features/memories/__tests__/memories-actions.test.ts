import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockActor: { id: string } | null = { id: "mem-1" };
let mockPerms: Array<{ permission_key: string }> = [];
let mockMemory: {
  id: string;
  author_member_id: string | null;
  visibility: "family" | "adults_only" | "shared" | "private";
} | null = {
  id: "mem-item-1",
  author_member_id: "mem-1",
  visibility: "family",
};
const updatedMemories: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: mockPerms, error: null })),
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockActor }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "memory_items") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockMemory, error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedMemories.push(payload);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }),
        };
      }
      return {};
    }),
  })),
}));

import { updateMemoryAction } from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Memories — Update Memory Description Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor = { id: "mem-1" };
    mockPerms = [];
    mockMemory = { id: MEM_ID, author_member_id: "mem-1", visibility: "family" };
    updatedMemories.length = 0;
  });

  it("allows the author to update memory title, description, and metadata", async () => {
    const res = await updateMemoryAction({
      familyId: FAM_ID,
      memoryId: MEM_ID,
      title: "Beach Sunset",
      description: "Golden hour at the coast",
      eventLabel: "Summer Trip",
      isImportant: true,
    });

    expect(res.ok).toBe(true);
    expect(updatedMemories).toHaveLength(1);
    expect(updatedMemories[0].description).toBe("Golden hour at the coast");
    expect(updatedMemories[0].is_important).toBe(true);
  });

  it("blocks editing private memories by non-authors even with memories.manage", async () => {
    mockPerms = [{ permission_key: "memories.manage" }];
    mockMemory = {
      id: MEM_ID,
      author_member_id: "mem-other",
      visibility: "private",
    };

    const res = await updateMemoryAction({
      familyId: FAM_ID,
      memoryId: MEM_ID,
      title: "Attempted override",
      description: "Should be blocked",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("authorized");
    expect(updatedMemories).toHaveLength(0);
  });
});
