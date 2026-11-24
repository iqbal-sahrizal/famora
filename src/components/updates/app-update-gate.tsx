"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AppUpdateModal } from "./app-update-modal";
import {
  getInstalledAndroidVersion,
  isNativeAndroidUpdaterAvailable,
} from "@/lib/app-update/native-updater";
import { androidReleaseManifestSchema, evaluateAndroidUpdate } from "@/lib/app-update/policy";
import type { AndroidReleaseManifest } from "@/lib/app-update/types";

const DISMISSED_VERSION_KEY = "senvamily:dismissed-apk-version-code";

export function AppUpdateGate() {
  const searchParams = useSearchParams();
  const forceOpenFromNotification = searchParams.get("update") === "1";

  const [state, setState] = React.useState<{
    open: boolean;
    mandatory: boolean;
    installedVersionName: string;
    installedVersionCode: number;
    manifest: AndroidReleaseManifest | null;
  }>({
    open: false,
    mandatory: false,
    installedVersionName: "1.0.0",
    installedVersionCode: 1,
    manifest: null,
  });

  const checkForUpdate = React.useCallback(async (forceShowOptional: boolean) => {
    if (!isNativeAndroidUpdaterAvailable()) return;
    try {
      const installed = await getInstalledAndroidVersion();
      if (!installed) return;

      const res = await fetch("/api/app-update/android", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const parsed = androidReleaseManifestSchema.safeParse(json);
      if (!parsed.success) return;

      const evaluation = evaluateAndroidUpdate(parsed.data, installed.versionCode);
      if (evaluation.status === "disabled" || evaluation.status === "up_to_date") {
        return;
      }

      if (evaluation.status === "optional" && !forceShowOptional) {
        try {
          const dismissedCode = Number(window.localStorage.getItem(DISMISSED_VERSION_KEY) ?? "0");
          if (dismissedCode >= parsed.data.versionCode) {
            return;
          }
        } catch {
          // ignore storage errors
        }
      }

      setState({
        open: true,
        mandatory: evaluation.status === "mandatory",
        installedVersionName: installed.versionName,
        installedVersionCode: installed.versionCode,
        manifest: parsed.data,
      });
    } catch {
      // Never block normal startup if network check fails
    }
  }, []);

  React.useEffect(() => {
    void checkForUpdate(forceOpenFromNotification);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate, forceOpenFromNotification]);

  if (!state.manifest) return null;

  return (
    <AppUpdateModal
      open={state.open}
      mandatory={state.mandatory}
      installedVersionName={state.installedVersionName}
      installedVersionCode={state.installedVersionCode}
      manifest={state.manifest}
      onDismiss={() => {
        if (state.mandatory) return;
        try {
          window.localStorage.setItem(
            DISMISSED_VERSION_KEY,
            String(state.manifest?.versionCode ?? 0)
          );
        } catch {
          // ignore
        }
        setState((prev) => ({ ...prev, open: false }));
      }}
    />
  );
}
