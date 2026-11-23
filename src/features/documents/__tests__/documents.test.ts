import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DOCUMENT_SIZE_BYTES,
  sanitizeDocumentFilename,
  validateDocumentFile,
} from "../validation";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

let mockPerms: Array<{ permission_key: string }> = [];
let mockDocRow: Record<string, unknown> | null = null;
const historyEvents: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: mockPerms, error: null })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://storage.local/signed?token=abc" },
          error: null,
        })),
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "documents") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockDocRow }),
        };
      }
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mem-1" } }),
        };
      }
      if (table === "document_history") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            historyEvents.push(row);
            return { error: null };
          }),
        };
      }
      return {};
    }),
  })),
}));

import { getDocumentSignedUrlAction } from "../actions";
import { getDocumentsPageData } from "../server";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Famora Document Vault — File Validation, Signed URLs & Access Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPerms = [];
    mockDocRow = null;
    historyEvents.length = 0;
  });

  it("validates allowed MIME types, 15 MB size limit, and sanitizes traversal filenames", () => {
    expect(
      validateDocumentFile({
        name: "../../etc/passwd.exe",
        type: "application/x-msdownload",
        size: 1024,
      }).valid
    ).toBe(false);

    expect(
      validateDocumentFile({
        name: "huge.pdf",
        type: "application/pdf",
        size: MAX_DOCUMENT_SIZE_BYTES + 1,
      }).valid
    ).toBe(false);

    expect(sanitizeDocumentFilename("../../../passport (2026).pdf")).toBe(
      "passport__2026_.pdf"
    );
  });

  it("denies document vault access to unauthorized roles", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];
    const data = await getDocumentsPageData(FAM_ID);
    expect(data.canViewStandard).toBe(false);
    expect(data.canViewVault).toBe(false);
    expect(data.documents).toEqual([]);
  });

  it("blocks standard-only members from generating signed URLs for sensitive_vault documents", async () => {
    mockPerms = [{ permission_key: "documents.standard.manage" }];
    mockDocRow = {
      id: DOC_ID,
      storage_path: `${FAM_ID}/vault/passport.pdf`,
      sensitivity: "sensitive_vault",
      owner_member_id: "other-mem",
      shared_with_member_ids: [],
    };

    const res = await getDocumentSignedUrlAction({
      familyId: FAM_ID,
      documentId: DOC_ID,
      mode: "download",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("documents.sensitive_vault");
    expect(historyEvents).toHaveLength(0);
  });

  it("generates short-lived signed URL and records audit history for authorized vault users", async () => {
    mockPerms = [{ permission_key: "documents.sensitive_vault" }];
    mockDocRow = {
      id: DOC_ID,
      storage_path: `${FAM_ID}/vault/passport.pdf`,
      sensitivity: "sensitive_vault",
      owner_member_id: "mem-1",
      shared_with_member_ids: [],
    };

    const res = await getDocumentSignedUrlAction({
      familyId: FAM_ID,
      documentId: DOC_ID,
      mode: "preview",
    });

    expect(res.ok).toBe(true);
    expect(res.signedUrl).toContain("signed");
    expect(historyEvents).toHaveLength(1);
    expect(historyEvents[0].event_type).toBe("viewed");
  });
});
