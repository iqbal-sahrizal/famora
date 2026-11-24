import {
  deleteOutboxRecord,
  listOutboxRecords,
  putOutboxRecord,
} from "./indexeddb";
import type {
  FlushOutboxResult,
  OfflineMutationRecord,
  OfflineSyncDomain,
  SyncStatusSummary,
} from "./types";

const ALLOWED_OFFLINE_DOMAINS = new Set<string>([
  "tasks",
  "shopping",
  "calendar",
  "drafts",
]);

const LEGACY_SHOPPING_PREFIX = "famora:offline-shopping:";
const inFlightFlushByKey = new Map<string, Promise<FlushOutboxResult>>();

export const PWA_OUTBOX_CHANGED_EVENT = "famora:pwa-outbox-changed";

function notifyOutboxChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PWA_OUTBOX_CHANGED_EVENT));
  }
}

/**
 * Financial transactions, permission changes, and sensitive uploads
 * must NEVER be queued or treated as successful offline operations.
 */
export function isOfflineQueueAllowedDomain(
  domain: string
): domain is OfflineSyncDomain {
  return ALLOWED_OFFLINE_DOMAINS.has(domain);
}

export function computeSyncBackoffMs(attempts: number): number {
  const scheduleMs = [2000, 5000, 15000, 45000, 120000];
  const idx = Math.min(Math.max(0, attempts), scheduleMs.length - 1);
  return scheduleMs[idx];
}

export function isAuthExpiredErrorMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  return /(unauthorized|not authenticated|session expired|jwt expired|auth session missing)/i.test(
    msg
  );
}

export function isPermanentOfflineError(msg: string | undefined): boolean {
  if (!msg) return false;
  return /(missing permission|do not have permission|not authorized|forbidden|not an active member|not found|invalid .* reference|cannot .* archived)/i.test(
    msg
  );
}

export type ConflictDecision =
  | { resolution: "apply_client" }
  | { resolution: "server_wins"; reason: string }
  | { resolution: "manual_review"; reason: string };

/**
 * Domain-specific conflict resolution:
 * - shopping: field-level CRDT-style check/quantity merge (always applies idempotently)
 * - tasks: server wins if already completed/deleted on server; otherwise LWW by timestamp
 * - calendar: server wins if newer update or cancellation exists on server
 * - drafts: never silently overwrite newer server drafts; flag for manual review
 */
export function resolveDomainConflict(params: {
  domain: OfflineSyncDomain;
  localUpdatedAt: string;
  serverUpdatedAt: string | null;
  serverDeleted?: boolean;
  serverCompleted?: boolean;
}): ConflictDecision {
  if (params.serverDeleted) {
    return {
      resolution: "server_wins",
      reason: "Item was deleted on the server.",
    };
  }

  if (params.domain === "shopping") {
    return { resolution: "apply_client" };
  }

  if (params.domain === "tasks") {
    if (params.serverCompleted) {
      return {
        resolution: "server_wins",
        reason: "Task was already completed by another family member.",
      };
    }
    if (
      params.serverUpdatedAt &&
      new Date(params.serverUpdatedAt).getTime() >
        new Date(params.localUpdatedAt).getTime()
    ) {
      return {
        resolution: "server_wins",
        reason: "Newer task update exists on the server.",
      };
    }
    return { resolution: "apply_client" };
  }

  if (params.domain === "calendar") {
    if (
      params.serverUpdatedAt &&
      new Date(params.serverUpdatedAt).getTime() >
        new Date(params.localUpdatedAt).getTime()
    ) {
      return {
        resolution: "server_wins",
        reason: "Newer calendar event update exists on the server.",
      };
    }
    return { resolution: "apply_client" };
  }

  // drafts: preserve user's draft and ask for review if server has a newer version
  if (
    params.serverUpdatedAt &&
    new Date(params.serverUpdatedAt).getTime() >
      new Date(params.localUpdatedAt).getTime()
  ) {
    return {
      resolution: "manual_review",
      reason: "A newer draft exists on the server.",
    };
  }
  return { resolution: "apply_client" };
}

export async function enqueueOfflineMutation(params: {
  familyId: string;
  domain: string;
  actionType: string;
  payload: Record<string, unknown>;
  expectedUpdatedAt?: string | null;
  idempotencyKey?: string;
  createdAt?: string;
}): Promise<
  | { ok: true; record: OfflineMutationRecord }
  | { ok: false; error: string }
> {
  if (!isOfflineQueueAllowedDomain(params.domain)) {
    return {
      ok: false,
      error: `Offline queueing is disabled for "${params.domain}" for safety and financial integrity.`,
    };
  }

  const key = params.idempotencyKey ?? crypto.randomUUID();
  const existing = await listOutboxRecords(params.familyId);
  const dup = existing.find((r) => r.idempotencyKey === key);
  if (dup) {
    return { ok: true, record: dup };
  }

  const nowIso = params.createdAt ?? new Date().toISOString();
  const record: OfflineMutationRecord = {
    id: key,
    idempotencyKey: key,
    familyId: params.familyId,
    domain: params.domain,
    actionType: params.actionType,
    payload: params.payload,
    expectedUpdatedAt: params.expectedUpdatedAt ?? null,
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: nowIso,
    lastError: null,
    createdAt: nowIso,
  };

  await putOutboxRecord(record);
  notifyOutboxChanged();
  return { ok: true, record };
}

