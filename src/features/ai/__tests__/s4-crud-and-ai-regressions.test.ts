import { beforeEach, describe, expect, it, vi } from "vitest";

const FAM = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const CHILD_ID = "33333333-3333-4333-8333-333333333333";

let mockPerms: Array<{ permission_key: string }> = [];
let mockRole = "owner";
let mockMemberExists = true;
let mockRowExists = true;
let mockInsertError: { message: string } | null = null;
const storageRemoved: Array<{ bucket: string; paths: string[] }> = [];
const storageUploaded: Array<{ bucket: string; path: string }> = [];
const updatedTables: Array<{ table: string; payload: Record<string, unknown> }> = [];
const insertedTables: Array<{ table: string; payload: unknown }> = [];

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1", email: "u@fam.test" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    rpc: vi.fn(async (fn: string) => {
      if (fn === "get_my_family_permissions") {
        return { data: mockPerms, error: null };
      }
      return { data: null, error: null };
    }),
    storage: {
      from: vi.fn((bucket: string) => ({
        upload: vi.fn(async (path: string) => {
          storageUploaded.push({ bucket, path });
          return { error: null };
        }),
        remove: vi.fn(async (paths: string[]) => {
          storageRemoved.push({ bucket, paths });
          return { error: null };
        }),
        createSignedUrl: vi.fn(async (path: string) => ({
          data: { signedUrl: `https://storage.test/${bucket}/${path}?token=abc` },
          error: null,
        })),
      })),
    },
    from: vi.fn((table: string) => {
      const makeChain = (): Record<string, unknown> => {
        const chain: Record<string, unknown> = {
          eq: vi.fn(() => chain),
          is: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => ({ data: [] })),
          select: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => {
            if (table === "family_members") {
              return {
                data: mockMemberExists
                  ? {
                      id: "mem-1",
                      role: mockRole,
                      family_roles: { role_key: mockRole },
                      display_name: "Maya",
                    }
                  : null,
                error: null,
              };
            }
            if (table === "family_polls") {
              return {
                data: mockRowExists
                  ? { id: ITEM_ID, created_by_member_id: "mem-1" }
                  : null,
                error: null,
              };
            }
            if (table === "tasks") {
              return { data: mockRowExists ? { id: ITEM_ID, family_id: FAM } : null, error: null };
            }
            if (table === "task_attachments") {
              return {
                data: mockRowExists
                  ? { id: ITEM_ID, family_id: FAM, storage_path: `${FAM}/tasks/${ITEM_ID}/doc.pdf` }
                  : null,
                error: null,
              };
            }
            if (table === "ai_messages") {
              return {
                data: {
                  id: ITEM_ID,
                  family_id: FAM,
                  action_status: "pending_confirmation",
                  proposed_action: {
                    actionType: "create_task",
                    payload: {
                      title: "Buy milk",
                      dueDate: "2026-11-25",
                    },
                  },
                },
                error: null,
              };
            }
            return { data: mockRowExists ? { id: ITEM_ID } : null, error: null };
          }),
          single: vi.fn(async () => ({
            data: mockRowExists ? { id: ITEM_ID } : null,
            error: mockInsertError,
          })),
          insert: vi.fn((payload: unknown) => {
            insertedTables.push({ table, payload });
            const insChain = {
              select: vi.fn(() => insChain),
              single: vi.fn(async () => ({ data: { id: ITEM_ID }, error: mockInsertError })),
              maybeSingle: vi.fn(async () => ({ data: { id: ITEM_ID }, error: mockInsertError })),
              then: (resolve: (v: unknown) => void) => resolve({ error: mockInsertError }),
            };
            return insChain;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedTables.push({ table, payload });
            return chain;
          }),
          delete: vi.fn(() => chain),
        };
        return chain;
      };
      return makeChain();
    }),
  })),
}));

