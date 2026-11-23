export type OfflineCacheDomain =
  | "dashboard"
  | "tasks"
  | "shopping"
  | "calendar"
  | "drafts";

export type OfflineSyncDomain = "tasks" | "shopping" | "calendar" | "drafts";

export type DisallowedOfflineDomain =
  | "finance"
  | "permissions"
  | "sensitive_uploads";

export type OfflineMutationStatus =
  | "pending"
  | "syncing"
  | "failed"
  | "conflict";

export interface OfflineCacheEntry<T = unknown> {
  key: string; // `${familyId}:${domain}`
  familyId: string;
  domain: OfflineCacheDomain;
  data: T;
  cachedAt: string;
}

export interface OfflineMutationRecord {
  id: string;
  idempotencyKey: string;
  familyId: string;
  domain: OfflineSyncDomain;
  actionType: string;
  payload: Record<string, unknown>;
  expectedUpdatedAt: string | null;
  status: OfflineMutationStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
}

export interface SyncStatusSummary {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
}

export interface FlushOutboxResult {
  synced: number;
  failed: number;
  conflicts: number;
  authExpired: boolean;
  skippedConcurrent?: boolean;
}
