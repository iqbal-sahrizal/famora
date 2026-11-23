import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import type { CalendarEventRecord, RecurrenceRule } from "./recurrence";

export interface CalendarPageData {
  familyTimezone: string;
  currentMemberId: string | null;
  canManage: boolean;
  canViewAdultsOnly: boolean;
  members: Array<{ id: string; displayName: string }>;
  events: CalendarEventRecord[];
}

export async function getCalendarPageData(
  familyId: string,
  userId: string
): Promise<CalendarPageData> {
  const fallback: CalendarPageData = {
    familyTimezone: "UTC",
    currentMemberId: null,
    canManage: false,
    canViewAdultsOnly: false,
    members: [],
    events: [],
  };

  try {
    const supabase = await createSupabaseServerClient();

    const [{ data: family }, { data: perms }, { data: membersData }, { data: eventsData }] =
      await Promise.all([
        supabase
          .from("families")
          .select("timezone")
          .eq("id", familyId)
          .maybeSingle(),
        supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
        supabase
          .from("family_members")
          .select("id, user_id, display_name")
          .eq("family_id", familyId)
          .eq("status", "active"),
        supabase
          .from("calendar_events")
          .select(
            `
            id, title, description, location, start_at, end_at, all_day,
            event_timezone, visibility, category, color_token, recurrence_rule,
            recurrence_until, reminder_minutes, status, created_by_member_id,
            calendar_event_participants(member_id, rsvp_status)
          `
          )
          .eq("family_id", familyId)
          .eq("status", "scheduled")
          .order("start_at", { ascending: true }),
      ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const members = ((membersData ?? []) as Array<{
      id: string;
      user_id: string | null;
      display_name: string;
    }>).map((m) => ({
      id: m.id,
      userId: m.user_id,
      displayName: m.display_name,
    }));

    const memberMap = new Map(members.map((m) => [m.id, m.displayName]));
    const currentMember = members.find((m) => m.userId === userId) ?? null;

    const events: CalendarEventRecord[] = (
      (eventsData as unknown as Array<{
        id: string;
        title: string;
        description: string;
        location: string;
        start_at: string;
        end_at: string;
        all_day: boolean;
        event_timezone: string;
        visibility: "family" | "adults_only" | "private";
        category: string;
        color_token: "forest" | "sage" | "peach" | "lavender" | "blush";
        recurrence_rule: RecurrenceRule;
        recurrence_until: string | null;
        reminder_minutes: number | null;
        status: "scheduled" | "cancelled";
        created_by_member_id: string | null;
        calendar_event_participants: Array<{
          member_id: string;
          rsvp_status: "pending" | "accepted" | "declined";
        }>;
      }>) ?? []
    ).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description ?? "",
      location: e.location ?? "",
      startAt: e.start_at,
      endAt: e.end_at,
      allDay: e.all_day,
      eventTimezone: e.event_timezone ?? family?.timezone ?? "UTC",
      visibility: e.visibility,
      category: e.category,
      colorToken: e.color_token ?? "forest",
      recurrenceRule: e.recurrence_rule,
      recurrenceUntil: e.recurrence_until,
      reminderMinutes: e.reminder_minutes,
      status: e.status,
      createdByMemberId: e.created_by_member_id,
      participants: (e.calendar_event_participants ?? []).map((p) => ({
        memberId: p.member_id,
        displayName: memberMap.get(p.member_id) ?? "Member",
        rsvpStatus: p.rsvp_status,
      })),
    }));

    return {
      familyTimezone: family?.timezone ?? "UTC",
      currentMemberId: currentMember?.id ?? null,
      canManage: permSet.has("calendar.family.manage"),
      canViewAdultsOnly: permSet.has("calendar.adults_only.view"),
      members: members.map(({ id, displayName }) => ({ id, displayName })),
      events,
    };
  } catch {
    return fallback;
  }
}
