import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

const queriedTables: string[] = [];
let mockPerms: Array<{ permission_key: string }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: mockPerms, error: null })),
    from: vi.fn((table: string) => {
      queriedTables.push(table);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [] }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
  })),
}));

import { addGrowthRecordAction, addHealthRecordAction } from "../actions";
import { getChildDevPageData } from "../server";

const FAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHILD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Famora Child Development — Category Privacy & Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queriedTables.length = 0;
    mockPerms = [];
  });

  it("denies all child identity and health records to unauthorized roles", async () => {
    mockPerms = [{ permission_key: "family.members.view" }];
    const data = await getChildDevPageData(FAM_ID);
    expect(data.canViewIdentity).toBe(false);
    expect(data.canViewHealth).toBe(false);
    expect(queriedTables).toEqual([]);
  });

  it("allows identity view without querying child_health_records when health permission is absent", async () => {
    mockPerms = [{ permission_key: "child_dev.identity.view" }];
    const data = await getChildDevPageData(FAM_ID);
    expect(data.canViewIdentity).toBe(true);
    expect(data.canViewHealth).toBe(false);
    expect(queriedTables).toContain("child_profiles");
    expect(queriedTables).not.toContain("child_health_records");

    const healthRes = await addHealthRecordAction({
      familyId: FAM_ID,
      childProfileId: CHILD_ID,
      recordType: "immunization",
      title: "MMR",
      providerName: "Clinic",
      recordedOn: "2026-11-20",
      notes: "",
    });
    expect(healthRes.ok).toBe(false);
    expect(healthRes.error).toContain("child_dev.health.view");
  });

  it("validates realistic height and weight bounds", async () => {
    mockPerms = [{ permission_key: "child_dev.growth_milestones.manage" }];
    const badHeight = await addGrowthRecordAction({
      familyId: FAM_ID,
      childProfileId: CHILD_ID,
      measuredOn: "2026-11-20",
      heightCm: 5,
      weightKg: 15,
      notes: "",
    });
    expect(badHeight.ok).toBe(false);
  });
});
