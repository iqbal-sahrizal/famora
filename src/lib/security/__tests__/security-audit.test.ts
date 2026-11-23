import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasFamilyPermission } from "../permissions";
import { sanitizeDocumentFilename } from "@/features/documents/validation";
import { sanitizeChatFilename } from "@/features/chat/validation";
import { sanitizeMemoryFilename } from "@/features/memories/validation";
import { classifyAiActionTier, checkAiRateLimit } from "@/features/ai/policy";

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("Security Audit — Secret Isolation, IDOR/Traversal & Escalation Guards", () => {
  it("never references server-only secrets inside client components", () => {
    const srcDir = path.join(process.cwd(), "src");
    const files = walkFiles(srcDir);
    const forbidden = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
      "VAPID_PRIVATE_KEY",
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const isClient =
        content.startsWith('"use client"') || content.startsWith("'use client'");
      if (!isClient) continue;
      for (const secret of forbidden) {
        expect(content.includes(secret)).toBe(false);
      }
    }
  });

  it("prevents path traversal across all private storage filename sanitizers", () => {
    expect(sanitizeDocumentFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeChatFilename("..\\..\\secret\\key.pdf")).toBe("key.pdf");
    expect(sanitizeMemoryFilename("../../../vault/photo.png")).toBe("photo.png");
  });

  it("blocks privilege escalation and financial/vault access for child and guest roles", () => {
    const childCtx = {
      familyId: "fam-1",
      targetFamilyId: "fam-1",
      memberId: "m-child",
      role: "child" as const,
      status: "active" as const,
      isManagedChild: true,
      overrides: [{ permission: "family.settings.manage" as const, effect: "allow" as const }],
    };
    const guestCtx = {
      familyId: "fam-1",
      targetFamilyId: "fam-1",
      memberId: "m-guest",
      role: "caregiver" as const,
      status: "active" as const,
      isManagedChild: false,
    };
    const crossFamilyCtx = {
      familyId: "fam-1",
      targetFamilyId: "fam-2",
      memberId: "m-parent",
      role: "owner" as const,
      status: "active" as const,
      isManagedChild: false,
    };

    expect(hasFamilyPermission(childCtx, "family.settings.manage")).toBe(false);
    expect(hasFamilyPermission(childCtx, "finance.accounts.manage")).toBe(false);
    expect(hasFamilyPermission(childCtx, "documents.sensitive_vault")).toBe(false);
    expect(hasFamilyPermission(guestCtx, "chat.adults_only.participate")).toBe(false);
    expect(hasFamilyPermission(guestCtx, "ai.assistant.use")).toBe(false);
    expect(hasFamilyPermission(crossFamilyCtx, "family.settings.manage")).toBe(false);
  });

  it("enforces AI restricted-action blocklist and hourly rate limits", () => {
    expect(classifyAiActionTier("transfer_money")).toBe("restricted");
    expect(classifyAiActionTier("change_permissions")).toBe("restricted");
    expect(classifyAiActionTier("modify_child_health_record")).toBe("restricted");
    expect(checkAiRateLimit(30, 30).allowed).toBe(false);
  });
});