/**
 * Safely migrates legacy localStorage shopping queue entries into IndexedDB
 * without deleting any pending items until IndexedDB persistence succeeds.
 */
export async function migrateLegacyShoppingQueue(
  familyId: string
): Promise<number> {
  if (typeof window === "undefined") return 0;
  const storageKey = `${LEGACY_SHOPPING_PREFIX}${familyId}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return 0;
    const items = JSON.parse(raw) as Array<{
      id: string;
      familyId: string;
      type: "add_item" | "toggle_check" | "update_quantity";
      payload: Record<string, unknown>;
      createdAt: string;
    }>;
    if (!Array.isArray(items) || items.length === 0) {
      window.localStorage.removeItem(storageKey);
      return 0;
    }

    let migrated = 0;
    for (const item of items) {
      if (item.familyId !== familyId) continue;
      const res = await enqueueOfflineMutation({
        familyId,
        domain: "shopping",
        actionType: item.type,
        payload: item.payload,
        idempotencyKey: item.id,
        createdAt: item.createdAt,
      });
      if (!res.ok) {
        // Abort cleanup so no pending mutation is ever lost
        return migrated;
      }
      migrated += 1;
    }

    window.localStorage.removeItem(storageKey);
    return migrated;
  } catch {
    return 0;
  }
}

export async function getOutboxSummary(
  familyId?: string
): Promise<SyncStatusSummary> {
  const items = await listOutboxRecords(familyId);
  return {
    pendingCount: items.filter(
      (i) => i.status === "pending" || i.status === "syncing"
    ).length,
    failedCount: items.filter((i) => i.status === "failed").length,
    conflictCount: items.filter((i) => i.status === "conflict").length,
  };
}

export async function flushOfflineOutbox(params: {
  familyId?: string;
  nowMs?: number;
  forceRetryFailed?: boolean;
  executor: (record: OfflineMutationRecord) => Promise<{
    ok: boolean;
    conflict?: boolean;
    authExpired?: boolean;
    error?: string;
  }>;
}): Promise<FlushOutboxResult> {
  const lockKey = params.familyId ?? "__all__";
  const existingFlight = inFlightFlushByKey.get(lockKey);
  if (existingFlight) {
    return existingFlight;
  }

  const run = (async (): Promise<FlushOutboxResult> => {
    const nowMs = params.nowMs ?? Date.now();
    const records = await listOutboxRecords(params.familyId);
    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    let authExpired = false;

    for (const record of records) {
      if (record.status === "conflict") {
        conflicts += 1;
        continue;
      }
      if (record.attempts >= record.maxAttempts && !params.forceRetryFailed) {
        failed += 1;
        continue;
      }
      if (
        !params.forceRetryFailed &&
        record.status === "failed" &&
        new Date(record.nextAttemptAt).getTime() > nowMs
      ) {
        failed += 1;
        continue;
      }

      await putOutboxRecord({ ...record, status: "syncing" });
      notifyOutboxChanged();

      let res: {
        ok: boolean;
        conflict?: boolean;
        authExpired?: boolean;
        error?: string;
      };
      try {
        res = await params.executor(record);
      } catch (err) {
        res = {
          ok: false,
          error: err instanceof Error ? err.message : "Network request failed.",
        };
      }

      if (res.authExpired || isAuthExpiredErrorMessage(res.error)) {
        // Preserve pending mutation safely without incrementing failure exhaustion
        await putOutboxRecord({
          ...record,
          status: "failed",
          lastError: "Session expired. Sign in to resume syncing.",
        });
        authExpired = true;
        failed += 1;
        break;
      }

      if (res.ok) {
        await deleteOutboxRecord(record.id);
        synced += 1;
      } else if (res.conflict) {
        await putOutboxRecord({
          ...record,
          status: "conflict",
          lastError: res.error ?? "Conflict detected.",
        });
        conflicts += 1;
      } else if (isPermanentOfflineError(res.error)) {
        await putOutboxRecord({
          ...record,
          status: "failed",
          attempts: record.maxAttempts,
          lastError: res.error ?? "Mutation rejected permanently.",
        });
        failed += 1;
      } else {
        const nextAttempts = record.attempts + 1;
        const delayMs = computeSyncBackoffMs(nextAttempts);
        await putOutboxRecord({
          ...record,
          status: "failed",
          attempts: nextAttempts,
          nextAttemptAt: new Date(nowMs + delayMs).toISOString(),
          lastError: res.error ?? "Sync failed.",
        });
        failed += 1;
      }
    }

    notifyOutboxChanged();
    return { synced, failed, conflicts, authExpired };
  })();

  inFlightFlushByKey.set(lockKey, run);
  try {
    return await run;
  } finally {
    inFlightFlushByKey.delete(lockKey);
  }
}
