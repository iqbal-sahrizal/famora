"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Lock,
  MapPin,
  Plus,
  Repeat,
  Trash2,
  Users,
  X,
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
import { Tabs } from "@/components/ui/tabs";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { toIntlLocale } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import { writeOfflineCache } from "@/lib/pwa/indexeddb";
import { enqueueOfflineMutation } from "@/lib/pwa/sync-engine";
import { cn } from "@/lib/utils";
import {
  cancelCalendarEventAction,
  rsvpCalendarEventAction,
  saveCalendarEventAction,
} from "../actions";
import {
  expandCalendarEvents,
  formatInTimezone,
  type ExpandedCalendarOccurrence,
  type RecurrenceRule,
} from "../recurrence";
import type { CalendarPageData } from "../server";

type ViewMode = "month" | "week" | "day" | "agenda";

const COLOR_STYLES: Record<
  "forest" | "sage" | "peach" | "lavender" | "blush",
  string
> = {
  forest: "bg-[#315C49] text-[#F7F5EF]",
  sage: "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]",
  peach: "bg-[var(--tint-peach)] text-[var(--tint-peach-fg)]",
  lavender: "bg-[var(--tint-lavender)] text-[var(--tint-lavender-fg)]",
  blush: "bg-[var(--tint-blush)] text-[var(--tint-blush-fg)]",
};

function getRangeForView(anchor: Date, mode: ViewMode): [Date, Date] {
  const start = new Date(anchor);
  const end = new Date(anchor);

  if (mode === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    end.setFullYear(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() + (6 - end.getDay()));
  } else if (mode === "week") {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (mode === "day") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 30);
    end.setHours(23, 59, 59, 999);
  }
  return [start, end];
}

function toDateInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function FamilyCalendarView({
  familyId,
  data,
}: {
  familyId: string;
  data: CalendarPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const intlLocale = toIntlLocale(locale);
  const isOnline = useOnlineStatus();
  const [viewMode, setViewMode] = React.useState<ViewMode>("month");

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      setViewMode("agenda");
    }
  }, []);

  React.useEffect(() => {
    if (isOnline && data.events) {
      void writeOfflineCache(familyId, "calendar", data);
    }
  }, [familyId, isOnline, data]);
  const [anchorDate, setAnchorDate] = React.useState(() => new Date());
  const [selectedEvent, setSelectedEvent] =
    React.useState<ExpandedCalendarOccurrence | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Editor state
  const [editingId, setEditingId] = React.useState<string | undefined>();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [dateStr, setDateStr] = React.useState(() => toDateInputValue(new Date()));
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("10:00");
  const [allDay, setAllDay] = React.useState(false);
  const [visibility, setVisibility] = React.useState<
    "family" | "adults_only" | "private"
  >("family");
  const [category, setCategory] = React.useState("family");
  const [colorToken, setColorToken] = React.useState<
    "forest" | "sage" | "peach" | "lavender" | "blush"
  >("forest");
  const [recurrenceRule, setRecurrenceRule] =
    React.useState<RecurrenceRule>(null);
  const [reminderMinutes, setReminderMinutes] = React.useState<string>("30");
  const [participants, setParticipants] = React.useState<string[]>([]);

  const [rangeStart, rangeEnd] = React.useMemo(
    () => getRangeForView(anchorDate, viewMode),
    [anchorDate, viewMode]
  );

  const occurrences = React.useMemo(
    () => expandCalendarEvents(data.events, rangeStart, rangeEnd),
    [data.events, rangeStart, rangeEnd]
  );

  const stepDate = (dir: -1 | 1) => {
    const next = new Date(anchorDate);
    if (viewMode === "month") next.setMonth(next.getMonth() + dir);
    else if (viewMode === "week") next.setDate(next.getDate() + dir * 7);
    else next.setDate(next.getDate() + dir);
    setAnchorDate(next);
  };

  const openNewEditor = (presetDate?: Date) => {
    const d = presetDate ?? anchorDate;
    setEditingId(undefined);
    setTitle("");
    setDescription("");
    setLocation("");
    setDateStr(toDateInputValue(d));
    setStartTime("09:00");
    setEndTime("10:00");
    setAllDay(false);
    setVisibility("family");
    setCategory("family");
    setColorToken("forest");
    setRecurrenceRule(null);
    setReminderMinutes("30");
    setParticipants(data.currentMemberId ? [data.currentMemberId] : []);
    setEditorOpen(true);
  };

  const openEditEditor = (ev: ExpandedCalendarOccurrence) => {
    const s = new Date(ev.startAt);
    const e = new Date(ev.endAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditingId(ev.id);
    setTitle(ev.title);
    setDescription(ev.description);
    setLocation(ev.location);
    setDateStr(toDateInputValue(s));
    setStartTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
    setEndTime(`${pad(e.getHours())}:${pad(e.getMinutes())}`);
    setAllDay(ev.allDay);
    setVisibility(ev.visibility);
    setCategory(ev.category);
    setColorToken(ev.colorToken);
    setRecurrenceRule(ev.recurrenceRule);
    setReminderMinutes(
      ev.reminderMinutes !== null ? String(ev.reminderMinutes) : ""
    );
    setParticipants(ev.participants.map((p) => p.memberId));
    setSelectedEvent(null);
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const startIso = allDay
      ? new Date(`${dateStr}T00:00:00`).toISOString()
      : new Date(`${dateStr}T${startTime}:00`).toISOString();
    const endIso = allDay
      ? new Date(`${dateStr}T23:59:00`).toISOString()
      : new Date(`${dateStr}T${endTime}:00`).toISOString();

    if (!isOnline) {
      await enqueueOfflineMutation({
        familyId,
        domain: "calendar",
        actionType: "save_event",
        payload: {
          eventId: editingId,
          title,
          description,
          location,
          startAt: startIso,
          endAt: endIso,
          allDay,
          eventTimezone: data.familyTimezone,
          visibility,
          category,
          colorToken,
          recurrenceRule,
          recurrenceUntil: null,
          reminderMinutes: reminderMinutes ? Number(reminderMinutes) : null,
          participantMemberIds: participants,
        },
      });
      setBusy(false);
      setEditorOpen(false);
      toast.info(t("calendar.toast.offline"));
      return;
    }

    const res = await saveCalendarEventAction({
      familyId,
      eventId: editingId,
      title,
      description,
      location,
      startAt: startIso,
      endAt: endIso,
      allDay,
      eventTimezone: data.familyTimezone,
      visibility,
      category,
      colorToken,
      recurrenceRule,
      recurrenceUntil: null,
      reminderMinutes: reminderMinutes ? Number(reminderMinutes) : null,
      participantMemberIds: participants,
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }

    setEditorOpen(false);
    toast.success(editingId ? "Event updated" : "Event scheduled");
    router.refresh();
  };

  const handleCancelEvent = async (eventId: string) => {
    setBusy(true);
    const res = await cancelCalendarEventAction({ familyId, eventId });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setSelectedEvent(null);
    toast.success(t("calendar.toast.cancelled"));
    router.refresh();
  };

  const handleRsvp = async (
    eventId: string,
    rsvpStatus: "accepted" | "declined"
  ) => {
    setBusy(true);
    const res = await rsvpCalendarEventAction({
      familyId,
      eventId,
      rsvpStatus,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(rsvpStatus === "accepted" ? "Marked as Going" : "Declined");
      setSelectedEvent(null);
      router.refresh();
    }
  };

  // Build days grid for Month / Week
  const gridDays = React.useMemo(() => {
    const days: Date[] = [];
    const cur = new Date(rangeStart);
    while (cur <= rangeEnd) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [rangeStart, rangeEnd]);

  const eventsOnDay = (day: Date) => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    return occurrences.filter(
      (occ) =>
        new Date(occ.occurrenceEndAt) >= dayStart &&
        new Date(occ.occurrenceStartAt) <= dayEnd
    );
  };

  return (
    <Section>
      <PageHeader
        title={t("calendar.title")}
        description={`Timezone: ${data.familyTimezone} · Shared events, personal schedules, and recurring plans.`}
        actions={
          data.canManage ? (
            <Button onClick={() => openNewEditor()}>
              <Plus className="h-4 w-4" />
              New Event
            </Button>
          ) : undefined
        }
      />

      {/* Compact Date Navigation & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label={t("calendar.prevPeriodAria")}
            onClick={() => stepDate(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAnchorDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t("calendar.nextPeriodAria")}
            onClick={() => stepDate(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 font-heading text-[18px] font-semibold">
            {anchorDate.toLocaleDateString(intlLocale, {
              month: "long",
              year: "numeric",
              ...(viewMode === "day" ? { day: "numeric" } : {}),
            })}
          </h2>
        </div>

        <Tabs
          activeId={viewMode}
          onChange={(id) => setViewMode(id as ViewMode)}
          tabs={[
            { id: "month", label: t("calendar.view.month") },
            { id: "week", label: t("calendar.view.week") },
            { id: "day", label: t("calendar.view.day") },
            { id: "agenda", label: t("calendar.view.agenda") },
          ]}
        />
      </div>

      {/* Month & Week Grid Views */}
      {(viewMode === "month" || viewMode === "week") && (
        <Card className="overflow-x-auto p-3 sm:p-4">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[12px] font-semibold text-[var(--text-muted)]">
              {t("calendar.weekdaysShort")
                .split(",")
                .map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {gridDays.map((day) => {
                const dayEvents = eventsOnDay(day);
                const isToday =
                  toDateInputValue(day) === toDateInputValue(new Date());
                const isCurrentMonth =
                  day.getMonth() === anchorDate.getMonth();
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-[86px] sm:min-h-[108px] rounded-2xl p-2 transition-colors border border-transparent",
                      isCurrentMonth || viewMode === "week"
                        ? "bg-[var(--bg-subtle)]/55 hover:bg-[var(--bg-subtle)]"
                        : "bg-transparent opacity-45",
                      isToday && "border-[var(--accent-primary)] bg-[var(--tint-sage)]/25"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <button
                        type="button"
                        disabled={!data.canManage}
                        onClick={() => {
                          if (data.canManage) openNewEditor(day);
                        }}
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums",
                          isToday &&
                            "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]",
                          data.canManage && "hover:bg-[var(--bg-hover)] cursor-pointer"
                        )}
                      >
                        {day.getDate()}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button
                          key={ev.occurrenceKey}
                          type="button"
                          onClick={() => setSelectedEvent(ev)}
                          className={cn(
                            "block min-h-[28px] w-full truncate rounded-lg px-2 py-1 text-left text-[11px] font-medium cursor-pointer",
                            COLOR_STYLES[ev.colorToken]
                          )}
                        >
                          {ev.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <p className="px-1 text-[10.5px] font-medium text-[var(--text-secondary)]">
                          {t("calendar.moreEvents", { count: dayEvents.length - 3 })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Day & Agenda Timeline Views */}
      {(viewMode === "day" || viewMode === "agenda") && (
        <Card className="space-y-4">
          {occurrences.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon className="h-5 w-5" />}
              title={t("calendar.emptyTitle")}
              description={t("calendar.emptyDesc")}
              actionLabel={data.canManage ? t("calendar.newEventBtn") : undefined}
              onAction={data.canManage ? () => openNewEditor() : undefined}
            />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {occurrences.map((ev) => (
                <button
                  key={ev.occurrenceKey}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className="flex w-full items-center justify-between gap-4 py-3.5 text-left hover:bg-[var(--bg-subtle)]/50 rounded-xl px-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3.5">
                    <span
                      className={cn(
                        "mt-1 h-3 w-3 shrink-0 rounded-full",
                        COLOR_STYLES[ev.colorToken].split(" ")[0]
                      )}
                    />
                    <div>
                      <p className="font-heading text-[15px] font-semibold">
                        {ev.title}
                      </p>
                      <p className="text-[12.5px] text-[var(--text-secondary)] tabular-nums">
                        {formatInTimezone(ev.occurrenceStartAt, data.familyTimezone, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          ...(ev.allDay
                            ? {}
                            : { hour: "numeric", minute: "2-digit" }),
                        })}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ev.recurrenceRule && (
                      <Badge variant="lavender">
                        <Repeat className="h-3 w-3" />
                        {ev.recurrenceRule}
                      </Badge>
                    )}
                    <Badge variant="neutral">{ev.category}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Mobile-Friendly Event Details Bottom Sheet */}
      <BottomSheet
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title ?? t("calendar.detailsFallback")}
      >
        {selectedEvent && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="sage">{selectedEvent.category}</Badge>
              {selectedEvent.visibility !== "family" && (
                <Badge variant="lavender">
                  <Lock className="h-3 w-3" />
                  {selectedEvent.visibility.replace("_", " ")}
                </Badge>
              )}
              {selectedEvent.recurrenceRule && (
                <Badge variant="peach">
                  <Repeat className="h-3 w-3" />
                  Repeats {selectedEvent.recurrenceRule}
                </Badge>
              )}
            </div>

            <div className="space-y-2 text-[14px] text-[var(--text-secondary)]">
              <p className="flex items-center gap-2 tabular-nums">
                <Clock className="h-4 w-4" />
                {formatInTimezone(
                  selectedEvent.occurrenceStartAt,
                  data.familyTimezone,
                  {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }
                )}
              </p>
              {selectedEvent.location && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {selectedEvent.location}
                </p>
              )}
              {selectedEvent.reminderMinutes !== null && (
                <p className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Reminder {selectedEvent.reminderMinutes} min before
                </p>
              )}
            </div>

            {selectedEvent.description && (
              <p className="rounded-2xl bg-[var(--bg-subtle)] p-3.5 text-[13.5px] leading-relaxed">
                {selectedEvent.description}
              </p>
            )}

            {selectedEvent.participants.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-muted)]">
                  <Users className="h-3.5 w-3.5" />
                  Participants
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedEvent.participants.map((p) => (
                    <Badge key={p.memberId} variant="neutral">
                      {p.displayName} ({p.rsvpStatus})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="tonal"
                size="sm"
                disabled={busy}
                onClick={() => handleRsvp(selectedEvent.id, "accepted")}
              >
                <Check className="h-4 w-4" />
                Going
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => handleRsvp(selectedEvent.id, "declined")}
              >
                <X className="h-4 w-4" />
                {t("calendar.rsvpDecline")}
              </Button>
              {data.canManage && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => openEditEditor(selectedEvent)}
                  >
                    <Edit3 className="h-4 w-4" />
                    {t("calendar.editBtn")}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleCancelEvent(selectedEvent.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("calendar.cancelEventBtn")}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Quick Event Create / Edit Sheet */}
      <BottomSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? t("calendar.editEventTitle") : t("calendar.newEventTitle")}
        fullHeight
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label={t("calendar.eventTitleLabel")}
            required
            placeholder={t("calendar.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label={t("calendar.dateLabel")}
              type="date"
              required
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
            {!allDay && (
              <>
                <Input
                  label={t("calendar.startLabel")}
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <Input
                  label={t("calendar.endLabel")}
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </>
            )}
          </div>

          <label className="flex min-h-11 items-center gap-2.5 text-[13.5px] font-medium cursor-pointer sm:min-h-0">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 accent-[#315C49]"
            />
            {t("calendar.allDayLabel")}
          </label>

          <Input
            label={t("calendar.locationLabel")}
            placeholder={t("calendar.locationPlaceholder")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("calendar.visibilityLabel")}
              value={visibility}
              onChange={(e) =>
                setVisibility(
                  e.target.value as "family" | "adults_only" | "private"
                )
              }
              options={[
                { value: "family", label: t("calendar.vis.family") },
                ...(data.canViewAdultsOnly
                  ? [{ value: "adults_only", label: t("calendar.vis.adultsOnly") }]
                  : []),
                { value: "private", label: t("calendar.vis.private") },
              ]}
            />
            <Select
              label={t("calendar.colorLabel")}
              value={colorToken}
              onChange={(e) =>
                setColorToken(e.target.value as typeof colorToken)
              }
              options={[
                { value: "forest", label: t("calendar.color.forest") },
                { value: "sage", label: t("calendar.color.sage") },
                { value: "peach", label: t("calendar.color.peach") },
                { value: "lavender", label: t("calendar.color.lavender") },
                { value: "blush", label: t("calendar.color.blush") },
              ]}
            />
            <Select
              label={t("calendar.repeatLabel")}
              value={recurrenceRule ?? "none"}
              onChange={(e) =>
                setRecurrenceRule(
                  e.target.value === "none"
                    ? null
                    : (e.target.value as Exclude<RecurrenceRule, null>)
                )
              }
              options={[
                { value: "none", label: t("calendar.repeat.none") },
                { value: "daily", label: t("calendar.repeat.daily") },
                { value: "weekly", label: t("calendar.repeat.weekly") },
                { value: "monthly", label: t("calendar.repeat.monthly") },
                { value: "yearly", label: t("calendar.repeat.yearly") },
              ]}
            />
            <Select
              label={t("calendar.reminderLabel")}
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(e.target.value)}
              options={[
                { value: "", label: t("calendar.rem.none") },
                { value: "15", label: t("calendar.rem.15") },
                { value: "30", label: t("calendar.rem.30") },
                { value: "60", label: t("calendar.rem.60") },
                { value: "1440", label: t("calendar.rem.1440") },
              ]}
            />
          </div>

          {data.members.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[13.5px] font-medium">{t("calendar.participants")}</span>
              <div className="flex flex-wrap gap-2">
                {data.members.map((m) => {
                  const selected = participants.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setParticipants((prev) =>
                          selected
                            ? prev.filter((id) => id !== m.id)
                            : [...prev, m.id]
                        )
                      }
                      className={cn(
                        "min-h-11 rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-colors cursor-pointer sm:min-h-0 sm:px-3 sm:py-1",
                        selected
                          ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                          : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                      )}
                    >
                      {m.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={busy}>
            {editingId ? t("calendar.updateEventBtn") : t("calendar.saveEventBtn")}
          </Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
