"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SenvamilyLogo } from "@/components/ui/brand-logo";
import {
  addApkDownloadProgressListener,
  canRequestAndroidPackageInstalls,
  downloadAndVerifyAndroidApk,
  installVerifiedAndroidApk,
  openAndroidUnknownSourcesSettings,
} from "@/lib/app-update/native-updater";
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
  const [stage, setStage] = React.useState<
    "idle" | "permission_needed" | "downloading" | "verifying" | "installing" | "error"
  >("idle");
  const [progress, setProgress] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setStage("idle");
      setProgress(0);
      setErrorMsg(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handlePromise = addApkDownloadProgressListener((evt) => {
      setProgress(evt.progress);
    });
    return () => {
      void handlePromise.then((h) => h?.remove());
    };
  }, [open]);

  if (!open) return null;

  const handleStartUpdate = async () => {
    setErrorMsg(null);
    try {
      const canInstall = await canRequestAndroidPackageInstalls();
      if (!canInstall) {
        setStage("permission_needed");
        return;
      }

      setStage("downloading");
      setProgress(0);
      const downloaded = await downloadAndVerifyAndroidApk({
        url: manifest.downloadUrl,
        sha256: manifest.sha256,
        versionCode: manifest.versionCode,
      });

      setStage("installing");
      const result = await installVerifiedAndroidApk(downloaded.filePath);
      if (result.status === "cancelled") {
        setStage("idle");
        setErrorMsg("Instalasi dibatalkan. Tekan Update Sekarang untuk mencoba lagi.");
      }
    } catch (err) {
      setStage("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal mengunduh atau memverifikasi pembaruan."
      );
    }
  };

  const handleOpenSettings = async () => {
    await openAndroidUnknownSourcesSettings();
    setStage("idle");
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

        {stage === "downloading" && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[12.5px] text-[var(--text-secondary)]">
              <span>Mengunduh &amp; memverifikasi APK...</span>
              <span className="tabular-nums font-semibold">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-200"
                style={{ width: `${Math.max(4, progress)}%` }}
              />
            </div>
          </div>
        )}

        {stage === "permission_needed" && (
          <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--tint-sand)] p-3.5 text-[13px] text-[var(--text-primary)]">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
              <div className="space-y-2">
                <p>
                  Izinkan Senvamily memasang pembaruan aplikasi di pengaturan Android terlebih dahulu.
                </p>
                <Button size="sm" variant="secondary" onClick={() => void handleOpenSettings()}>
                  Buka Pengaturan Izin
                </Button>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="mt-3 rounded-xl bg-[var(--status-danger-bg)] px-3 py-2 text-[12.5px] text-[var(--status-danger-fg)]">
            {errorMsg}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!mandatory && onDismiss && (
            <Button
              type="button"
              variant="ghost"
              disabled={stage === "downloading" || stage === "installing"}
              onClick={onDismiss}
            >
              Nanti
            </Button>
          )}
          <Button
            type="button"
            isLoading={stage === "downloading" || stage === "installing"}
            onClick={() => void handleStartUpdate()}
          >
            {stage === "error" ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Update Sekarang
          </Button>
        </div>
      </div>
    </div>
  );
}
