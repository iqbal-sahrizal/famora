"use client";

import * as React from "react";
import { readOfflineCache, writeOfflineCache } from "@/lib/pwa/indexeddb";
import type { OfflineCacheDomain } from "@/lib/pwa/types";
import { useOnlineStatus } from "./use-online-status";

const DEFAULT_MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

export function useOfflineCachedData<T>({
  familyId,
  domain,
  serverData,
  isEmptyData,
  maxAgeMs = DEFAULT_MAX_CACHE_AGE_MS,
}: {
  familyId: string;
  domain: OfflineCacheDomain;
  serverData: T;
  isEmptyData: (data: T) => boolean;
  maxAgeMs?: number;
}) {
  const isOnline = useOnlineStatus();
  const [cachedEntry, setCachedEntry] = React.useState<{
    familyId: string;
    data: T;
    cachedAt: string;
  } | null>(null);

  // Immediately drop previous family's in-memory fallback when switching familyId
  React.useEffect(() => {
    setCachedEntry(null);
  }, [familyId]);

  const serverHasData = !isEmptyData(serverData);

  React.useEffect(() => {
    let active = true;
    if (isOnline && serverHasData) {
      void writeOfflineCache(familyId, domain, serverData).then(() => {
        if (active) {
          setCachedEntry({
            familyId,
            data: serverData,
            cachedAt: new Date().toISOString(),
          });
        }
      });
    } else if (!serverHasData) {
      void readOfflineCache<T>(familyId, domain).then((entry) => {
        if (!active) return;
        if (entry && entry.familyId === familyId && !isEmptyData(entry.data)) {
          setCachedEntry({
            familyId: entry.familyId,
            data: entry.data,
            cachedAt: entry.cachedAt,
          });
        }
      });
    }
    return () => {
      active = false;
    };
  }, [familyId, domain, isOnline, serverData, serverHasData, isEmptyData]);

  const matchingCache =
    cachedEntry && cachedEntry.familyId === familyId ? cachedEntry : null;
  const isFromCache = !serverHasData && matchingCache !== null;
  const effectiveData = isFromCache ? matchingCache.data : serverData;
  const cachedAt = isFromCache ? matchingCache.cachedAt : null;
  const isCacheExpired =
    isFromCache && cachedAt
      ? Date.now() - new Date(cachedAt).getTime() > maxAgeMs
      : false;

  return {
    effectiveData,
    isFromCache,
    isCacheExpired,
    cachedAt,
    isOnline,
  };
}
