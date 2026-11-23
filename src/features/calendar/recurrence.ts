export type RecurrenceRule = "daily" | "weekly" | "monthly" | "yearly" | null;

export interface CalendarEventRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  eventTimezone: string;
  visibility: "family" | "adults_only" | "private";
  category: string;
  colorToken: "forest" | "sage" | "peach" | "lavender" | "blush";
  recurrenceRule: RecurrenceRule;
  recurrenceUntil: string | null;
  reminderMinutes: number | null;
  status: "scheduled" | "cancelled";
  createdByMemberId: string | null;
  participants: Array<{
    memberId: string;
    displayName: string;
    rsvpStatus: "pending" | "accepted" | "declined";
  }>;
}

export interface ExpandedCalendarOccurrence extends CalendarEventRecord {
  occurrenceKey: string;
  occurrenceStartAt: string;
  occurrenceEndAt: string;
}

function addRecurrenceStep(
  baseStart: Date,
  rule: Exclude<RecurrenceRule, null>,
  stepIndex: number
): Date {
  const next = new Date(baseStart.getTime());
  if (rule === "daily") {
    next.setUTCDate(next.getUTCDate() + stepIndex);
  } else if (rule === "weekly") {
    next.setUTCDate(next.getUTCDate() + stepIndex * 7);
  } else if (rule === "monthly") {
    const origDay = baseStart.getUTCDate();
    next.setUTCMonth(baseStart.getUTCMonth() + stepIndex, 1);
    const maxDays = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
    ).getUTCDate();
    next.setUTCDate(Math.min(origDay, maxDays));
  } else if (rule === "yearly") {
    next.setUTCFullYear(baseStart.getUTCFullYear() + stepIndex);
  }
  return next;
}

/**
 * Expands scheduled calendar events (including recurring series) into occurrences
 * intersecting [rangeStart, rangeEnd], preserving event duration and timezone metadata.
 */
export function expandCalendarEvents(
  events: CalendarEventRecord[],
  rangeStart: Date,
  rangeEnd: Date,
  maxOccurrencesPerSeries = 180
): ExpandedCalendarOccurrence[] {
  const results: ExpandedCalendarOccurrence[] = [];

  for (const ev of events) {
    if (ev.status === "cancelled") continue;

    const baseStart = new Date(ev.startAt);
    const baseEnd = new Date(ev.endAt);
    const durationMs = Math.max(0, baseEnd.getTime() - baseStart.getTime());
    const until = ev.recurrenceUntil ? new Date(ev.recurrenceUntil) : null;

    if (!ev.recurrenceRule) {
      if (baseEnd >= rangeStart && baseStart <= rangeEnd) {
        results.push({
          ...ev,
          occurrenceKey: `${ev.id}:${baseStart.toISOString()}`,
          occurrenceStartAt: baseStart.toISOString(),
          occurrenceEndAt: baseEnd.toISOString(),
        });
      }
      continue;
    }

    let count = 0;
    let cursor = baseStart;
    while (cursor <= rangeEnd && count < maxOccurrencesPerSeries) {
      if (until && cursor > until) break;

      const occEnd = new Date(cursor.getTime() + durationMs);
      if (occEnd >= rangeStart && cursor <= rangeEnd) {
        results.push({
          ...ev,
          occurrenceKey: `${ev.id}:${cursor.toISOString()}`,
          occurrenceStartAt: cursor.toISOString(),
          occurrenceEndAt: occEnd.toISOString(),
        });
      }

      count += 1;
      cursor = addRecurrenceStep(baseStart, ev.recurrenceRule, count);
    }
  }

  return results.sort(
    (a, b) =>
      new Date(a.occurrenceStartAt).getTime() -
      new Date(b.occurrenceStartAt).getTime()
  );
}

import { toIntlLocale, type Locale } from "@/lib/i18n";

/**
 * Formats an ISO timestamp in the target IANA timezone.
 */
export function formatInTimezone(
  iso: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  locale: Locale = "en"
): string {
  const intl = toIntlLocale(locale);
  try {
    return new Intl.DateTimeFormat(intl, {
      ...options,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(intl, options).format(new Date(iso));
  }
}
