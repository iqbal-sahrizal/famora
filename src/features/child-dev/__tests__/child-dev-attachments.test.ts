import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateChildAttachmentFile } from "../schemas";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [
  { permission_key: "child_dev.identity.view" },
  { permission_key: "child_dev.growth_milestones.manage" },
  { permission_key: "child_dev.health.view" },
];
let mockInsertError: { message: string } | null = null;
let mockAttachmentRow: {
  id: string;
  record_type: "health" | "education" | "milestone";
  storage_path: string;
} | null = {
  id: "att-1",
  record_type: "health",
  storage_path: "fam/child/file.pdf",
};
const removedStoragePaths: string[] = [];
const uploadedStoragePaths: string[] = [];
const signedUrlCalls: Array<{ path: string; expiresIn: number }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: mockPerms, error: null })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          uploadedStoragePaths.push(path);
          return { error: null };
        }),
        remove: vi.fn(async (paths: string[]) => {
          removedStoragePaths.push(...paths);
          return { error: null };
        }),
        createSignedUrl: vi.fn(async (path: string, expiresIn: number) => {
          signedUrlCalls.push({ path, expiresIn });
          return { data: { signedUrl: `https://signed.local/${path}?ttl=${expiresIn}` }, error: null };
        }),
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "child_profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "child-1" } }),
              }),
            }),
          }),
        };
      }
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mem-1" } }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "child_attachments") {
        return {
          insert: vi.fn().mockResolvedValue({ error: mockInsertError }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockAttachmentRow, error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

import {
  deleteChildAttachmentAction,
  getChildAttachmentSignedUrlAction,
  uploadChildAttachmentAction,
} from "../actions";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHILD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ATT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("AUD-011 Child Development Binary Attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPerms = [
      { permission_key: "child_dev.identity.view" },
      { permission_key: "child_dev.growth_milestones.manage" },
      { permission_key: "child_dev.health.view" },
    ];
    mockInsertError = null;
    mockAttachmentRow = {
      id: ATT_ID,
      record_type: "health",
      storage_path: `${FAM_ID}/${CHILD_ID}/immunization.pdf`,
    };
    removedStoragePaths.length = 0;
    uploadedStoragePaths.length = 0;
    signedUrlCalls.length = 0;
  });

  it("validates allowed file types, extensions, sizes, and sanitizes traversal names", () => {
    expect(
      validateChildAttachmentFile({
        name: "script.exe",
        type: "application/x-msdownload",
        size: 1024,
      }).valid
    ).toBe(false);

    expect(
      validateChildAttachmentFile({
        name: "huge.pdf",
        type: "application/pdf",
        size: 15 * 1024 * 1024,
      }).valid
    ).toBe(false);

    const valid = validateChildAttachmentFile({
      name: "../../report card.pdf",
      type: "application/pdf",
      size: 2048,
    });
    expect(valid.valid).toBe(true);
    expect(valid.safeName).toBe("report_card.pdf");
  });

  it("uploads authorized attachments and cleans up orphaned storage files if DB insert fails", async () => {
    const fd = new FormData();
    fd.set("familyId", FAM_ID);
    fd.set("childProfileId", CHILD_ID);
    fd.set("recordType", "education");
    fd.set("notes", "Term 1 Report");
    fd.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "report.pdf", {
        type: "application/pdf",
      })
    );

    mockInsertError = { message: "DB write failed" };
    const failRes = await uploadChildAttachmentAction(fd);
    expect(failRes.ok).toBe(false);
    expect(uploadedStoragePaths).toHaveLength(1);
    expect(removedStoragePaths).toEqual(uploadedStoragePaths);

    mockInsertError = null;
    const okRes = await uploadChildAttachmentAction(fd);
    expect(okRes.ok).toBe(true);
  });

  it("enforces record-level authorization for health signed URLs and deletion", async () => {
    // Missing child_dev.health.view -> denied even if identity.view is present
    mockPerms = [{ permission_key: "child_dev.identity.view" }];
    const deniedUrl = await getChildAttachmentSignedUrlAction({
      familyId: FAM_ID,
      attachmentId: ATT_ID,
    });
    expect(deniedUrl.ok).toBe(false);
    expect(deniedUrl.error).toContain("child_dev.health.view");

    // Authorized -> returns 60s short-lived signed URL and allows deletion
    mockPerms = [{ permission_key: "child_dev.health.view" }];
    const okUrl = await getChildAttachmentSignedUrlAction({
      familyId: FAM_ID,
      attachmentId: ATT_ID,
    });
    expect(okUrl.ok).toBe(true);
    expect(signedUrlCalls[0].expiresIn).toBe(60);

    const delRes = await deleteChildAttachmentAction({
      familyId: FAM_ID,
      attachmentId: ATT_ID,
    });
    expect(delRes.ok).toBe(true);
    expect(removedStoragePaths).toEqual([
      `${FAM_ID}/${CHILD_ID}/immunization.pdf`,
    ]);
  });
});
