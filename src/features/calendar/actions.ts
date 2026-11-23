"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  calendarEventInputSchema,
  rsvpSchema,
  type CalendarEventInput,
  type RsvpInput,
} from "./schemas";

export interface CalendarActionResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

export async function saveCalendarEventAction(
  input: CalendarEventInput
): Promise<CalendarActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = calendarEventInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid calendar event.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    });
    const allowed = ((perms as Array<{ permission_key: string }>) ?? []).some(
      (p) => p.permission_key === "calendar.family.manage"
    );
    if (!allowed) {
      return { ok: false, error: "Missing permission: calendar.family.manage" };
    }

    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) {
      return { ok: false, error: "Active membership not found." };
    }

    const payload = {
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      start_at: parsed.data.startAt,
      end_at: parsed.data.endAt,
      all_day: parsed.data.allDay,
      event_timezone: parsed.data.eventTimezone,
      visibility: parsed.data.visibility,
      category: parsed.data.category,
      color_token: parsed.data.colorToken,
      recurrence_rule: parsed.data.recurrenceRule,
      recurrence_until: parsed.data.recurrenceUntil,
      reminder_minutes: parsed.data.reminderMinutes,
    };

    let eventId = parsed.data.eventId;
    if (eventId) {
      const { error } = await supabase
        .from("calendar_events")
        .update(payload)
        .eq("id", eventId)
        .eq("family_id", parsed.data.familyId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data: inserted, error } = await supabase
        .from("calendar_events")
        .insert({ ...payload, created_by_member_id: actor.id })
        .select("id")
        .single<{ id: string }>();
      if (error || !inserted) {
        return { ok: false, error: error?.message ?? "Failed to create event." };
      }
      eventId = inserted.id;
    }

    // Sync participants
    const uniqueParticipants = Array.from(
      new Set(parsed.data.participantMemberIds)
    );
    await supabase
      .from("calendar_event_participants")
      .delete()
      .eq("event_id", eventId);

    if (uniqueParticipants.length > 0) {
      await supabase.from("calendar_event_participants").insert(
        uniqueParticipants.map((memberId) => ({
          family_id: parsed.data.familyId,
          event_id: eventId,
          member_id: memberId,
          rsvp_status: memberId === actor.id ? "accepted" : "pending",
        }))
      );
    }

    // Schedule reminder notifications for participants (or creator)
    if (parsed.data.reminderMinutes !== null) {
      const remindAt = new Date(
        new Date(parsed.data.startAt).getTime() -
          parsed.data.reminderMinutes * 60 * 1000
      ).toISOString();
      const recipients =
        uniqueParticipants.length > 0 ? uniqueParticipants : [actor.id];
      await supabase.from("notifications").insert(
        recipients.map((recipientId) => ({
          family_id: parsed.data.familyId,
          recipient_member_id: recipientId,
          category: "calendar",
          domain: "calendar",
          title: `Upcoming: ${parsed.data.title}`,
          body: `Starts in ${parsed.data.reminderMinutes} min`,
          deep_link: routes.familyDomain(parsed.data.familyId, "calendar"),
          scheduled_for: remindAt,
        }))
      );
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "calendar"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true, eventId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save event.",
    };
  }
}

export async function cancelCalendarEventAction(params: {
  familyId: string;
  eventId: string;
}): Promise<CalendarActionResult> {
  await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("calendar_events")
      .update({ status: "cancelled" })
      .eq("id", params.eventId)
      .eq("family_id", params.familyId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(params.familyId, "calendar"));
    revalidatePath(routes.familyDashboard(params.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to cancel event.",
    };
  }
}

export async function rsvpCalendarEventAction(
  input: RsvpInput
): Promise<CalendarActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = rsvpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid RSVP input." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) return { ok: false, error: "Active membership not found." };

    const { error } = await supabase
      .from("calendar_event_participants")
      .upsert(
        {
          family_id: parsed.data.familyId,
          event_id: parsed.data.eventId,
          member_id: actor.id,
          rsvp_status: parsed.data.rsvpStatus,
        },
        { onConflict: "event_id,member_id" }
      );

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "calendar"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update RSVP.",
    };
  }
}
