"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "./use-online-status";
import { executeDomainOfflineMutation } from "@/lib/pwa/domain-sync";
import {
  flushOfflineOutbox,
  getOutboxSummary,
  migrateLegacyShoppingQueue,
  PWA_OUTBOX_CHANGED_EVENT,
} from "@/lib/pwa/sync-engine";
import type { FlushOutboxResult, SyncStatusSummary } from "@/lib/pwa/types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaSync(familyId?: string) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [summary, setSummary] = React.useState<SyncStatusSummary>({
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
  });
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [authExpired, setAuthExpired] = React.useState(false);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [waitingWorker, setWaitingWorker] =
    React.useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);

  const refreshSummary = React.useCallback(async () => {
    try {
      if (familyId) {
        await migrateLegacyShoppingQueue(familyId);
      }
      const next = await getOutboxSummary(familyId);
      setSummary(next);
    } catch {
      // IndexedDB may be restricted in private browsing
    }
  }, [familyId]);

  const runFlush = React.useCallback(
    async (forceRetryFailed: boolean): Promise<FlushOutboxResult> => {
      if (!isOnline) {
        return { synced: 0, failed: summary.failedCount, conflicts: summary.conflictCount, authExpired: false };
      }
      setIsSyncing(true);
      try {
        if (familyId) {
          await migrateLegacyShoppingQueue(familyId);
        }
        const res = await flushOfflineOutbox({
          familyId,
          forceRetryFailed,
          executor: executeDomainOfflineMutation,
        });
        setAuthExpired(res.authExpired);
        await refreshSummary();
        if (res.synced > 0) {
          router.refresh();
        }
        return res;
      } finally {
        setIsSyncing(false);
      }
    },
    [familyId, isOnline, refreshSummary, router, summary.conflictCount, summary.failedCount]
  );

  const retrySync = React.useCallback(
    () => runFlush(true),
    [runFlush]
  );

  // Refresh outbox summary on mount & whenever any domain enqueues/modifies outbox
  React.useEffect(() => {
    void refreshSummary();
    if (typeof window === "undefined") return;
    const onOutboxChanged = () => void refreshSummary();
    window.addEventListener(PWA_OUTBOX_CHANGED_EVENT, onOutboxChanged);
    return () =>
      window.removeEventListener(PWA_OUTBOX_CHANGED_EVENT, onOutboxChanged);
  }, [refreshSummary]);

  // Automatic synchronization when connectivity returns
  React.useEffect(() => {
    if (!isOnline) return;
    void runFlush(false);
  }, [isOnline, runFlush]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let active = true;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (!active) return;
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setUpdateAvailable(true);
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(installing);
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch(() => {
        // Ignore SW registration failure in unsupported environments
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const applyAppUpdate = React.useCallback(() => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }, [waitingWorker]);

  const promptInstall = React.useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  return {
    isOnline,
    isSyncing,
    authExpired,
    summary,
    refreshSummary,
    retrySync,
    updateAvailable,
    applyAppUpdate,
    canInstall: Boolean(installPrompt),
    promptInstall,
  };
}
