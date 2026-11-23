import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [{ permission_key: "family.delete" }];
let mockFamily: { id: string; name: string } | null = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Smith Family",
};
const removedBuckets: Array<{ bucket: string; paths: string[] }> = [];
const mockRpc = vi.fn(async (fn: string) => {
  if (fn === "get_my_family_permissions") {
    return { data: mockPerms, error: null };
  }
  return { data: true, error: null };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: mockRpc,
    storage: {
      from: vi.fn((bucket: string) => ({
        remove: vi.fn(async (paths: string[]) => {
          removedBuckets.push({ bucket, paths });
          return { error: null };
        }),
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "families") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockFamily, error: null }),
            }),
          }),
        };
      }
      if (table === "document_files") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ storage_path: "fam/doc-1.pdf" }],
            }),
          }),
        };
      }
      if (table === "memory_items") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ storage_path: "fam/mem-1.jpg", thumbnail_path: "fam/mem-1-t.webp" }],
            }),
          }),
        };
      }
      if (table === "chat_messages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({
                data: [{ attachment_path: "fam/chat-1.png" }],
              }),
            }),
          }),
        };
      }
      if (table === "child_attachments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ storage_path: "fam/child-1/report.pdf" }],
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

import { deleteFamilyAction } from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Family Settings — Delete Family Workspace (AUD-004)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPerms = [{ permission_key: "family.delete" }];
    mockFamily = { id: FAM_ID, name: "Smith Family" };
    removedBuckets.length = 0;
  });

  it("rejects non-owners without family.delete permission", async () => {
    mockPerms = [{ permission_key: "family.settings.manage" }];
    const res = await deleteFamilyAction({
      familyId: FAM_ID,
      confirmationName: "Smith Family",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("family.delete");
    expect(mockRpc).not.toHaveBeenCalledWith(
      "delete_family_workspace",
      expect.anything()
    );
  });

  it("rejects mismatched confirmation name to prevent accidental deletion", async () => {
    const res = await deleteFamilyAction({
      familyId: FAM_ID,
      confirmationName: "smith family",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("does not match");
    expect(mockRpc).not.toHaveBeenCalledWith(
      "delete_family_workspace",
      expect.anything()
    );
  });

  it("executes atomic delete_family_workspace RPC and cleans up storage buckets", async () => {
    const res = await deleteFamilyAction({
      familyId: FAM_ID,
      confirmationName: "Smith Family",
    });

    expect(res.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("delete_family_workspace", {
      p_family_id: FAM_ID,
    });
    expect(removedBuckets).toEqual([
      { bucket: "family-documents", paths: ["fam/doc-1.pdf"] },
      { bucket: "family-memories", paths: ["fam/mem-1.jpg", "fam/mem-1-t.webp"] },
      { bucket: "family-chat", paths: ["fam/chat-1.png"] },
      { bucket: "family-child-attachments", paths: ["fam/child-1/report.pdf"] },
    ]);
  });
});
