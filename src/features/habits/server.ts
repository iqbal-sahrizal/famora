import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import type {
  HabitCadence,
  HabitCategory,
  HabitItem,
  HabitsPageData,
  HabitScope,
  HabitUnit,
} from "./types";
import { computeGentleConsistency } from "./validation";

export async function getHabitsPageData(
  familyId: string
): Promise<HabitsPageData> {
  const denied: HabitsPageData = {
    canView: false,
    canManageAll: false,
    currentMemberId: null,
    habits: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return denied;

    const [{ data: perms }, { data: membersData }] = await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase
        .from("family_members")
        .select("id, user_id, display_name")
        .eq("family_id", familyId)
        .eq("status", "active"),
    ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );
    const members =
      (membersData as Array<{
        id: string;
        user_id: string | null;
        display_name: string;
      }>) ?? [];
    const currentMember = members.find((m) => m.user_id === user.id);
    if (!currentMember) return denied;

    const canManageAll = permSet.has("habits.manage_all");
    const memberNameMap = new Map(members.map((m) => [m.id, m.display_name]));

    const todayIso = new Date().toISOString().slice(0, 10);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [{ data: habitsData }, { data: logsData }] = await Promise.all([
      supabase
        .from("habits")
        .select(
          "id, owner_member_id, scope, category, title, description, cadence, target_per_period, target_unit, reminder_time, is_active"
        )
        .eq("family_id", familyId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("habit_logs")
        .select("habit_id, member_id, log_date, value_completed")
        .eq("family_id", familyId)
        .eq("member_id", currentMember.id)
        .gte("log_date", fourteenDaysAgo),
    ]);

    const logsByHabit = new Map<
      string,
      Array<{ log_date: string; value_completed: number }>
    >();
    for (const l of (logsData as Array<{
      habit_id: string;
      member_id: string;
      log_date: string;
      value_completed: number;
    }>) ?? []) {
      const list = logsByHabit.get(l.habit_id) ?? [];
      list.push(l);
      logsByHabit.set(l.habit_id, list);
    }

    const weekStartIso = new Date(Date.now() - 6 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const habits: HabitItem[] = (
      (habitsData as Array<{
        id: string;
        owner_member_id: string;
        scope: HabitScope;
        category: HabitCategory;
        title: string;
        description: string;
        cadence: HabitCadence;
        target_per_period: number;
        target_unit: HabitUnit;
        reminder_time: string | null;
        is_active: boolean;
      }>) ?? []
    ).map((h) => {
      const myLogs = logsByHabit.get(h.id) ?? [];
      const todayCompleted = myLogs
        .filter((l) => l.log_date === todayIso)
        .reduce((acc, l) => acc + l.value_completed, 0);
      const periodCompleted =
        h.cadence === "daily"
          ? todayCompleted
          : myLogs
              .filter((l) => l.log_date >= weekStartIso)
              .reduce((acc, l) => acc + l.value_completed, 0);

      const consistency = computeGentleConsistency({
        completedDates: myLogs.map((l) => l.log_date),
        windowDays: 7,
        todayIso,
      });

      return {
        id: h.id,
        ownerMemberId: h.owner_member_id,
        ownerName: memberNameMap.get(h.owner_member_id) ?? "Family member",
        scope: h.scope,
        category: h.category,
        title: h.title,
        description: h.description,
        cadence: h.cadence,
        targetPerPeriod: h.target_per_period,
        targetUnit: h.target_unit,
        reminderTime: h.reminder_time,
        isActive: h.is_active,
        todayCompleted,
        periodCompleted,
        completionRatePct: consistency.completionRatePct,
        recentDays: consistency.recentDays,
      };
    });

    return {
      canView: true,
      canManageAll,
      currentMemberId: currentMember.id,
      habits,
    };
  } catch {
    return denied;
  }
}