import {
  deleteTaskAttachmentAction,
  uploadTaskAttachmentAction,
} from "@/features/tasks/actions";
import {
  closePollAction,
  deletePollAction,
  uploadAnnouncementAttachmentAction,
} from "@/features/noticeboard/actions";
import {
  deleteRewardAction,
  updateChoreTemplateAction,
} from "@/features/chores/actions";
import { deleteBillAction, updateBudgetAction } from "@/features/finance/budget-actions";
import {
  deleteDebtReceivableAction,
  updateFinanceGoalAction,
} from "@/features/finance/analytics-actions";
import {
  deleteHomeAssetAction,
  deleteMealPlanAction,
  updateInventoryItemAction,
} from "@/features/household/actions";
import {
  deleteChildProfileAction,
  updateHealthRecordAction,
} from "@/features/child-dev/actions";
import { confirmAiProposedAction } from "@/features/ai/actions";

describe("Famora S4 — CRUD, Storage & AI Regressions", () => {
  beforeEach(() => {
    mockPerms = [];
    mockRole = "owner";
    mockMemberExists = true;
    mockRowExists = true;
    mockInsertError = null;
    storageRemoved.length = 0;
    storageUploaded.length = 0;
    updatedTables.length = 0;
    insertedTables.length = 0;
  });

  it("uploads and deletes task attachments with membership checks and storage cleanup", async () => {
    const fd = new FormData();
    fd.set("familyId", FAM);
    fd.set("taskId", ITEM_ID);
    fd.set("file", new File(["pdf-bytes"], "receipt.pdf", { type: "application/pdf" }));

    mockMemberExists = false;
    const denied = await uploadTaskAttachmentAction(fd);
    expect(denied.ok).toBe(false);

    mockMemberExists = true;
    mockPerms = [{ permission_key: "tasks.manage_all" }];
    const uploaded = await uploadTaskAttachmentAction(fd);
    expect(uploaded.ok).toBe(true);
    expect(storageUploaded[0]?.bucket).toBe("family-tasks");

    mockRowExists = false;
    const missingDel = await deleteTaskAttachmentAction({ familyId: FAM, attachmentId: ITEM_ID });
    expect(missingDel.ok).toBe(false);

    mockRowExists = true;
    const deleted = await deleteTaskAttachmentAction({ familyId: FAM, attachmentId: ITEM_ID });
    expect(deleted.ok).toBe(true);
    expect(storageRemoved[0]?.bucket).toBe("family-tasks");
  });

  it("enforces noticeboard permissions on attachment upload and poll close/delete", async () => {
    mockRole = "child";
    const fd = new FormData();
    fd.set("familyId", FAM);
    fd.set("file", new File(["img"], "flyer.png", { type: "image/png" }));
    expect((await uploadAnnouncementAttachmentAction(fd)).ok).toBe(false);

    expect((await closePollAction({ familyId: FAM, pollId: ITEM_ID, isClosed: true })).ok).toBe(false);
    expect((await deletePollAction({ familyId: FAM, pollId: ITEM_ID })).ok).toBe(false);

    mockRole = "owner";
    mockRowExists = false;
    expect((await closePollAction({ familyId: FAM, pollId: ITEM_ID, isClosed: true })).ok).toBe(false);

    mockRowExists = true;
    expect((await closePollAction({ familyId: FAM, pollId: ITEM_ID, isClosed: true })).ok).toBe(true);
    expect((await deletePollAction({ familyId: FAM, pollId: ITEM_ID })).ok).toBe(true);
  });

  it("rejects 0-row / cross-family mutations on Chores, Finance, Household, and ChildDev", async () => {
    mockPerms = [
      { permission_key: "tasks.approve_chores" },
      { permission_key: "finance.budgets.manage" },
      { permission_key: "finance.transactions.manage" },
      { permission_key: "inventory.manage" },
      { permission_key: "home.manage" },
      { permission_key: "meals.manage" },
      { permission_key: "child_dev.manage" },
      { permission_key: "child_dev.growth_milestones.manage" },
    ];
    mockRowExists = false;

    expect(
      (
        await updateChoreTemplateAction({
          familyId: FAM,
          templateId: ITEM_ID,
          title: "Sweep",
          description: "",
          defaultPoints: 10,
          scheduleRule: "daily",
          category: "household",
          assignedMemberId: null,
        })
      ).ok
    ).toBe(false);
    expect((await deleteRewardAction({ familyId: FAM, rewardId: ITEM_ID })).ok).toBe(false);
    expect(
      (
        await updateBudgetAction({
          familyId: FAM,
          budgetId: ITEM_ID,
          name: "Food",
          category: "Groceries",
          periodType: "monthly",
          limitNumeric: "500.00",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          alertThresholdPct: 80,
        })
      ).ok
    ).toBe(false);
    expect((await deleteBillAction({ familyId: FAM, billId: ITEM_ID })).ok).toBe(false);
    expect(
      (
        await updateFinanceGoalAction({
          familyId: FAM,
          goalId: ITEM_ID,
          title: "Emergency",
          targetNumeric: "1000.00",
          targetDate: null,
        })
      ).ok
    ).toBe(false);
    expect((await deleteDebtReceivableAction({ familyId: FAM, debtId: ITEM_ID })).ok).toBe(false);
    expect(
      (
        await updateInventoryItemAction({
          familyId: FAM,
          itemId: ITEM_ID,
          name: "Milk",
          category: "fridge",
          quantity: 0,
          unit: "L",
          minThreshold: 1,
          expiresOn: null,
        })
      ).ok
    ).toBe(false);
    expect((await deleteHomeAssetAction({ familyId: FAM, id: ITEM_ID })).ok).toBe(false);
    expect((await deleteMealPlanAction({ familyId: FAM, id: ITEM_ID })).ok).toBe(false);
    expect((await deleteChildProfileAction({ familyId: FAM, id: CHILD_ID })).ok).toBe(false);

    // Health update must require child_dev.health.view, not just growth_milestones.manage
    mockRowExists = true;
    const healthDenied = await updateHealthRecordAction({
      familyId: FAM,
      recordId: ITEM_ID,
      recordType: "checkup",
      title: "Annual checkup",
      providerName: "Clinic",
      recordedOn: "2026-11-20",
      notes: "",
    });
    expect(healthDenied.ok).toBe(false);

    mockPerms.push({ permission_key: "child_dev.health.view" });
    const healthAllowed = await updateHealthRecordAction({
      familyId: FAM,
      recordId: ITEM_ID,
      recordType: "checkup",
      title: "Annual checkup",
      providerName: "Clinic",
      recordedOn: "2026-11-20",
      notes: "",
    });
    expect(healthAllowed.ok).toBe(true);
  });

  it("enforces server-side permission and rolls back action_status if AI task insert fails", async () => {
    mockPerms = [{ permission_key: "ai.assistant.use" }];
    const denied = await confirmAiProposedAction({
      familyId: FAM,
      messageId: ITEM_ID,
    });
    expect(denied.ok).toBe(false);

    mockPerms.push({ permission_key: "tasks.manage_all" });
    mockInsertError = { message: "db error" };
    const failedInsert = await confirmAiProposedAction({
      familyId: FAM,
      messageId: ITEM_ID,
    });
    expect(failedInsert.ok).toBe(false);
    expect(
      updatedTables.some(
        (u) => u.table === "ai_messages" && u.payload.action_status === "pending_confirmation"
      )
    ).toBe(true);

    mockInsertError = null;
    const confirmed = await confirmAiProposedAction({
      familyId: FAM,
      messageId: ITEM_ID,
    });
    expect(confirmed.ok).toBe(true);
    expect(insertedTables.some((i) => i.table === "tasks")).toBe(true);
  });
});
