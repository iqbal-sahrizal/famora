"use client";

import * as React from "react";
import Link from "next/link";
import { HeartHandshake, ShieldCheck, Sparkles, Users } from "lucide-react";
import { ThemeToggle } from "@/components/ui/navigation";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t, locale, setLocale } = useLocale();
  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Left Visual Story Panel (Desktop) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--tint-sage)] p-12 text-[var(--tint-sage-fg)] lg:flex">
        <div className="flex items-center justify-between">
          <Link href={routes.home} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]">
              <HeartHandshake className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <span className="font-heading text-[19px] font-bold tracking-tight">
              Famora
            </span>
          </Link>
        </div>

        {/* Custom Warm Botanical & Home Illustration */}
        <div className="my-auto max-w-md space-y-8">
          <svg
            viewBox="0 0 360 220"
            className="w-full max-w-[340px]"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="16"
              y="24"
              width="210"
              height="156"
              rx="28"
              fill="var(--bg-surface)"
              fillOpacity="0.92"
            />
            <circle cx="72" cy="76" r="24" fill="#E9B98B" />
            <circle cx="104" cy="76" r="24" fill="#E9DDF5" />
            <circle cx="136" cy="76" r="24" fill="#F3D9D1" />
            <rect x="48" y="120" width="144" height="12" rx="6" fill="#315C49" fillOpacity="0.85" />
            <rect x="48" y="142" width="96" height="10" rx="5" fill="#315C49" fillOpacity="0.3" />
            <rect
              x="188"
              y="66"
              width="156"
              height="130"
              rx="24"
              fill="#315C49"
            />
            <circle cx="232" cy="108" r="14" fill="#DCE8D9" />
            <rect x="256" y="100" width="60" height="8" rx="4" fill="#F7F5EF" fillOpacity="0.85" />
            <rect x="256" y="114" width="42" height="6" rx="3" fill="#F7F5EF" fillOpacity="0.5" />
            <rect x="218" y="146" width="98" height="24" rx="12" fill="#DCE8D9" fillOpacity="0.22" />
          </svg>

          <div className="space-y-3">
            <h2 className="font-heading text-[30px] font-bold leading-[1.18]">
              {t("auth.shell.headline")}
            </h2>
            <p className="text-[15px] leading-relaxed opacity-85">
              {t("auth.shell.body")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 text-[12.5px] font-medium">
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--bg-surface)]/65 px-3.5 py-2.5">
              <Users className="h-4 w-4 shrink-0" />
              <span>{t("auth.shell.badgeMultiFamily")}</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--bg-surface)]/65 px-3.5 py-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>{t("auth.shell.badgeRls")}</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--bg-surface)]/65 px-3.5 py-2.5">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>{t("auth.shell.badgePwa")}</span>
            </div>
          </div>
        </div>

        <p className="text-[12.5px] opacity-75">
          {t("auth.shell.footerNote")}
        </p>
      </aside>

      {/* Right Form Panel */}
      <div className="flex min-h-dvh flex-col justify-between px-4 py-6 sm:px-12 sm:py-8">
        <div className="flex items-center justify-between gap-2">
          <Link href={routes.home} className="flex min-h-11 items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <span className="font-heading text-[17px] font-bold">Famora</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale(locale === "id" ? "en" : "id")}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label={t("settings.language.label")}
            >
              {locale === "id" ? "ID" : "EN"}
            </button>
            <ThemeToggle />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[420px] py-10">
          <div className="mb-8 space-y-2">
            <h1 className="font-heading text-[28px] font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-[14.5px] leading-relaxed text-[var(--text-secondary)]">
              {subtitle}
            </p>
          </div>
          {children}
          {footer && <div className="mt-8">{footer}</div>}
        </div>

        <div className="text-center text-[12px] text-[var(--text-muted)]">
          {t("auth.shell.platform")}
        </div>
      </div>
    </div>
  );
}
