import type {
  OfflineCacheDomain,
  OfflineCacheEntry,
  OfflineMutationRecord,
} from "./types";

const DB_NAME = "famora-pwa-db";
const DB_VERSION = 1;
const STORE_CACHE = "offline_cache";
const STORE_OUTBOX = "mutation_outbox";

// In-memory fallback for SSR / Node Vitest environments without IndexedDB
const memoryCacheStore = new Map<string, OfflineCacheEntry>();
const memoryOutboxStore = new Map<string, OfflineMutationRecord>();

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openPwaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
        outbox.createIndex("familyId", "familyId", { unique: false });
        outbox.createIndex("status", "status", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function writeOfflineCache<T>(
  familyId: string,
  domain: OfflineCacheDomain,
  data: T
): Promise<void> {
  const entry: OfflineCacheEntry<T> = {
    key: `${familyId}:${domain}`,
    familyId,
    domain,
    data,
    cachedAt: new Date().toISOString(),
  };

  if (!hasIndexedDb()) {
    memoryCacheStore.set(entry.key, entry);
    return;
  }

  const db = await openPwaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    tx.objectStore(STORE_CACHE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readOfflineCache<T>(
  familyId: string,
  domain: OfflineCacheDomain
): Promise<OfflineCacheEntry<T> | null> {
  const key = `${familyId}:${domain}`;
  if (!hasIndexedDb()) {
    return (memoryCacheStore.get(key) as OfflineCacheEntry<T> | undefined) ?? null;
  }

  const db = await openPwaDb();
  return new Promise<OfflineCacheEntry<T> | null>((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readonly");
    const req = tx.objectStore(STORE_CACHE).get(key);
    req.onsuccess = () =>
      resolve((req.result as OfflineCacheEntry<T> | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putOutboxRecord(
  record: OfflineMutationRecord
): Promise<void> {
  if (!hasIndexedDb()) {
    memoryOutboxStore.set(record.id, record);
    return;
  }

  const db = await openPwaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    tx.objectStore(STORE_OUTBOX).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteOutboxRecord(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    memoryOutboxStore.delete(id);
    return;
  }

  const db = await openPwaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    tx.objectStore(STORE_OUTBOX).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listOutboxRecords(
  familyId?: string
): Promise<OfflineMutationRecord[]> {
  if (!hasIndexedDb()) {
    const all = Array.from(memoryOutboxStore.values());
    const filtered = familyId ? all.filter((r) => r.familyId === familyId) : all;
    return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const db = await openPwaDb();
  return new Promise<OfflineMutationRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readonly");
    const req = tx.objectStore(STORE_OUTBOX).getAll();
    req.onsuccess = () => {
      const all = (req.result as OfflineMutationRecord[]) ?? [];
      const filtered = familyId
        ? all.filter((r) => r.familyId === familyId)
        : all;
      resolve(filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearOfflineCache(): Promise<void> {
  memoryCacheStore.clear();
  if (!hasIndexedDb()) return;

  const db = await openPwaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    tx.objectStore(STORE_CACHE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearMemoryPwaStoresForTests(): void {
  memoryCacheStore.clear();
  memoryOutboxStore.clear();
}
