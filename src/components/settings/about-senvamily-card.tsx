"use client";

import * as React from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Bell, CheckCircle2, Info, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { registerFcmTokenWithBackend } from "@/components/notifications/push-initializer";
import { AppUpdateModal } from "@/components/updates/app-update-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getInstalledAndroidVersion,
  isNativeAndroidUpdaterAvailable,
} from "@/lib/app-update/native-updater";
import {
  androidReleaseManifestSchema,
  evaluateAndroidUpdate,
} from "@/lib/app-update/policy";
import type { AndroidReleaseManifest, UpdateStatus } from "@/lib/app-update/types";
import { routes } from "@/lib/routes";

export function AboutAndNotificationsCards({ familyId }: { familyId: string }) {
  const [installedVersion, setInstalledVersion] = React.useState<{
    versionCode: number;
    versionName: string;
  }>({ versionCode: 1, versionName: "1.0.0" });
  const [isNative, setIsNative] = React.useState(false);
  const [permStatus, setPermStatus] = React.useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");
  const [checkingUpdate, setCheckingUpdate] = React.useState(false);
  const [manifest, setManifest] = React.useState<AndroidReleaseManifest | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  React.useEffect(() => {
    const native = isNativeAndroidUpdaterAvailable();
    setIsNative(native);

    const loadStatus = async () => {
      if (native) {
        const ver = await getInstalledAndroidVersion();
        if (ver) setInstalledVersion(ver);
        try {
          const perm = await PushNotifications.checkPermissions();
          if (perm.receive === "granted") setPermStatus("granted");
          else if (perm.receive === "denied") setPermStatus("denied");
          else setPermStatus("prompt");
        } catch {
          setPermStatus("unsupported");
        }
      } else if (typeof window !== "undefined" && "Notification" in window) {
        const p = Notification.permission;
        setPermStatus(p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt");
      } else {
        setPermStatus("unsupported");
      }
    };

    void loadStatus();
  }, []);

  const handleEnableNotifications = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const ver = await getInstalledAndroidVersion();
        if (ver?.fcmConfigured !== true) {
          toast.error("APK ini belum dilengkapi konfigurasi Firebase. Install APK terbaru.");
          return;
        }
        const req = await PushNotifications.requestPermissions();
        if (req.receive === "granted") {
          setPermStatus("granted");
          await PushNotifications.addListener("registration", (t) => {
            void registerFcmTokenWithBackend(t.value);
          });
          await PushNotifications.register();
          toast.success("Notifikasi push Android aktif.");
        } else {
          setPermStatus("denied");
          toast.error("Izin notifikasi ditolak. Aktifkan di Pengaturan Android.");
        }
        return;
      }

      if (typeof window !== "undefined" && "Notification" in window) {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          setPermStatus("granted");
          toast.success("Izin notifikasi browser diberikan.");
        } else {
          setPermStatus("denied");
          toast.error("Izin notifikasi ditolak oleh browser.");
        }
      }
    } catch {
      toast.error("Gagal mengaktifkan izin notifikasi.");
    }
  };

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch("/api/app-update/android", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Gagal memeriksa pembaruan aplikasi.");
        return;
      }
      const json = await res.json();
      const parsed = androidReleaseManifestSchema.safeParse(json);
      if (!parsed.success) {
        toast.error("Format manifest pembaruan tidak valid.");
        return;
      }
      setManifest(parsed.data);
      const evaluation = evaluateAndroidUpdate(parsed.data, installedVersion.versionCode);
      setUpdateStatus(evaluation.status);

      if (evaluation.status === "optional" || evaluation.status === "mandatory") {
        setModalOpen(true);
      } else if (evaluation.status === "up_to_date") {
        toast.success("Aplikasi Senvamily sudah versi terbaru.");
      } else {
        toast.info("Belum ada rilis APK baru yang tersedia.");
      }
    } catch {
      toast.error("Gagal terhubung ke server pembaruan.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <Bell className="h-5 w-5 text-[var(--accent-primary)]" />
            <div>
              <CardTitle>Notifikasi Push</CardTitle>
              <CardDescription>
                Kelola izin notifikasi perangkat dan preferensi kategori keluarga.
              </CardDescription>
            </div>
          </div>
          <Badge variant={permStatus === "granted" ? "sage" : "neutral"}>
            {permStatus === "granted"
              ? "Aktif"
              : permStatus === "denied"
                ? "Ditolak"
                : permStatus === "unsupported"
                  ? "Tidak Didukung"
                  : "Belum Aktif"}
          </Badge>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-2.5">
          {permStatus !== "granted" && permStatus !== "unsupported" && (
            <Button type="button" size="sm" onClick={() => void handleEnableNotifications()}>
              <Bell className="h-4 w-4" />
              Aktifkan Notifikasi
            </Button>
          )}
          <Link href={routes.familyDomain(familyId, "notifications")}>
            <Button type="button" size="sm" variant="secondary">
              Preferensi Kategori &amp; Riwayat
            </Button>
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <Info className="h-5 w-5 text-[var(--accent-primary)]" />
            <div>
              <CardTitle>Tentang Senvamily</CardTitle>
              <CardDescription>
                Informasi versi aplikasi dan pembaruan APK Android.
              </CardDescription>
            </div>
          </div>
          <Badge variant="neutral">
            <Smartphone className="mr-1 h-3.5 w-3.5" />
            {isNative ? "Android App" : "Web / PWA"}
          </Badge>
        </CardHeader>

        <div className="space-y-2 rounded-2xl bg-[var(--bg-subtle)] p-3.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Versi terpasang</span>
            <span className="font-medium text-[var(--text-primary)]">
              v{installedVersion.versionName} (code {installedVersion.versionCode})
            </span>
          </div>
          {manifest && (
            <>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Versi terbaru</span>
                <span className="font-semibold text-[var(--accent-primary)]">
                  {manifest.enabled
                    ? `v${manifest.latestVersion} (code ${manifest.versionCode})`
                    : "Belum ada rilis"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Status pembaruan</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {updateStatus === "up_to_date"
                    ? "Sudah terbaru"
                    : updateStatus === "mandatory"
                      ? "Wajib diperbarui"
                      : updateStatus === "optional"
                        ? "Tersedia pembaruan"
                        : "Tidak aktif"}
                </span>
              </div>
            </>
          )}
        </div>

        {manifest?.enabled && manifest.releaseNotes.length > 0 && (
          <ul className="mt-3 space-y-1 text-[13px] text-[var(--text-secondary)]">
            {manifest.releaseNotes.map((note, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={checkingUpdate}
            onClick={() => void handleCheckForUpdates()}
          >
            <RefreshCw className="h-4 w-4" />
            Check for Updates
          </Button>
          {manifest && (updateStatus === "optional" || updateStatus === "mandatory") && isNative && (
            <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
              Update Sekarang
            </Button>
          )}
        </div>
      </Card>

      {manifest && (
        <AppUpdateModal
          open={modalOpen}
          mandatory={updateStatus === "mandatory"}
          installedVersionName={installedVersion.versionName}
          installedVersionCode={installedVersion.versionCode}
          manifest={manifest}
          onDismiss={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
