"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  HeartHandshake,
  LayoutGrid,
  LogOut,
  Plus,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  DOMAIN_NAV_ITEMS,
  type NavItemConfig,
} from "@/config/navigation";
import { PwaStatusBar } from "@/components/pwa/pwa-status-bar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/ui/navigation";
import { logoutAction } from "@/features/auth/actions";
import type { WorkspaceShellContext } from "@/features/workspace/server";
import { useActiveFamilyId } from "@/hooks/use-active-family";
import { translateDomainLabel, translateNavGroup, type Locale } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import { useUiStore } from "@/stores/ui-store";

const GROUPS: NavItemConfig["group"][] = [
  "daily",
  "household",
  "family",
  "system",
];

export function AppShell({
  familyId,
  shellContext,
  syncMemberLocale,
  children,
}: {
  familyId: string;
  shellContext?: WorkspaceShellContext;
  syncMemberLocale?: Locale;
  children: React.ReactNode;
}) {
  useActiveFamilyId();
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale, t, te } = useLocale();
  const { sidebarCollapsed, toggleSidebar, setActiveFamilyId } = useUiStore();

  React.useEffect(() => {
    if (syncMemberLocale && syncMemberLocale !== locale) {
      setLocale(syncMemberLocale);
    }
  }, [syncMemberLocale, locale, setLocale]);

  const [switchingFamily, setSwitchingFamily] = React.useState(false);
  const [logoutOpen, setLogoutOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const families = React.useMemo(
    () => shellContext?.families ?? [],
    [shellContext?.families]
  );
  const currentFamily = families.find((f) => f.familyId === familyId);
  const familyLabel = currentFamily?.name ?? `Space: ${familyId.slice(0, 8)}`;
  const userName = shellContext?.userName ?? "Account";

  const mobilePrimaryItems = DOMAIN_NAV_ITEMS.filter((i) => i.mobilePrimary);

  const handleFamilySwitch = (nextValue: string) => {
    if (!nextValue || nextValue === familyId) return;
    if (nextValue === "__onboarding__") {
      router.push(routes.onboarding);
      return;
    }
    const allowed = families.some((f) => f.familyId === nextValue);
    if (!allowed) {
      toast.error(t("shell.noAccess"));
      return;
    }
    setSwitchingFamily(true);
    setActiveFamilyId(nextValue);
    router.push(routes.familyDashboard(nextValue));
  };

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    const res = await logoutAction();
    setLoggingOut(false);
    if (!res.ok) {
      toast.error(te(res.error, "shell.signOutError"));
      return;
    }
    setActiveFamilyId(null);
    setLogoutOpen(false);
    router.push(routes.login);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-[var(--accent-primary)] focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-[var(--accent-primary-fg)]"
      >
        Skip to content
      </a>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-all duration-200",
          sidebarCollapsed ? "lg:w-[80px]" : "lg:w-[264px]"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border-subtle)]">
          <Link
            href={routes.familyDashboard(familyId)}
            className="flex items-center gap-3 overflow-hidden"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]">
              <HeartHandshake className="h-5 w-5" strokeWidth={1.75} />
            </div>
            {!sidebarCollapsed && (
              <div className="truncate">
                <p className="font-heading text-[16px] font-bold leading-tight">
                  Famora
                </p>
                <p className="truncate text-[11.5px] text-[var(--text-muted)]">
                  {familyLabel}
                </p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Permission-Aware Family Switcher (Desktop) */}
        {!sidebarCollapsed && (
          <div className="border-b border-[var(--border-subtle)] px-3 py-2.5">
            <div className="relative flex items-center">
              <select
                aria-label={t("shell.switchFamilyAria")}
                disabled={switchingFamily}
                value={families.some((f) => f.familyId === familyId) ? familyId : ""}
                onChange={(e) => handleFamilySwitch(e.target.value)}
                className="w-full appearance-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] py-1.5 pl-3 pr-8 text-[12.5px] font-medium text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none cursor-pointer"
              >
                {families.length === 0 && (
                  <option value="">{familyLabel}</option>
                )}
                {families.map((fam) => (
                  <option key={fam.familyId} value={fam.familyId}>
                    {fam.name} ({fam.roleKey})
                  </option>
                ))}
                <option value="__onboarding__">{t("shell.createOrJoinFamily")}</option>
              </select>
              <ChevronsUpDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            </div>
          </div>
        )}

        <nav
          aria-label={t("shell.navAria")}
          className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
        >
          {GROUPS.map((group) => {
            const items = DOMAIN_NAV_ITEMS.filter((item) => item.group === group);
            return (
              <div key={group} className="space-y-1">
                {!sidebarCollapsed && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {translateNavGroup(group, locale)}
                  </p>
                )}
                {items.map((item) => {
                  const Icon = item.icon;
                  const href = routes.familyDomain(familyId, item.id);
                  const active = pathname === href;
                  const localizedLabel = translateDomainLabel(item.id, locale);
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      title={sidebarCollapsed ? localizedLabel : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
                        sidebarCollapsed && "justify-center px-0"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      {!sidebarCollapsed && <span>{localizedLabel}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Account & Logout Footer */}
        <div className="border-t border-[var(--border-subtle)] p-3 space-y-2">
          <div
            className={cn(
              "flex items-center gap-2",
              sidebarCollapsed ? "flex-col" : "justify-between"
            )}
          >
            <Link
              href={routes.account}
              title={sidebarCollapsed ? userName : undefined}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] truncate",
                sidebarCollapsed && "justify-center px-1.5"
              )}
            >
              <UserCircle className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{userName}</span>}
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                type="button"
                aria-label={t("shell.signOutAria")}
                title={t("shell.signOut")}
                onClick={() => setLogoutOpen(true)}
                className="rounded-xl p-1.5 text-[var(--text-secondary)] hover:bg-[var(--tint-peach)] hover:text-[var(--tint-peach-fg)] cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          {!sidebarCollapsed && (
            <Link
              href={routes.designSystem}
              className="block px-2 text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {t("shell.designSystem")}
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar (Mobile Family Switcher + Offline/Sync Status + Account) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/90 px-4 py-3 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href={routes.familyDashboard(familyId)}
              className="flex shrink-0 items-center gap-2 lg:hidden"
            >
              <HeartHandshake className="h-5 w-5 text-[var(--accent-primary)]" />
              <span className="font-heading text-[16px] font-bold">Famora</span>
            </Link>
            {families.length > 1 ? (
              <select
                aria-label={t("shell.switchFamilyMobileAria")}
                disabled={switchingFamily}
                value={familyId}
                onChange={(e) => handleFamilySwitch(e.target.value)}
                className="max-w-[150px] truncate rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] lg:hidden"
              >
                {families.map((fam) => (
                  <option key={fam.familyId} value={fam.familyId}>
                    {fam.name}
                  </option>
                ))}
                <option value="__onboarding__">{t("shell.newFamilyOption")}</option>
              </select>
            ) : (
              <span className="hidden rounded-full bg-[var(--bg-subtle)] px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)] sm:inline-flex">
                {familyLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <PwaStatusBar familyId={familyId} />
            <div className="flex items-center gap-1 lg:hidden">
              <Link
                href={routes.account}
                aria-label={t("shell.accountSettingsAria")}
                className="rounded-xl p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              >
                <UserCircle className="h-5 w-5" />
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-12">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label={t("shell.mobileNavAria")}
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-2 py-2 backdrop-blur-md lg:hidden"
      >
        {mobilePrimaryItems.map((item) => {
          const Icon = item.icon;
          const href = routes.familyDomain(familyId, item.id);
          const active = pathname === href;
          return (
            <Link
              key={item.id}
              href={href}
              className={cn(
                "flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-[var(--accent-primary)]"
                  : "text-[var(--text-secondary)]"
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.75} />
              <span>{translateDomainLabel(item.id, locale).split(" ")[0]}</span>
            </Link>
          );
        })}
        <Link
          href={routes.familyMore(familyId)}
          className={cn(
            "flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors",
            pathname === routes.familyMore(familyId)
              ? "text-[var(--accent-primary)]"
              : "text-[var(--text-secondary)]"
          )}
        >
          <LayoutGrid
            className="h-5 w-5"
            strokeWidth={pathname === routes.familyMore(familyId) ? 2 : 1.75}
          />
          <span>{t("nav.more")}</span>
        </Link>
      </nav>

      {/* Sign Out Confirmation Dialog */}
      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title={t("shell.signOutTitle")}
        description={t("shell.signOutDescription")}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLogoutOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={loggingOut}
              onClick={() => void handleConfirmLogout()}
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? t("shell.signingOut") : t("shell.signOut")}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-2 text-[13.5px] text-[var(--text-secondary)]">
          <Plus className="hidden h-4 w-4" />
          <span>{t("shell.signOutResumeNote")}</span>
        </div>
      </Dialog>
    </div>
  );
}
