import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMemoryPwaStoresForTests,
  listOutboxRecords,
  readOfflineCache,
  writeOfflineCache,
} from "../indexeddb";
import {
  computeSyncBackoffMs,
  enqueueOfflineMutation,
  flushOfflineOutbox,
  getOutboxSummary,
  isOfflineQueueAllowedDomain,
  migrateLegacyShoppingQueue,
  resolveDomainConflict,
} from "../sync-engine";
import {
  createQueuedShoppingMutation,
  enqueueShoppingMutation,
  flushShoppingMutations,
  getQueuedShoppingMutations,
} from "@/features/shopping/offline-queue";

describe("Phase 1 — AUD-001 Retry & AUD-003 Unified Offline Architecture", () => {
  beforeEach(() => {
    clearMemoryPwaStoresForTests();
  });

  it("blocks offline queueing for financial transactions, permission changes, and sensitive uploads", async () => {
    expect(isOfflineQueueAllowedDomain("finance")).toBe(false);
    expect(isOfflineQueueAllowedDomain("permissions")).toBe(false);
    expect(isOfflineQueueAllowedDomain("sensitive_uploads")).toBe(false);
    expect(isOfflineQueueAllowedDomain("tasks")).toBe(true);
    expect(isOfflineQueueAllowedDomain("shopping")).toBe(true);
    expect(isOfflineQueueAllowedDomain("calendar")).toBe(true);
    expect(isOfflineQueueAllowedDomain("drafts")).toBe(true);

    const blocked = await enqueueOfflineMutation({
      familyId: "fam-1",
      domain: "finance",
      actionType: "create_transaction",
      payload: { amount: 5000 },
    });
    expect(blocked.ok).toBe(false);
  });

  it("AUD-001: retries failed mutations safely, handles thrown network errors, and prevents concurrent duplicate execution", async () => {
    await enqueueOfflineMutation({
      familyId: "fam-1",
      domain: "tasks",
      actionType: "toggle_status",
      payload: { taskId: "t-1", nextStatus: "done" },
      idempotencyKey: "key-retry-1",
    });

    // Duplicate enqueue with same idempotencyKey does not create a second record
    await enqueueOfflineMutation({
      familyId: "fam-1",
      domain: "tasks",
      actionType: "toggle_status",
      payload: { taskId: "t-1", nextStatus: "done" },
      idempotencyKey: "key-retry-1",
    });
    expect(await listOutboxRecords("fam-1")).toHaveLength(1);

    // 1st attempt throws a network error -> failed mutation stays in outbox
    const first = await flushOfflineOutbox({
      familyId: "fam-1",
      nowMs: 1_000_000,
      executor: async () => {
        throw new Error("Network offline");
      },
    });
    expect(first.failed).toBe(1);
    const items = await listOutboxRecords("fam-1");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("failed");
    expect(items[0].attempts).toBe(1);

    // Concurrent retry clicks share the same in-flight promise and execute only once
    const execSpy = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { ok: true };
    });

    const [r1, r2] = await Promise.all([
      flushOfflineOutbox({
        familyId: "fam-1",
        forceRetryFailed: true,
        executor: execSpy,
      }),
      flushOfflineOutbox({
        familyId: "fam-1",
        forceRetryFailed: true,
        executor: execSpy,
      }),
    ]);

    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(r1.synced).toBe(1);
    expect(r2.synced).toBe(1);
    expect(await getOutboxSummary("fam-1")).toEqual({
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
    });
  });

  it("AUD-001: preserves mutations safely when auth session is expired", async () => {
    await enqueueOfflineMutation({
      familyId: "fam-1",
      domain: "calendar",
      actionType: "save_event",
      payload: { title: "Doctor visit" },
    });

    const res = await flushOfflineOutbox({
      familyId: "fam-1",
      executor: async () => ({
        ok: false,
        authExpired: true,
        error: "Session expired",
      }),
    });

    expect(res.authExpired).toBe(true);
    expect(res.failed).toBe(1);
    const items = await listOutboxRecords("fam-1");
    expect(items).toHaveLength(1);
    expect(items[0].lastError).toContain("Session expired");
  });

  it("AUD-003: supports Shopping, Tasks, Calendar offline mutations, Dashboard cache, and strict family isolation", async () => {
    await writeOfflineCache("fam-1", "dashboard", {
      tasksDueToday: 3,
      cachedHeadline: "Morning rhythm",
    });
    expect(
      (await readOfflineCache<{ tasksDueToday: number }>("fam-1", "dashboard"))
        ?.data.tasksDueToday
    ).toBe(3);
    expect(await readOfflineCache("fam-2", "dashboard")).toBeNull();

    // Shopping queue delegates to IndexedDB
    const shopMut = createQueuedShoppingMutation("fam-1", "add_item", {
      name: "Oat Milk",
    });
    await enqueueShoppingMutation(shopMut);
    expect(await getQueuedShoppingMutations("fam-1")).toHaveLength(1);
    expect(await getQueuedShoppingMutations("fam-2")).toHaveLength(0);

    // Tasks & Calendar offline mutations in fam-1
    await enqueueOfflineMutation({
      familyId: "fam-1",
      domain: "tasks",
      actionType: "save_task",
      payload: { title: "Pack bags" },
    });
    await enqueueOfflineMutation({
      familyId: "fam-1",
      domain: "calendar",
      actionType: "save_event",
      payload: { title: "School pickup" },
    });

    const shopFlush = await flushShoppingMutations("fam-1", async () => true);
    expect(shopFlush).toEqual({ flushed: 1, remaining: 0 });
    // Tasks & Calendar mutations remain queued for their own domain sync
    expect(await listOutboxRecords("fam-1")).toHaveLength(2);
  });

  it("AUD-003: migrates legacy localStorage shopping queue into IndexedDB without data loss", async () => {
    const legacyKey = "famora:offline-shopping:fam-legacy";
    const legacyItems = [
      {
        id: "leg-1",
        familyId: "fam-legacy",
        type: "add_item",
        payload: { name: "Apples" },
        createdAt: "2026-11-23T00:00:00.000Z",
      },
    ];
    const mockStorage = new Map<string, string>([
      [legacyKey, JSON.stringify(legacyItems)],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => mockStorage.get(k) ?? null,
        setItem: (k: string, v: string) => mockStorage.set(k, v),
        removeItem: (k: string) => mockStorage.delete(k),
      },
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("CustomEvent", class CustomEvent {});

    const migratedCount = await migrateLegacyShoppingQueue("fam-legacy");
    expect(migratedCount).toBe(1);
    expect(mockStorage.has(legacyKey)).toBe(false);
    const outbox = await listOutboxRecords("fam-legacy");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].idempotencyKey).toBe("leg-1");

    vi.unstubAllGlobals();
  });

  it("computes exponential backoff and domain-specific conflict resolution for shopping, tasks, calendar, and drafts", () => {
    expect(computeSyncBackoffMs(0)).toBe(2000);
    expect(computeSyncBackoffMs(2)).toBe(15000);

    expect(
      resolveDomainConflict({
        domain: "shopping",
        localUpdatedAt: "2026-11-22T10:00:00.000Z",
        serverUpdatedAt: "2026-11-22T10:05:00.000Z",
      })
    ).toEqual({ resolution: "apply_client" });

    expect(
      resolveDomainConflict({
        domain: "tasks",
        localUpdatedAt: "2026-11-22T10:00:00.000Z",
        serverUpdatedAt: "2026-11-22T10:05:00.000Z",
        serverCompleted: true,
      }).resolution
    ).toBe("server_wins");

    expect(
      resolveDomainConflict({
        domain: "calendar",
        localUpdatedAt: "2026-11-22T10:00:00.000Z",
        serverUpdatedAt: "2026-11-22T10:05:00.000Z",
      }).resolution
    ).toBe("server_wins");

    expect(
      resolveDomainConflict({
        domain: "drafts",
        localUpdatedAt: "2026-11-22T10:00:00.000Z",
        serverUpdatedAt: "2026-11-22T10:05:00.000Z",
      }).resolution
    ).toBe("manual_review");
  });
});
