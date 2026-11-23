"use client";

import {
  addShoppingItemAction,
  toggleShoppingCheckAction,
  updateShoppingQuantityAction,
} from "@/features/shopping/actions";
import { saveTaskAction, toggleTaskStatusAction } from "@/features/tasks/actions";
import {
  rsvpCalendarEventAction,
  saveCalendarEventAction,
} from "@/features/calendar/actions";
import { isAuthExpiredErrorMessage } from "./sync-engine";
import type { OfflineMutationRecord } from "./types";

export async function executeDomainOfflineMutation(
  record: OfflineMutationRecord
): Promise<{
  ok: boolean;
  conflict?: boolean;
  authExpired?: boolean;
  error?: string;
}> {
  const p = record.payload;

  try {
    if (record.domain === "shopping") {
      if (record.actionType === "add_item") {
        const res = await addShoppingItemAction({
          familyId: record.familyId,
          listId: (p.listId as string | null) ?? null,
          name: String(p.name ?? ""),
          category: String(p.category ?? "Groceries"),
          quantity: String(p.quantity ?? "1"),
          unit: String(p.unit ?? "pcs"),
          estimatedPriceCents: Number(p.estimatedPriceCents ?? 0),
          notes: String(p.notes ?? ""),
          assignedShopperMemberId: (p.assignedShopperMemberId as string | null) ?? null,
          clientMutationId: record.idempotencyKey,
        });
        return {
          ok: res.ok,
          authExpired: isAuthExpiredErrorMessage(res.error),
          error: res.error,
        };
      }
      if (record.actionType === "toggle_check") {
        const res = await toggleShoppingCheckAction({
          familyId: record.familyId,
          itemId: String(p.itemId ?? ""),
          isChecked: Boolean(p.isChecked),
        });
        return {
          ok: res.ok,
          authExpired: isAuthExpiredErrorMessage(res.error),
          error: res.error,
        };
      }
      if (record.actionType === "update_quantity") {
        const res = await updateShoppingQuantityAction({
          familyId: record.familyId,
          itemId: String(p.itemId ?? ""),
          quantity: String(p.quantity ?? "1"),
        });
        return {
          ok: res.ok,
          authExpired: isAuthExpiredErrorMessage(res.error),
          error: res.error,
        };
      }
    }

    if (record.domain === "tasks") {
      if (record.actionType === "save_task") {
        const res = await saveTaskAction({
          familyId: record.familyId,
          taskId: p.taskId ? String(p.taskId) : undefined,
          title: String(p.title ?? ""),
          description: String(p.description ?? ""),
          category:
            (p.category as
              | "household"
              | "errands"
              | "school"
              | "chores"
              | "health"
              | "other") ?? "household",
          priority: (p.priority as "low" | "normal" | "high") ?? "normal",
          dueAt: p.dueAt ? String(p.dueAt) : null,
          pointsValue: Number(p.pointsValue ?? 0),
          recurrenceRule:
            (p.recurrenceRule as "daily" | "weekly" | "monthly" | null) ?? null,
          assigneeMemberIds: Array.isArray(p.assigneeMemberIds)
            ? (p.assigneeMemberIds as string[])
            : [],
          subtasks: Array.isArray(p.subtasks) ? (p.subtasks as string[]) : [],
          syncToCalendar: Boolean(p.syncToCalendar),
        });
        return {
          ok: res.ok,
          authExpired: isAuthExpiredErrorMessage(res.error),
          error: res.error,
        };
      }
      if (record.actionType === "toggle_status") {
        const res = await toggleTaskStatusAction({
          familyId: record.familyId,
          taskId: String(p.taskId ?? ""),
          nextStatus:
            (p.nextStatus as "todo" | "in_progress" | "done") ?? "done",
        });
        return {
          ok: res.ok,
          authExpired: isAuthExpiredErrorMessage(res.error),
          error: res.error,
        };
      }
    }

    if (record.domain === "calendar") {
      if (record.actionType === "save_event") {
        const res = await saveCalendarEventAction({
          familyId: record.familyId,
          eventId: p.eventId ? String(p.eventId) : undefined,
          title: String(p.title ?? ""),
          description: String(p.description ?? ""),
          location: String(p.location ?? ""),
          category:
            (p.category as
              | "family"
              | "school"
              | "medical"
              | "holiday"
              | "bill"
              | "chore"
              | "other") ?? "family",
          colorToken:
            (p.colorToken as
              | "forest"
              | "sage"
              | "peach"
              | "lavender"
              | "blush") ?? "forest",
          startAt: String(p.startAt ?? new Date().toISOString()),
          endAt: String(p.endAt ?? new Date().toISOString()),
          allDay: Boolean(p.allDay),
          eventTimezone: String(p.eventTimezone ?? "UTC"),
          visibility:
            (p.visibility as "family" | "adults_only") ?? "family",
          recurrenceRule:
            (p.recurrenceRule as "daily" | "weekly" | "monthly" | "yearly" | null) ??
            null,
          recurrenceUntil: p.recurrenceUntil ? String(p.recurrenceUntil) : null,
          reminderMinutes:
            p.reminderMinutes !== undefined && p.reminderMinutes !== null
              ? Number(p.reminderMinutes)
              : null,
          participantMemberIds: Array.isArray(p.participantMemberIds)
            ? (p.participantMemberIds as string[])
            : [],
        });
        return {
          ok: res.ok,
          authExpired: isAuthExpiredErrorMessage(res.error),
          error: res.error,
        };
      }
      if (record.actionType === "rsvp_event") {
        const res = await rsvpCalendarEventAction({
          familyId: record.familyId,
          eventId: String(p.eventId ?? ""),
          rsvpStatus:
            (p.rsvpStatus as "pending" | "accepted" | "declined") ?? "accepted",
        });
        return {
          ok: res.ok,
          authExpired: isAuthExpiredErrorMessage(res.error),
          error: res.error,
        };
      }
    }

    if (record.domain === "drafts") {
      return { ok: true };
    }

    return {
      ok: false,
      error: `Unsupported offline action: ${record.domain}:${record.actionType}`,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network error while syncing.";
    return {
      ok: false,
      authExpired: isAuthExpiredErrorMessage(message),
      error: message,
    };
  }
}
