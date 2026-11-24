import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateShoppingQuantity = vi.fn();
const mockAddShoppingItem = vi.fn();
const mockToggleShoppingCheck = vi.fn();

vi.mock("@/features/shopping/actions", () => ({
  addShoppingItemAction: (...args: unknown[]) => mockAddShoppingItem(...args),
  toggleShoppingCheckAction: (...args: unknown[]) => mockToggleShoppingCheck(...args),
  updateShoppingQuantityAction: (...args: unknown[]) => mockUpdateShoppingQuantity(...args),
}));

vi.mock("@/features/tasks/actions", () => ({
  saveTaskAction: vi.fn(async () => ({ ok: true })),
  toggleTaskStatusAction: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/features/calendar/actions", () => ({
  saveCalendarEventAction: vi.fn(async () => ({ ok: true })),
  rsvpCalendarEventAction: vi.fn(async () => ({ ok: true })),
}));

import {
  clearAllPwaStorage,
  listOutboxRecords,
  readOfflineCache,
  writeOfflineCache,
} from "../indexeddb";
import {
  enqueueOfflineMutation,
  flushOfflineOutbox,
  resolveDomainConflict,
} from "../sync-engine";
import { executeDomainOfflineMutation } from "../domain-sync";
import {
  createQueuedShoppingMutation,
  enqueueShoppingMutation,
} from "@/features/shopping/offline-queue";

const FAM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_1 = "11111111-1111-4111-8111-111111111111";

describe("S3 Offline Cache, Mutation Queue, Sync Safety & Isolation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllPwaStorage();
    mockUpdateShoppingQuantity.mockResolvedValue({ ok: true });
    mockAddShoppingItem.mockResolvedValue({ ok: true });
    mockToggleShoppingCheck.mockResolvedValue({ ok: true });
  });

  it("reads cached data for dashboard, calendar, tasks, and shopping, and returns null when empty", async () => {
    expect(await readOfflineCache(FAM_A, "dashboard")).toBeNull();
    expect(await readOfflineCache(FAM_A, "calendar")).toBeNull();
    expect(await readOfflineCache(FAM_A, "tasks")).toBeNull();
    expect(await readOfflineCache(FAM_A, "shopping")).toBeNull();

    await writeOfflineCache(FAM_A, "dashboard", { family: { id: FAM_A, name: "Fam A" } }, "user-1");
    await writeOfflineCache(FAM_A, "calendar", { events: [{ id: "ev-1" }] }, "user-1");
    await writeOfflineCache(FAM_A, "tasks", { tasks: [{ id: "t-1" }] }, "user-1");
    await writeOfflineCache(FAM_A, "shopping", { items: [{ id: ITEM_1 }] }, "user-1");

    expect((await readOfflineCache<{ family: { id: string } }>(FAM_A, "dashboard", "user-1"))?.data.family.id).toBe(FAM_A);
    expect((await readOfflineCache<{ events: unknown[] }>(FAM_A, "calendar", "user-1"))?.data.events).toHaveLength(1);
    expect((await readOfflineCache<{ tasks: unknown[] }>(FAM_A, "tasks", "user-1"))?.data.tasks).toHaveLength(1);
    expect((await readOfflineCache<{ items: unknown[] }>(FAM_A, "shopping", "user-1"))?.data.items).toHaveLength(1);
  });

  it("isolates cache across families and users, and clears both cache & outbox on logout", async () => {
    await writeOfflineCache(FAM_A, "dashboard", { secret: "fam-a-data" }, "user-1");
    await enqueueShoppingMutation(
      createQueuedShoppingMutation(FAM_A, "update_quantity", {
        itemId: ITEM_1,
        quantity: "3",
      })
    );

    // Family B cannot read Family A cache
    expect(await readOfflineCache(FAM_B, "dashboard", "user-1")).toBeNull();
    // User 2 cannot read User 1 cache even for same familyId
    expect(await readOfflineCache(FAM_A, "dashboard", "user-2")).toBeNull();

    // Logout clears both cache AND outbox
    await clearAllPwaStorage();
    expect(await readOfflineCache(FAM_A, "dashboard", "user-1")).toBeNull();
    expect(await listOutboxRecords()).toHaveLength(0);
  });

  it("enqueues shopping update_quantity and flushes it once without dual-flusher duplication", async () => {
    await enqueueShoppingMutation(
      createQueuedShoppingMutation(FAM_A, "update_quantity", {
        itemId: ITEM_1,
        quantity: "4",
      })
    );

    const [res1, res2] = await Promise.all([
      flushOfflineOutbox({ familyId: FAM_A, executor: executeDomainOfflineMutation }),
      flushOfflineOutbox({ familyId: FAM_A, executor: executeDomainOfflineMutation }),
    ]);

    expect(mockUpdateShoppingQuantity).toHaveBeenCalledTimes(1);
    expect(mockUpdateShoppingQuantity).toHaveBeenCalledWith({
      familyId: FAM_A,
      itemId: ITEM_1,
      quantity: "4",
    });
    expect(res1.synced).toBe(1);
    expect(res2.synced).toBe(1);
    expect(await listOutboxRecords(FAM_A)).toHaveLength(0);
  });

  it("preserves transient failures for retry and stops auto-retrying permanent permission failures", async () => {
    // Transient network failure -> attempts = 1, stays in outbox
    mockUpdateShoppingQuantity.mockResolvedValueOnce({
      ok: false,
      error: "Temporary network timeout",
    });
    await enqueueOfflineMutation({
      familyId: FAM_A,
      domain: "shopping",
      actionType: "update_quantity",
      payload: { itemId: ITEM_1, quantity: "2" },
    });

    const transientRes = await flushOfflineOutbox({
      familyId: FAM_A,
      executor: executeDomainOfflineMutation,
    });
    expect(transientRes.failed).toBe(1);
    const [transientRec] = await listOutboxRecords(FAM_A);
    expect(transientRec?.status).toBe("failed");
    expect(transientRec?.attempts).toBe(1);

    // Permanent permission failure -> attempts = maxAttempts (no endless retries)
    await clearAllPwaStorage();
    mockUpdateShoppingQuantity.mockResolvedValueOnce({
      ok: false,
      error: "You do not have permission to manage shopping items.",
    });
    await enqueueOfflineMutation({
      familyId: FAM_A,
      domain: "shopping",
      actionType: "update_quantity",
      payload: { itemId: ITEM_1, quantity: "2" },
    });

    const permRes = await flushOfflineOutbox({
      familyId: FAM_A,
      executor: executeDomainOfflineMutation,
    });
    expect(permRes.failed).toBe(1);
    const [permRec] = await listOutboxRecords(FAM_A);
    expect(permRec?.status).toBe("failed");
    expect(permRec?.attempts).toBe(permRec?.maxAttempts);
  });

  it("applies domain-specific conflict resolution strategies", () => {
    expect(
      resolveDomainConflict({
        domain: "tasks",
        localUpdatedAt: "2026-11-24T10:00:00Z",
        serverUpdatedAt: "2026-11-24T10:05:00Z",
        serverCompleted: true,
      }).resolution
    ).toBe("server_wins");

    expect(
      resolveDomainConflict({
        domain: "drafts",
        localUpdatedAt: "2026-11-24T10:00:00Z",
        serverUpdatedAt: "2026-11-24T10:05:00Z",
      }).resolution
    ).toBe("manual_review");

    expect(
      resolveDomainConflict({
        domain: "shopping",
        localUpdatedAt: "2026-11-24T10:00:00Z",
        serverUpdatedAt: "2026-11-24T10:05:00Z",
      }).resolution
    ).toBe("apply_client");
  });
});
