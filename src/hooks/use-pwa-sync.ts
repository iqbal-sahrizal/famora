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
  const summaryRef = React.useRef(summary);
  summaryRef.current = summary;
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [authExpired, setAuthExpired] = React.useState(false);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [waitingWorker, setWaitingWorker] =
    React.useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = React.useState(false);
  const [installDismissed, setInstallDismissed] = React.useState(false);
  const reloadingRef = React.useRef(false);

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
        return {
          synced: 0,
          failed: summaryRef.current.failedCount,
          conflicts: summaryRef.current.conflictCount,
          authExpired: false,
        };
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
    [familyId, isOnline, refreshSummary, router]
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
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const isNativeApp =
      (typeof cap?.isNativePlatform === "function" && Boolean(cap.isNativePlatform())) ||
      document.referrer.startsWith("android-app://");
    const standalone =
      isNativeApp ||
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);
    try {
      setInstallDismissed(window.sessionStorage.getItem("famora_install_dismissed") === "1");
    } catch {
      // sessionStorage unavailable
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const applyAppUpdate = React.useCallback((): boolean => {
    if (!waitingWorker || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }
    try {
      const onControllerChange = () => {
        if (reloadingRef.current) return;
        reloadingRef.current = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, {
        once: true,
      });
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return true;
    } catch {
      return false;
    }
  }, [waitingWorker]);

  const promptInstall = React.useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!installPrompt) return "unavailable";
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      return "accepted";
    }
    setInstallDismissed(true);
    try {
      window.sessionStorage.setItem("famora_install_dismissed", "1");
    } catch {
      // ignore
    }
    return "dismissed";
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
    isInstalled,
    canInstall: Boolean(installPrompt) && !isInstalled && !installDismissed,
    promptInstall,
  };
}
