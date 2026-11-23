"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  MapPin,
  Megaphone,
  Plus,
  ShoppingBag,
  Sparkles,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BudgetRing } from "@/components/ui/charts";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { formatLocalizedDate, toIntlLocale, type Locale } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import { readOfflineCache, writeOfflineCache } from "@/lib/pwa/indexeddb";
import { routes } from "@/lib/routes";
import { cn, formatCurrency } from "@/lib/utils";
import {
  quickAddShoppingItemAction,
  quickAddTaskAction,
  quickCompleteTaskAction,
  toggleShoppingItemAction,
} from "../actions";
import type { FamilyDashboardPayload } from "../server";

function formatEventTime(
  iso: string,
  timezone: string,
  allDay: boolean,
  locale: Locale
) {
  if (allDay) return locale === "id" ? "Seharian" : "All day";
  try {
    return new Intl.DateTimeFormat(toIntlLocale(locale), {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function FamilyDashboardView({
  familyId,
  data,
}: {
  familyId: string;
  data: FamilyDashboardPayload;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const isOnline = useOnlineStatus();
  const [cachedData, setCachedData] =
    React.useState<FamilyDashboardPayload | null>(null);
  const effectiveData =
    !isOnline && !data.family && cachedData ? cachedData : data;

  React.useEffect(() => {
    if (isOnline && data.family) {
      void writeOfflineCache(familyId, "dashboard", data);
    } else if (!isOnline) {
      void readOfflineCache<FamilyDashboardPayload>(familyId, "dashboard").then(
        (entry) => {
          if (entry?.data) setCachedData(entry.data);
        }
      );
    }
  }, [familyId, isOnline, data]);

  const [quickTaskOpen, setQuickTaskOpen] = React.useState(false);
  const [quickShopOpen, setQuickShopOpen] = React.useState(false);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [shopName, setShopName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [completingTaskId, setCompletingTaskId] = React.useState<string | null>(
    null
  );

  const timezone = effectiveData.family?.timezone ?? "UTC";
  const canManageTasks =
    effectiveData.permissions.includes("tasks.manage_all") ||
    effectiveData.currentRoleKey === "child" ||
    effectiveData.currentRoleKey === "teen";
  const canManageShopping = effectiveData.permissions.includes("shopping.manage");

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await quickAddTaskAction({ familyId, title: taskTitle });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setTaskTitle("");
    setQuickTaskOpen(false);
    toast.success(t("dashboard.toast.taskAdded"));
    router.refresh();
  };

  const handleAddShopping = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await quickAddShoppingItemAction({ familyId, name: shopName });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setShopName("");
    setQuickShopOpen(false);
    toast.success(t("dashboard.toast.itemAdded"));
    router.refresh();
  };

  const handleToggleShopping = async (itemId: string, current: boolean) => {
    const res = await toggleShoppingItemAction({
      familyId,
      itemId,
      isChecked: !current,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    router.refresh();
  };

  const handleCompleteTask = async (taskId: string) => {
    setCompletingTaskId(taskId);
    const res = await quickCompleteTaskAction({ familyId, taskId });
    setCompletingTaskId(null);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("dashboard.toast.taskCompleted"));
    router.refresh();
  };

  if (!effectiveData.family) {
    return (
      <ErrorState
        title={t("dashboard.errorTitle")}
        description={t("dashboard.errorDesc")}
        onRetry={() => router.refresh()}
      />
    );
  }

  const localizedGreeting =
    effectiveData.greeting === "Good morning"
      ? t("dashboard.greeting.morning")
      : effectiveData.greeting === "Good afternoon"
      ? t("dashboard.greeting.afternoon")
      : effectiveData.greeting === "Good evening"
      ? t("dashboard.greeting.evening")
      : effectiveData.greeting === "Welcome back"
      ? t("dashboard.greeting.welcome")
      : effectiveData.greeting;

  const formattedToday = formatLocalizedDate(
    new Date(),
    locale,
    { weekday: "long", month: "long", day: "numeric" },
    timezone
  );

  const OverviewStrip = (
    <section
      aria-label={t("dashboard.overview.title")}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3"
    >
      <Link
        href={routes.familyDomain(familyId, "calendar")}
        className="flex min-h-[76px] flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--bg-subtle)]"
      >
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="text-[12px] font-medium">{t("dashboard.overview.events")}</span>
          <CalendarDays className="h-4 w-4 text-[var(--accent-primary)]" />
        </div>
        <p className="font-heading text-[22px] font-bold tabular-nums">
          {effectiveData.todaysEvents.length}
        </p>
      </Link>

      <Link
        href={routes.familyDomain(familyId, "tasks")}
        className="flex min-h-[76px] flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--bg-subtle)]"
      >
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="text-[12px] font-medium">{t("dashboard.overview.tasks")}</span>
          <CheckSquare className="h-4 w-4 text-[var(--accent-primary)]" />
        </div>
        <p className="font-heading text-[22px] font-bold tabular-nums">
          {effectiveData.pendingTasks.length}
        </p>
      </Link>

      <Link
        href={routes.familyDomain(familyId, "shopping")}
        className="flex min-h-[76px] flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--bg-subtle)]"
      >
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="text-[12px] font-medium">{t("dashboard.overview.shopping")}</span>
          <ShoppingBag className="h-4 w-4 text-[var(--accent-primary)]" />
        </div>
        <p className="font-heading text-[22px] font-bold tabular-nums">
          {effectiveData.shoppingItems.length}
        </p>
      </Link>

      <Link
        href={routes.familyDomain(familyId, "family")}
        className="flex min-h-[76px] flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--bg-subtle)]"
      >
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="text-[12px] font-medium">{t("dashboard.overview.members")}</span>
          <Users className="h-4 w-4 text-[var(--accent-primary)]" />
        </div>
        <p className="font-heading text-[22px] font-bold tabular-nums">
          {effectiveData.members.length}
        </p>
      </Link>
    </section>
  );

  const TimelineSection = (
    <Card className="space-y-5 p-4 sm:p-6">
      <CardHeader className="mb-0 flex-wrap gap-2">
        <div className="min-w-0">
          <CardTitle className="text-[18px] sm:text-[19px]">
            {t("dashboard.todaysRhythm")}
          </CardTitle>
          <CardDescription>{formattedToday}</CardDescription>
        </div>
        <Link
          href={routes.familyDomain(familyId, "calendar")}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[13px] font-medium text-[var(--accent-primary)] hover:bg-[var(--bg-subtle)] sm:min-h-9"
        >
          <span>{t("dashboard.fullCalendar")}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </CardHeader>

      {effectiveData.todaysEvents.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title={t("dashboard.openDayTitle")}
          description={t("dashboard.openDayDesc")}
        />
      ) : (
        <div className="relative space-y-4 pl-6 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-[2px] before:bg-[var(--border-subtle)]">
          {effectiveData.todaysEvents.map((ev) => (
            <div key={ev.id} className="relative flex items-start justify-between gap-3">
              <span className="absolute -left-6 top-1.5 h-3 w-3 rounded-full bg-[var(--accent-primary)] ring-4 ring-[var(--bg-surface)]" />
              <div className="min-w-0 space-y-1">
                <p className="font-heading text-[15px] font-semibold text-[var(--text-primary)]">
                  {ev.title}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    {formatEventTime(ev.startAt, timezone, ev.allDay, locale)}
                  </span>
                  {ev.location && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {ev.location}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="sage" className="shrink-0">
                {ev.category}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {effectiveData.upcomingEvents.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-4">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t("dashboard.comingUpWeek")}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {effectiveData.upcomingEvents.slice(0, 4).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--bg-subtle)] px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{ev.title}</p>
                  <p className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                    {formatLocalizedDate(
                      ev.startAt,
                      locale,
                      { weekday: "short", month: "short", day: "numeric" },
                      timezone
                    )}
                  </p>
                </div>
                <Badge variant="neutral" className="shrink-0">
                  {ev.category}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );

  const AnnouncementsSection = (
    <Card variant="blush" className="space-y-4 p-4 sm:p-6">
      <CardHeader className="mb-0 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-5 w-5" />
          <CardTitle>{t("dashboard.announcementsTitle")}</CardTitle>
        </div>
        <Link
          href={routes.familyDomain(familyId, "noticeboard")}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-[12.5px] font-medium hover:bg-[var(--bg-surface)]/50 sm:min-h-9"
        >
          <span>{t("dashboard.viewNoticeboard")}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      {effectiveData.announcements.length === 0 ? (
        <p className="text-[13.5px] opacity-80">
          {t("dashboard.noAnnouncements")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {effectiveData.announcements.map((ann) => (
            <div
              key={ann.id}
              className="rounded-2xl bg-[var(--bg-surface)]/80 p-3.5 text-[var(--text-primary)] sm:p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-[14.5px] font-semibold">
                  {ann.title}
                </p>
                {ann.pinned && (
                  <Badge variant="peach" className="shrink-0">
                    {t("dashboard.pinnedBadge")}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {ann.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const TasksWidget = (
    <Card className="space-y-4 p-4 sm:p-6">
      <CardHeader className="mb-0 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="h-4 w-4 text-[var(--accent-primary)]" />
          <CardTitle>{t("dashboard.pendingTasksTitle")}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {canManageTasks && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuickTaskOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("common.add")}
            </Button>
          )}
          <Link
            href={routes.familyDomain(familyId, "tasks")}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-[12.5px] font-medium text-[var(--accent-primary)] hover:bg-[var(--bg-subtle)] sm:min-h-9"
          >
            <span>{t("dashboard.viewAllTasks")}</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>

      {effectiveData.pendingTasks.length === 0 ? (
        <p className="text-[13.5px] text-[var(--text-secondary)]">
          {t("dashboard.noPendingTasks")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {effectiveData.pendingTasks.slice(0, 5).map((task) => {
            const canComplete =
              canManageTasks || Boolean(task.isAssignedToMe);
            return (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2.5 rounded-2xl bg-[var(--bg-subtle)] px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {canComplete && (
                    <button
                      type="button"
                      disabled={completingTaskId === task.id}
                      onClick={() => void handleCompleteTask(task.id)}
                      aria-label={t("dashboard.completeTaskAria", {
                        title: task.title,
                      })}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer sm:h-9 sm:w-9"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)]" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">
                      {task.title}
                    </p>
                    <p className="truncate text-[11.5px] text-[var(--text-secondary)]">
                      {task.isAssignedToMe
                        ? t("dashboard.assignedToMe")
                        : task.assigneeName
                        ? t("dashboard.assignedTo", { name: task.assigneeName })
                        : t("dashboard.unassigned")}
                      {task.dueAt
                        ? ` · ${formatLocalizedDate(
                            task.dueAt,
                            locale,
                            { month: "short", day: "numeric" },
                            timezone
                          )}`
                        : ""}
                      {task.pointsValue > 0
                        ? ` · ${t("chores.ptsSuffix", { pts: task.pointsValue })}`
                        : ""}
                    </p>
                  </div>
                </div>
                <Badge
                  className="shrink-0"
                  variant={
                    task.priority === "high"
                      ? "danger"
                      : task.status === "pending_approval"
                      ? "peach"
                      : "neutral"
                  }
                >
                  {task.status === "pending_approval"
                    ? t("dashboard.reviewBadge")
                    : t(`tasks.prioLabel.${task.priority}` as "tasks.prioLabel.normal")}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );

  const ShoppingWidget = (
    <Card className="space-y-4 p-4 sm:p-6">
      <CardHeader className="mb-0 flex-wrap gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-4 w-4 text-[var(--accent-primary)]" />
            <CardTitle>{t("dashboard.shoppingRemindersTitle")}</CardTitle>
          </div>
          {effectiveData.shoppingItems.length > 0 && (
            <CardDescription className="mt-0.5">
              {t("dashboard.pendingItemsCount", {
                count: effectiveData.shoppingItems.length,
              })}
            </CardDescription>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canManageShopping && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuickShopOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("common.add")}
            </Button>
          )}
          <Link
            href={routes.familyDomain(familyId, "shopping")}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-[12.5px] font-medium text-[var(--accent-primary)] hover:bg-[var(--bg-subtle)] sm:min-h-9"
          >
            <span>{t("dashboard.viewAllShopping")}</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>

      {effectiveData.shoppingItems.length === 0 ? (
        <p className="text-[13.5px] text-[var(--text-secondary)]">
          {t("dashboard.shoppingClear")}
        </p>
      ) : (
        <div className="space-y-2">
          {effectiveData.shoppingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!canManageShopping}
              onClick={() => handleToggleShopping(item.id, item.isChecked)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl bg-[var(--bg-subtle)] px-3.5 py-2.5 text-left transition-colors",
                canManageShopping && "hover:bg-[var(--bg-hover)] cursor-pointer"
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)]">
                  {item.isChecked && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate text-[13.5px] font-medium">
                  {item.name}
                </span>
              </div>
              <Badge variant="neutral" className="shrink-0">
                {item.category}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </Card>
  );

  const FinanceWidget = effectiveData.financeSummary ? (
    <Card variant="sage" className="space-y-4 p-4 sm:p-6">
      <CardHeader className="mb-0 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <Wallet className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <CardTitle>{t("dashboard.financialOverviewTitle")}</CardTitle>
            <CardDescription className="text-[var(--tint-sage-fg)]">
              {t("dashboard.financialOverviewDesc")}
            </CardDescription>
          </div>
        </div>
        <Link
          href={routes.familyDomain(familyId, "finance")}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-[12.5px] font-medium hover:bg-[var(--bg-surface)]/50 sm:min-h-9"
        >
          <span>{t("dashboard.viewFinance")}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </CardHeader>

      <div className="rounded-2xl bg-[var(--bg-surface)]/85 p-4 text-[var(--text-primary)]">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[12.5px] text-[var(--text-secondary)]">
            {t("dashboard.combinedBalance")}
          </span>
          <span className="font-heading text-[22px] font-bold tabular-nums">
            {formatCurrency(
              effectiveData.financeSummary.totalBalanceCents,
              effectiveData.financeSummary.currencyCode
            )}
          </span>
        </div>
        {effectiveData.financeSummary.monthlyBudgetCents > 0 && (
          <BudgetRing
            spentCents={effectiveData.financeSummary.monthlySpentCents}
            budgetCents={effectiveData.financeSummary.monthlyBudgetCents}
            label={t("dashboard.monthlyBudget")}
          />
        )}
      </div>
    </Card>
  ) : null;

  const RecentActivityWidget =
    effectiveData.recentActivity.length > 0 ? (
      <Card className="space-y-3 p-4 sm:p-6">
        <CardHeader className="mb-0">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--accent-primary)]" />
            <CardTitle className="text-[16px]">
              {t("dashboard.recentActivityTitle")}
            </CardTitle>
          </div>
        </CardHeader>
        <div className="divide-y divide-[var(--border-subtle)]">
          {effectiveData.recentActivity.map((act) => (
            <div
              key={act.id}
              className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
            >
              <span className="min-w-0 truncate font-medium">{act.action}</span>
              <span className="shrink-0 text-[12px] text-[var(--text-muted)] tabular-nums">
                {formatLocalizedDate(act.createdAt, locale)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    ) : null;

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* A. Welcome Header */}
      <section className="flex flex-col justify-between gap-5 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)] sm:rounded-[28px] sm:p-6 lg:flex-row lg:items-center lg:p-8">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="forest">
                {effectiveData.family.name ?? t("dashboard.defaultFamilySpace")}
              </Badge>
              {effectiveData.currentRoleKey && (
                <Badge variant="lavender">
                  {t(`role.${effectiveData.currentRoleKey}` as "role.owner")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={routes.familyDomain(familyId, "notifications")}
                aria-label={t("dashboard.notificationsAria")}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              >
                <Bell className="h-5 w-5" />
              </Link>
              <Link
                href={routes.account}
                aria-label={t("dashboard.profileAria")}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] lg:hidden"
              >
                <UserCircle className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <p className="text-[12.5px] font-medium text-[var(--text-muted)]">
            {formattedToday}
          </p>
          <h1 className="font-heading text-[24px] font-bold tracking-tight sm:text-[32px]">
            {localizedGreeting}, {effectiveData.userName}
          </h1>
          <p className="max-w-xl text-[14px] text-[var(--text-secondary)] sm:text-[14.5px]">
            {effectiveData.family.description || t("dashboard.defaultSubtitle")}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3.5 lg:items-end">
          {effectiveData.members.length > 0 && (
            <div className="flex items-center gap-3">
              <AvatarStack
                size="md"
                members={effectiveData.members.slice(0, 5).map((m) => ({
                  name: m.displayName,
                  tone: m.isManagedChild ? "peach" : "sage",
                }))}
              />
              <Link
                href={routes.familyDomain(familyId, "family")}
                className="inline-flex min-h-11 items-center text-[13px] font-medium text-[var(--accent-primary)] hover:underline sm:min-h-0"
              >
                {t("dashboard.membersCount", {
                  count: effectiveData.members.length,
                })}
              </Link>
            </div>
          )}

          {/* H. Quick Actions (existing supported actions only) */}
          <div className="flex flex-wrap gap-2">
            {canManageTasks && (
              <Button size="sm" onClick={() => setQuickTaskOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("dashboard.quickTaskBtn")}
              </Button>
            )}
            {canManageShopping && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setQuickShopOpen(true)}
              >
                <ShoppingBag className="h-4 w-4" />
                {t("dashboard.addGroceryBtn")}
              </Button>
            )}
            <Link href={routes.familyDomain(familyId, "family")}>
              <Button variant="ghost" size="sm">
                <Users className="h-4 w-4" />
                {t("dashboard.directoryBtn")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* B. Family Overview Summary */}
      {OverviewStrip}

      {/* Mobile Single-Column Hierarchy (< 1024px) */}
      <div className="space-y-5 lg:hidden">
        {TimelineSection}
        {TasksWidget}
        {FinanceWidget}
        {ShoppingWidget}
        {AnnouncementsSection}
        {RecentActivityWidget}
      </div>

      {/* Desktop Editorial Split Layout (>= 1024px) */}
      <div className="hidden lg:grid lg:grid-cols-[1.55fr_1fr] lg:items-start lg:gap-8">
        <div className="space-y-8">
          {TimelineSection}
          {AnnouncementsSection}
          {RecentActivityWidget}
        </div>

        <div className="space-y-6">
          {FinanceWidget}
          {TasksWidget}
          {ShoppingWidget}
        </div>
      </div>

      {/* Quick Add Task Bottom Sheet */}
      <BottomSheet
        open={quickTaskOpen}
        onClose={() => setQuickTaskOpen(false)}
        title={t("dashboard.quickAddTaskTitle")}
      >
        <form onSubmit={handleAddTask} className="space-y-4">
          <Input
            label={t("dashboard.whatNeedsDone")}
            placeholder={t("dashboard.taskPlaceholder")}
            required
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <Button type="submit" className="w-full" isLoading={busy}>
            <Sparkles className="h-4 w-4" />
            {t("dashboard.saveTaskBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Quick Add Shopping Bottom Sheet */}
      <BottomSheet
        open={quickShopOpen}
        onClose={() => setQuickShopOpen(false)}
        title={t("dashboard.addToShoppingTitle")}
      >
        <form onSubmit={handleAddShopping} className="space-y-4">
          <Input
            label={t("dashboard.itemNameLabel")}
            placeholder={t("dashboard.itemPlaceholder")}
            required
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("dashboard.addToListBtn")}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}
