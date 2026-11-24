"use client";

import { Clock, WifiOff } from "lucide-react";
import { useLocale } from "@/providers/locale-provider";

export function OfflineCacheBanner({
  isFromCache,
  isCacheExpired,
  cachedAt,
}: {
  isFromCache: boolean;
  isCacheExpired: boolean;
  cachedAt: string | null;
}) {
  const { locale } = useLocale();
  if (!isFromCache) return null;

  const formattedTime = cachedAt
    ? new Date(cachedAt).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const text =
    locale === "id"
      ? isCacheExpired
        ? `Menampilkan data cache lama (${formattedTime}). Hubungkan ke internet untuk menyegarkan.`
        : `Menampilkan data tersimpan offline (${formattedTime}).`
      : isCacheExpired
      ? `Showing expired cached data (${formattedTime}). Reconnect to refresh.`
      : `Showing offline cached data (${formattedTime}).`;

  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-secondary)]"
    >
      {isCacheExpired ? (
        <Clock className="h-4 w-4 shrink-0 text-[var(--accent-warning)]" />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      )}
      <span>{text}</span>
    </div>
  );
}
