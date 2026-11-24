"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SenvamilyLogo } from "@/components/ui/brand-logo";
import { openAndroidApkDownloadInBrowser } from "@/lib/app-update/native-updater";
import { formatApkSize } from "@/lib/app-update/policy";
import type { AndroidReleaseManifest } from "@/lib/app-update/types";

export function AppUpdateModal({
  open,
  mandatory,
  installedVersionName,
  installedVersionCode,
  manifest,
  onDismiss,
}: {
  open: boolean;
  mandatory: boolean;
  installedVersionName: string;
  installedVersionCode: number;
  manifest: AndroidReleaseManifest;
  onDismiss?: () => void;
}) {
  const [opening, setOpening] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setOpening(false);
      setErrorMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const handleStartUpdate = async () => {
    setErrorMsg(null);
    setOpening(true);
    try {
      await openAndroidApkDownloadInBrowser(manifest.downloadUrl);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal membuka tautan unduhan pembaruan."
      );
    } finally {
      setOpening(false);
    }
  };

  const title = mandatory ? "Update Diperlukan" : "Update Senvamily";
  const description = mandatory
    ? "Versi Senvamily yang kamu gunakan sudah tidak didukung. Silakan update untuk melanjutkan."
    : "Versi terbaru Senvamily sudah tersedia. Update sekarang untuk menikmati fitur dan peningkatan terbaru.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="senvamily-update-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-float)]">
        <div className="flex items-start gap-3">
          <SenvamilyLogo size="sm" showWordmark={false} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {mandatory && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--status-danger-fg)]" />
              )}
              <h2
                id="senvamily-update-title"
                className="font-heading text-[18px] font-bold text-[var(--text-primary)]"
              >
                {title}
              </h2>
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-2xl bg-[var(--bg-subtle)] p-3.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Versi saat ini</span>
            <span className="font-medium text-[var(--text-primary)]">
              v{installedVersionName} ({installedVersionCode})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Versi terbaru</span>
            <span className="font-semibold text-[var(--accent-primary)]">
              v{manifest.latestVersion} ({manifest.versionCode})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Ukuran unduhan</span>
            <span className="font-medium text-[var(--text-primary)]">
              {formatApkSize(manifest.fileSize)}
            </span>
          </div>
        </div>

        {manifest.releaseNotes.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Catatan Rilis
            </p>
            <ul className="space-y-1 text-[13px] text-[var(--text-secondary)]">
              {manifest.releaseNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorMsg && (
          <p className="mt-3 rounded-xl bg-[var(--status-danger-bg)] px-3 py-2 text-[12.5px] text-[var(--status-danger-fg)]">
            {errorMsg}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!mandatory && onDismiss && (
            <Button type="button" variant="ghost" disabled={opening} onClick={onDismiss}>
              Nanti
            </Button>
          )}
          <Button type="button" isLoading={opening} onClick={() => void handleStartUpdate()}>
            <Download className="h-4 w-4" />
            Update Sekarang
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
