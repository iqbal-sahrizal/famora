import { listOutboxRecords } from "@/lib/pwa/indexeddb";
import {
  enqueueOfflineMutation,
  flushOfflineOutbox,
  migrateLegacyShoppingQueue,
} from "@/lib/pwa/sync-engine";

export interface QueuedShoppingMutation {
  id: string;
  familyId: string;
  type: "add_item" | "toggle_check" | "update_quantity";
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Creates a deterministic offline mutation envelope with a unique idempotency key.
 */
export function createQueuedShoppingMutation(
  familyId: string,
  type: QueuedShoppingMutation["type"],
  payload: Record<string, unknown>
): QueuedShoppingMutation {
  return {
    id: crypto.randomUUID(),
    familyId,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export async function getQueuedShoppingMutations(
  familyId: string
): Promise<QueuedShoppingMutation[]> {
  await migrateLegacyShoppingQueue(familyId);
  const records = await listOutboxRecords(familyId);
  return records
    .filter((r) => r.domain === "shopping")
    .map((r) => ({
      id: r.idempotencyKey,
      familyId: r.familyId,
      type: r.actionType as QueuedShoppingMutation["type"],
      payload: r.payload,
      createdAt: r.createdAt,
    }));
}

export async function enqueueShoppingMutation(
  mutation: QueuedShoppingMutation
): Promise<void> {
  await enqueueOfflineMutation({
    familyId: mutation.familyId,
    domain: "shopping",
    actionType: mutation.type,
    payload: mutation.payload,
    idempotencyKey: mutation.id,
    createdAt: mutation.createdAt,
  });
}

/**
 * Replays queued shopping mutations from IndexedDB in FIFO order for a specific familyId,
 * migrating any legacy localStorage items first without losing pending work.
 */
export async function flushShoppingMutations(
  familyId: string,
  executor: (m: QueuedShoppingMutation) => Promise<boolean>
): Promise<{ flushed: number; remaining: number }> {
  await migrateLegacyShoppingQueue(familyId);
  const res = await flushOfflineOutbox({
    familyId,
    forceRetryFailed: true,
    executor: async (record) => {
      if (record.domain !== "shopping") {
        return { ok: false, error: "Deferred non-shopping item" };
      }
      const ok = await executor({
        id: record.idempotencyKey,
        familyId: record.familyId,
        type: record.actionType as QueuedShoppingMutation["type"],
        payload: record.payload,
        createdAt: record.createdAt,
      });
      return { ok, error: ok ? undefined : "Shopping sync failed." };
    },
  });

  const remainingItems = await getQueuedShoppingMutations(familyId);
  return { flushed: res.synced, remaining: remainingItems.length };
}
