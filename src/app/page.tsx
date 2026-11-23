import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  FileLock2,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/navigation";
import { LOCALE_COOKIE_NAME, normalizeLocale, translate } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  const HIGHLIGHTS = [
    {
      icon: Calendar,
      title: translate(locale, "landing.highlight.dailyTitle"),
      description: translate(locale, "landing.highlight.dailyDesc"),
      tint: "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]",
    },
    {
      icon: Wallet,
      title: translate(locale, "landing.highlight.householdTitle"),
      description: translate(locale, "landing.highlight.householdDesc"),
      tint: "bg-[var(--tint-sand)] text-[var(--text-primary)]",
    },
    {
      icon: ShieldCheck,
      title: translate(locale, "landing.highlight.careTitle"),
      description: translate(locale, "landing.highlight.careDesc"),
      tint: "bg-[var(--tint-lavender)] text-[var(--tint-lavender-fg)]",
    },
  ];
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect(routes.onboarding);
    }
  } catch {
    // Render landing page cleanly when Supabase env is unconfigured
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-8 sm:py-4">
          <Link href={routes.home} className="flex min-h-11 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]">
              <HeartHandshake className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <span className="font-heading text-[18px] font-bold">Famora</span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <ThemeToggle />
            <Link
              href={routes.login}
              className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-[13.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              {translate(locale, "landing.signIn")}
            </Link>
            <Link
              href={routes.signup}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--accent-primary-fg)] shadow-xs hover:opacity-95 sm:px-4"
            >
              {translate(locale, "landing.getStarted")}
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-[1160px] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--tint-sage)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--tint-sage-fg)]">
            <Sparkles className="h-3.5 w-3.5" />
            {translate(locale, "landing.badge")}
          </div>

          <h1 className="mt-6 font-heading text-[36px] font-bold leading-[1.12] tracking-tight sm:text-[48px]">
            {translate(locale, "landing.heroTitle")}
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-[var(--text-secondary)] sm:text-[17.5px]">
            {translate(locale, "landing.heroDesc")}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={routes.signup}
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-6 py-3 text-[15px] font-semibold text-[var(--accent-primary-fg)] shadow-[var(--shadow-card)] hover:opacity-95"
            >
              Create Family Workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={routes.login}
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-3 text-[15px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              Sign In to Workspace
            </Link>
          </div>
        </div>

        {/* Feature Pillars */}
        <section className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-card)]"
              >
                <div
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${item.tint}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-heading text-[18px] font-bold">
                  {item.title}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  {item.description}
                </p>
              </div>
            );
          })}
        </section>

        {/* Footer Links */}
        <footer className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-8 text-[13px] text-[var(--text-muted)] sm:flex-row">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <FileLock2 className="h-4 w-4" />
              Row-Level Security Enforced
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" />
              Realtime &amp; Offline PWA
            </span>
          </div>
          <Link
            href={routes.designSystem}
            className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            View Design System →
          </Link>
        </footer>
      </main>
    </div>
  );
}
