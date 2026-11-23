"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  MapPin,
  Megaphone,
  Plus,
  ShoppingBag,
  Sparkles,
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
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { formatLocalizedDate, toIntlLocale, type Locale } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import { readOfflineCache, writeOfflineCache } from "@/lib/pwa/indexeddb";
import { routes } from "@/lib/routes";
import { cn, formatCurrency } from "@/lib/utils";
import {
  quickAddShoppingItemAction,
  quickAddTaskAction,
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

  const [mobileTab, setMobileTab] = React.useState("today");
  const [quickTaskOpen, setQuickTaskOpen] = React.useState(false);
  const [quickShopOpen, setQuickShopOpen] = React.useState(false);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [shopName, setShopName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const timezone = effectiveData.family?.timezone ?? "UTC";
  const canManageTasks =
    data.permissions.includes("tasks.manage_all") ||
    data.currentRoleKey === "child" ||
    data.currentRoleKey === "teen";
  const canManageShopping = data.permissions.includes("shopping.manage");

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

  const localizedGreeting =
    data.greeting === "Good morning"
      ? t("dashboard.greeting.morning")
      : data.greeting === "Good afternoon"
      ? t("dashboard.greeting.afternoon")
      : data.greeting === "Good evening"
      ? t("dashboard.greeting.evening")
      : data.greeting === "Welcome back"
      ? t("dashboard.greeting.welcome")
      : data.greeting;

  const TimelineSection = (
    <Card className="space-y-6">
      <CardHeader className="mb-0">
        <div>
          <CardTitle className="text-[19px]">{t("dashboard.todaysRhythm")}</CardTitle>
          <CardDescription>
            {formatLocalizedDate(
              new Date(),
              locale,
              { weekday: "long", month: "long", day: "numeric" },
              timezone
            )}
          </CardDescription>
        </div>
        <Link href={routes.familyDomain(familyId, "calendar")}>
          <Button variant="ghost" size="sm">
            {t("dashboard.fullCalendar")}
          </Button>
        </Link>
      </CardHeader>

      {data.todaysEvents.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title={t("dashboard.openDayTitle")}
          description={t("dashboard.openDayDesc")}
        />
      ) : (
        <div className="relative space-y-5 pl-6 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-[2px] before:bg-[var(--border-subtle)]">
          {data.todaysEvents.map((ev) => (
            <div key={ev.id} className="relative flex items-start justify-between gap-4">
              <span className="absolute -left-6 top-1.5 h-3 w-3 rounded-full bg-[var(--accent-primary)] ring-4 ring-[var(--bg-surface)]" />
              <div className="space-y-1">
                <p className="font-heading text-[15px] font-semibold text-[var(--text-primary)]">
                  {ev.title}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    {formatEventTime(ev.startAt, timezone, ev.allDay, locale)}
                  </span>
                  {ev.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {ev.location}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="sage">{ev.category}</Badge>
            </div>
          ))}
        </div>
      )}

      {data.upcomingEvents.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-4">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t("dashboard.comingUpWeek")}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {data.upcomingEvents.slice(0, 4).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between rounded-2xl bg-[var(--bg-subtle)] px-4 py-3"
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
                <Badge variant="neutral">{ev.category}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );

  const AnnouncementsSection = (
    <Card variant="blush" className="space-y-4">
      <CardHeader className="mb-0">
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-5 w-5" />
          <CardTitle>{t("dashboard.announcementsTitle")}</CardTitle>
        </div>
      </CardHeader>
      {data.announcements.length === 0 ? (
        <p className="text-[13.5px] opacity-80">
          {t("dashboard.noAnnouncements")}
        </p>
      ) : (
        <div className="space-y-3">
          {data.announcements.map((ann) => (
            <div
              key={ann.id}
              className="rounded-2xl bg-[var(--bg-surface)]/80 p-4 text-[var(--text-primary)]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-[14.5px] font-semibold">
                  {ann.title}
                </p>
                {ann.pinned && <Badge variant="peach">{t("dashboard.pinnedBadge")}</Badge>}
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
    <Card className="space-y-4">
      <CardHeader className="mb-0">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="h-4 w-4 text-[var(--accent-primary)]" />
          <CardTitle>{t("dashboard.pendingTasksTitle")}</CardTitle>
        </div>
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
      </CardHeader>

      {data.pendingTasks.length === 0 ? (
        <p className="text-[13.5px] text-[var(--text-secondary)]">
          {t("dashboard.noPendingTasks")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {data.pendingTasks.slice(0, 5).map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--bg-subtle)] px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium">
                  {task.title}
                </p>
                <p className="text-[11.5px] text-[var(--text-secondary)]">
                  {task.assigneeName
                    ? t("dashboard.assignedTo", { name: task.assigneeName })
                    : t("dashboard.unassigned")}
                  {task.pointsValue > 0 ? ` · ${t("chores.ptsSuffix", { pts: task.pointsValue })}` : ""}
                </p>
              </div>
              <Badge
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
          ))}
        </div>
      )}
    </Card>
  );

  const ShoppingWidget = (
    <Card className="space-y-4">
      <CardHeader className="mb-0">
        <div className="flex items-center gap-2.5">
          <ShoppingBag className="h-4 w-4 text-[var(--accent-primary)]" />
          <CardTitle>{t("dashboard.shoppingRemindersTitle")}</CardTitle>
        </div>
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
      </CardHeader>

      {data.shoppingItems.length === 0 ? (
        <p className="text-[13.5px] text-[var(--text-secondary)]">
          {t("dashboard.shoppingClear")}
        </p>
      ) : (
        <div className="space-y-2">
          {data.shoppingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!canManageShopping}
              onClick={() => handleToggleShopping(item.id, item.isChecked)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl bg-[var(--bg-subtle)] px-3.5 py-2.5 text-left transition-colors",
                canManageShopping && "hover:bg-[var(--bg-hover)] cursor-pointer"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)]">
                  {item.isChecked && <Check className="h-3 w-3" />}
                </span>
                <span className="text-[13.5px] font-medium">{item.name}</span>
              </div>
              <Badge variant="neutral">{item.category}</Badge>
            </button>
          ))}
        </div>
      )}
    </Card>
  );

  const FinanceWidget = data.financeSummary ? (
    <Card variant="sage" className="space-y-4">
      <CardHeader className="mb-0">
        <div className="flex items-center gap-2.5">
          <Wallet className="h-5 w-5" />
          <div>
            <CardTitle>{t("dashboard.financialOverviewTitle")}</CardTitle>
            <CardDescription className="text-[var(--tint-sage-fg)]">
              {t("dashboard.financialOverviewDesc")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="rounded-2xl bg-[var(--bg-surface)]/85 p-4 text-[var(--text-primary)]">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[12.5px] text-[var(--text-secondary)]">
            {t("dashboard.combinedBalance")}
          </span>
          <span className="font-heading text-[22px] font-bold tabular-nums">
            {formatCurrency(
              data.financeSummary.totalBalanceCents,
              data.financeSummary.currencyCode
            )}
          </span>
        </div>
        {data.financeSummary.monthlyBudgetCents > 0 && (
          <BudgetRing
            spentCents={data.financeSummary.monthlySpentCents}
            budgetCents={data.financeSummary.monthlyBudgetCents}
            label={t("dashboard.monthlyBudget")}
          />
        )}
      </div>
    </Card>
  ) : null;

  return (
    <div className="space-y-8">
      {/* Editorial Hero Greeting */}
      <section className="flex flex-col justify-between gap-6 rounded-[28px] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-soft)] border border-[var(--border-subtle)] sm:p-8 lg:flex-row lg:items-center">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="forest">
              {data.family?.name ?? t("dashboard.defaultFamilySpace")}
            </Badge>
            {data.currentRoleKey && (
              <Badge variant="lavender">
                {t(`role.${data.currentRoleKey}` as "role.owner")}
              </Badge>
            )}
          </div>
          <h1 className="font-heading text-[28px] font-bold tracking-tight sm:text-[34px]">
            {localizedGreeting}, {data.userName}
          </h1>
          <p className="max-w-xl text-[14.5px] text-[var(--text-secondary)]">
            {data.family?.description || t("dashboard.defaultSubtitle")}
          </p>
        </div>

        <div className="flex flex-col items-start gap-4 lg:items-end">
          {data.members.length > 0 && (
            <div className="flex items-center gap-3">
              <AvatarStack
                size="md"
                members={data.members.slice(0, 5).map((m) => ({
                  name: m.displayName,
                  tone: m.isManagedChild ? "peach" : "sage",
                }))}
              />
              <Link
                href={routes.familyDomain(familyId, "family")}
                className="text-[12.5px] font-medium text-[var(--accent-primary)] hover:underline"
              >
                {t("dashboard.membersCount", { count: data.members.length })}
              </Link>
            </div>
          )}

          {/* Contextual Quick Actions */}
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

      {/* Mobile Experience (< 1024px) */}
      <div className="space-y-6 lg:hidden">
        <Tabs
          activeId={mobileTab}
          onChange={setMobileTab}
          className="w-full justify-between"
          tabs={[
            { id: "today", label: t("dashboard.tab.today"), badge: data.todaysEvents.length },
            { id: "tasks", label: t("dashboard.tab.tasks"), badge: data.pendingTasks.length },
            { id: "shop", label: t("dashboard.tab.shop"), badge: data.shoppingItems.length },
          ]}
        />
        {mobileTab === "today" && TimelineSection}
        {mobileTab === "tasks" && TasksWidget}
        {mobileTab === "shop" && ShoppingWidget}
        {AnnouncementsSection}
        {FinanceWidget}
      </div>

      {/* Desktop Editorial Split Layout (>= 1024px) */}
      <div className="hidden lg:grid lg:grid-cols-[1.55fr_1fr] lg:items-start lg:gap-8">
        <div className="space-y-8">
          {TimelineSection}
          {AnnouncementsSection}

          {data.recentActivity.length > 0 && (
            <Card className="space-y-3">
              <CardHeader className="mb-0">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--accent-primary)]" />
                  <CardTitle className="text-[16px]">
                    {t("dashboard.recentActivityTitle")}
                  </CardTitle>
                </div>
              </CardHeader>
              <div className="divide-y divide-[var(--border-subtle)]">
                {data.recentActivity.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between py-2.5 text-[13px]"
                  >
                    <span className="font-medium">{act.action}</span>
                    <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                      {formatLocalizedDate(act.createdAt, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {FinanceWidget}
          {TasksWidget}
          {ShoppingWidget}
        </div>
      </div>

      {/* Quick Add Task Bottom Sheet / Modal */}
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

      {/* Quick Add Shopping Bottom Sheet / Modal */}
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
