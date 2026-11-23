"use client";

import * as React from "react";
import Link from "next/link";
import {
  Download,
  Loader2,
  LogIn,
  RefreshCw,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { usePwaSync } from "@/hooks/use-pwa-sync";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";

export function PwaStatusBar({ familyId }: { familyId: string }) {
  const { t } = useLocale();
  const {
    isOnline,
    isSyncing,
    authExpired,
    summary,
    retrySync,
    updateAvailable,
    applyAppUpdate,
    canInstall,
    promptInstall,
  } = usePwaSync(familyId);

  const handleRetry = async () => {
    if (isSyncing) return;
    const res = await retrySync();
    if (res.authExpired) {
      toast.error(t("pwa.sessionExpiredToast"));
      return;
    }
    if (res.synced > 0 && res.failed === 0 && res.conflicts === 0) {
      toast.success(t("pwa.syncedToast", { count: res.synced }));
    } else if (res.failed > 0) {
      toast.error(t("pwa.failedToast", { count: res.failed }));
    } else if (res.conflicts > 0) {
      toast.warning(t("pwa.conflictsToast", { count: res.conflicts }));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isOnline && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tint-peach)] px-3 py-1 text-[12px] font-medium text-[var(--tint-peach-fg)]">
          <WifiOff className="h-3.5 w-3.5" />
          {t("pwa.offline")}
        </span>
      )}

      {isSyncing && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tint-sage)] px-3 py-1 text-[12px] font-medium text-[var(--tint-sage-fg)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("pwa.syncing")}
        </span>
      )}

      {!isSyncing && summary.pendingCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tint-sand)] px-3 py-1 text-[12px] font-medium text-[var(--text-primary)]">
          <UploadCloud className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          {t("pwa.pendingSync", { count: summary.pendingCount })}
        </span>
      )}

      {authExpired && (
        <Link
          href={routes.login}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-danger-bg)] px-3 py-1 text-[12px] font-medium text-[var(--status-danger-fg)]"
        >
          <LogIn className="h-3.5 w-3.5" />
          {t("pwa.sessionExpired")}
        </Link>
      )}

      {!authExpired && (summary.failedCount > 0 || summary.conflictCount > 0) && (
        <button
          type="button"
          disabled={isSyncing || !isOnline}
          onClick={() => void handleRetry()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-danger-bg)] px-3 py-1 text-[12px] font-medium text-[var(--status-danger-fg)] disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("pwa.syncIssueRetry", {
            count: summary.failedCount + summary.conflictCount,
          })}
        </button>
      )}

      {canInstall && (
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          {t("pwa.installApp")}
        </button>
      )}

      {updateAvailable && (
        <button
          type="button"
          onClick={applyAppUpdate}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-primary)] px-3 py-1 text-[12px] font-semibold text-[var(--accent-primary-fg)] cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("pwa.updateReady")}
        </button>
      )}
    </div>
  );
}
