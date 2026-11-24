"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  Clock,
  Dumbbell,
  Flame,
  Moon,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  archiveHabitAction,
  createHabitAction,
  logHabitCompletionAction,
  updateHabitAction,
} from "../actions";
import type {
  HabitCadence,
  HabitCategory,
  HabitItem,
  HabitScope,
  HabitsPageData,
  HabitUnit,
} from "../types";

const CATEGORY_META: Record<
  HabitCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  reading: { label: "Reading", icon: BookOpen },
  exercise: { label: "Exercise", icon: Dumbbell },
  sleep: { label: "Sleep", icon: Moon },
  mindfulness: { label: "Mindfulness", icon: Sparkles },
  learning: { label: "Learning", icon: Target },
  routine: { label: "Daily Routine", icon: Clock },
  other: { label: "Personal Goal", icon: Flame },
};

export function FamilyHabitsView({
  familyId,
  data,
}: {
  familyId: string;
  data: HabitsPageData;
}) {
  const router = useRouter();
  const { t, te } = useLocale();
  const [filterScope, setFilterScope] = React.useState<"all" | HabitScope>("all");
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scope, setScope] = React.useState<HabitScope>("personal");
  const [category, setCategory] = React.useState<HabitCategory>("reading");
  const [cadence, setCadence] = React.useState<HabitCadence>("daily");
  const [targetPerPeriod, setTargetPerPeriod] = React.useState("1");
  const [targetUnit, setTargetUnit] = React.useState<HabitUnit>("times");
  const [reminderTime, setReminderTime] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [editHabit, setEditHabit] = React.useState<HabitItem | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editCategory, setEditCategory] = React.useState<HabitCategory>("reading");
  const [editCadence, setEditCadence] = React.useState<HabitCadence>("daily");
  const [editTargetPerPeriod, setEditTargetPerPeriod] = React.useState("1");
  const [editTargetUnit, setEditTargetUnit] = React.useState<HabitUnit>("times");
  const [editReminderTime, setEditReminderTime] = React.useState("");
  const [savingEdit, setSavingEdit] = React.useState(false);

  const filtered = React.useMemo(
    () =>
      data.habits.filter(
        (h) => filterScope === "all" || h.scope === filterScope
      ),
    [data.habits, filterScope]
  );

  if (!data.canView) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <Card className="p-6 text-center">
          <h2 className="font-heading text-lg font-semibold">{t("habits.title")}</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {te("Active family membership required.")}
          </p>
        </Card>
      </div>
    );
  }

  const personalHabits = filtered.filter((h) => h.scope === "personal");
  const challengeHabits = filtered.filter(
    (h) => h.scope === "family_challenge"
  );

  const handleLog = async (habit: HabitItem) => {
    setBusyId(habit.id);
    const res = await logHabitCompletionAction({
      familyId,
      habitId: habit.id,
      valueCompleted: 1,
    });
    setBusyId(null);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("habits.toast.logged"));
    router.refresh();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createHabitAction({
      familyId,
      scope,
      category,
      title,
      description,
      cadence,
      targetPerPeriod: Math.max(1, Number(targetPerPeriod) || 1),
      targetUnit,
      reminderTime: reminderTime || null,
    });
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("habits.toast.added"));
    setSheetOpen(false);
    setTitle("");
    setDescription("");
    setReminderTime("");
    router.refresh();
  };

  const openEditHabit = (habit: HabitItem) => {
    setEditHabit(habit);
    setEditTitle(habit.title);
    setEditDescription(habit.description);
    setEditCategory(habit.category);
    setEditCadence(habit.cadence);
    setEditTargetPerPeriod(String(habit.targetPerPeriod));
    setEditTargetUnit(habit.targetUnit);
    setEditReminderTime(habit.reminderTime ?? "");
  };

  const handleUpdateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHabit) return;
    setSavingEdit(true);
    const res = await updateHabitAction({
      familyId,
      habitId: editHabit.id,
      category: editCategory,
      title: editTitle,
      description: editDescription,
      cadence: editCadence,
      targetPerPeriod: Math.max(1, Number(editTargetPerPeriod) || 1),
      targetUnit: editTargetUnit,
      reminderTime: editReminderTime || null,
    });
    setSavingEdit(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("habits.toast.updated"));
    setEditHabit(null);
    router.refresh();
  };

  const renderHabitCard = (habit: HabitItem) => {
    const meta = CATEGORY_META[habit.category];
    const Icon = meta.icon;
    const progressPct = Math.min(
      100,
      Math.round((habit.periodCompleted / habit.targetPerPeriod) * 100)
    );
    const reachedGoal = habit.periodCompleted >= habit.targetPerPeriod;

    return (
      <Card key={habit.id} className="flex flex-col justify-between gap-4 p-5">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-[16px] font-bold leading-snug">
                  {habit.title}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)]">
                  {t(`habits.cat.${habit.category}` as "habits.cat.reading")} · {habit.cadence === "daily" ? t("habits.cadence.daily") : t("habits.cadence.weekly")}
                  {habit.reminderTime ? ` · ${habit.reminderTime}` : ""}
                </p>
              </div>
            </div>
            <Badge variant={habit.scope === "family_challenge" ? "peach" : "neutral"}>
              {habit.scope === "family_challenge" ? t("habits.type.challenge") : t("habits.type.personal")}
            </Badge>
          </div>

          {habit.description && (
            <p className="text-[13px] text-[var(--text-secondary)]">
              {habit.description}
            </p>
          )}

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-medium text-[var(--text-secondary)]">
                {habit.periodCompleted} / {habit.targetPerPeriod} {habit.targetUnit}
              </span>
              <span className="font-semibold text-[var(--accent-primary)]">
                {progressPct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* 7-day Gentle Consistency Dots (no shame-based streak resets) */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              {habit.recentDays.map((day) => (
                <span
                  key={day.date}
                  title={day.date}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    day.completed
                      ? "bg-[var(--accent-primary)]"
                      : "bg-[var(--border-subtle)]"
                  )}
                />
              ))}
            </div>
            <span className="text-[11.5px] text-[var(--text-muted)]">
              {t("habits.thisWeekRate", { pct: habit.completionRatePct })}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
          <Button
            type="button"
            size="sm"
            variant={reachedGoal ? "secondary" : "primary"}
            disabled={busyId === habit.id}
            onClick={() => void handleLog(habit)}
          >
            <Check className="h-4 w-4" />
            {reachedGoal ? t("habits.logExtraBtn") : t("habits.checkInBtn")}
          </Button>
          {(habit.ownerMemberId === data.currentMemberId || data.canManageAll) && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={`${t("habits.editBtn")} ${habit.title}`}
                onClick={() => openEditHabit(habit)}
                className="inline-flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("habits.editBtn")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await archiveHabitAction({ familyId, habitId: habit.id });
                  router.refresh();
                }}
                className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Archive
              </button>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("habits.title")}
        description={t("habits.subtitle")}
        actions={
          <Button type="button" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("habits.newHabit")}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: t("habits.scope.all") },
            { id: "personal", label: t("habits.scope.personal") },
            { id: "family_challenge", label: t("habits.scope.challenge") },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilterScope(item.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer",
              filterScope === item.id
                ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {challengeHabits.length > 0 && (
        <Section title={t("habits.challengesSection")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {challengeHabits.map(renderHabitCard)}
          </div>
        </Section>
      )}

      <Section title={t("habits.personalSection")}>
        {personalHabits.length === 0 && challengeHabits.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title={t("habits.emptyTitle")}
              description={t("habits.emptyDesc")}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {personalHabits.map(renderHabitCard)}
          </div>
        )}
      </Section>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t("habits.newHabitTitle")}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("habits.titlePlaceholder")}
            required
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("habits.notePlaceholder")}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as HabitCategory)}
              options={[
                { value: "reading", label: t("habits.cat.reading") },
                { value: "exercise", label: t("habits.cat.exercise") },
                { value: "sleep", label: t("habits.cat.sleep") },
                { value: "mindfulness", label: t("habits.cat.mindfulness") },
                { value: "learning", label: t("habits.cat.learning") },
                { value: "routine", label: t("habits.cat.routine") },
                { value: "other", label: t("habits.cat.other") },
              ]}
            />
            <Select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as HabitCadence)}
              options={[
                { value: "daily", label: t("habits.cadence.daily") },
                { value: "weekly", label: t("habits.cadence.weekly") },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              min={1}
              max={1000}
              value={targetPerPeriod}
              onChange={(e) => setTargetPerPeriod(e.target.value)}
              placeholder={t("habits.targetPlaceholder")}
            />
            <Select
              value={targetUnit}
              onChange={(e) => setTargetUnit(e.target.value as HabitUnit)}
              options={[
                { value: "times", label: t("habits.unit.times") },
                { value: "minutes", label: t("habits.unit.minutes") },
                { value: "pages", label: t("habits.unit.pages") },
                { value: "hours", label: t("habits.unit.hours") },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
            />
            {data.canManageAll && (
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value as HabitScope)}
                options={[
                  { value: "personal", label: t("habits.type.personalGoal") },
                  { value: "family_challenge", label: t("habits.type.familyChallenge") },
                ]}
              />
            )}
          </div>
          <Button type="submit" className="w-full">
            {t("common.save")}
          </Button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={Boolean(editHabit)}
        onClose={() => setEditHabit(null)}
        title={t("habits.editTitle")}
      >
        <form onSubmit={handleUpdateHabit} className="space-y-4">
          <Input
            label={t("habits.modal.titleLabel")}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <Input
            label={t("habits.modal.noteLabel")}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label={t("habits.modal.categoryLabel")}
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as HabitCategory)}
              options={[
                { value: "reading", label: t("habits.cat.reading") },
                { value: "exercise", label: t("habits.cat.exercise") },
                { value: "sleep", label: t("habits.cat.sleep") },
                { value: "mindfulness", label: t("habits.cat.mindfulness") },
                { value: "learning", label: t("habits.cat.learning") },
                { value: "routine", label: t("habits.cat.routine") },
                { value: "other", label: t("habits.cat.other") },
              ]}
            />
            <Select
              label={t("habits.modal.cadenceLabel")}
              value={editCadence}
              onChange={(e) => setEditCadence(e.target.value as HabitCadence)}
              options={[
                { value: "daily", label: t("habits.cadence.daily") },
                { value: "weekly", label: t("habits.cadence.weekly") },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("habits.modal.targetLabel")}
              type="number"
              min={1}
              max={1000}
              value={editTargetPerPeriod}
              onChange={(e) => setEditTargetPerPeriod(e.target.value)}
            />
            <Select
              label={t("habits.modal.unitLabel")}
              value={editTargetUnit}
              onChange={(e) => setEditTargetUnit(e.target.value as HabitUnit)}
              options={[
                { value: "times", label: t("habits.unit.times") },
                { value: "minutes", label: t("habits.unit.minutes") },
                { value: "pages", label: t("habits.unit.pages") },
                { value: "hours", label: t("habits.unit.hours") },
              ]}
            />
          </div>
          <Input
            label={t("habits.modal.reminderLabel")}
            type="time"
            value={editReminderTime}
            onChange={(e) => setEditReminderTime(e.target.value)}
          />
          <Button type="submit" className="w-full" isLoading={savingEdit}>
            {t("common.saveChanges")}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}
