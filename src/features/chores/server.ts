import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";

export interface ChoresPageData {
  currentMemberId: string | null;
  canApproveChores: boolean;
  canRedeemRewards: boolean;
  myPointsBalance: number;
  members: Array<{ id: string; displayName: string }>;
  templates: Array<{
    id: string;
    title: string;
    description: string;
    defaultPoints: number;
    scheduleRule: string;
    category: string;
    assigneeName: string | null;
  }>;
  submissions: Array<{
    id: string;
    memberId: string;
    memberName: string;
    title: string;
    pointsValue: number;
    note: string;
    status: "pending_approval" | "approved" | "needs_retry";
    createdAt: string;
  }>;
  rewards: Array<{
    id: string;
    title: string;
    description: string;
    costPoints: number;
  }>;
  challenges: Array<{
    id: string;
    title: string;
    description: string;
    targetChores: number;
    currentChores: number;
    bonusPoints: number;
    status: "active" | "completed";
  }>;
  ledger: Array<{
    id: string;
    memberName: string;
    deltaPoints: number;
    reason: string;
    sourceType: string;
    createdAt: string;
  }>;
}

export async function getChoresPageData(
  familyId: string,
  userId: string
): Promise<ChoresPageData> {
  const empty: ChoresPageData = {
    currentMemberId: null,
    canApproveChores: false,
    canRedeemRewards: false,
    myPointsBalance: 0,
    members: [],
    templates: [],
    submissions: [],
    rewards: [],
    challenges: [],
    ledger: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const [
      { data: perms },
      { data: membersData },
      { data: templatesData },
      { data: submissionsData },
      { data: rewardsData },
      { data: challengesData },
      { data: ledgerData },
    ] = await Promise.all([
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase
        .from("family_members")
        .select("id, user_id, display_name")
        .eq("family_id", familyId)
        .eq("status", "active"),
      supabase
        .from("chore_templates")
        .select("id, title, description, default_points, schedule_rule, category, assigned_member_id")
        .eq("family_id", familyId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("chore_submissions")
        .select("id, member_id, title, points_value, note, status, created_at")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("reward_catalog")
        .select("id, title, description, cost_points")
        .eq("family_id", familyId)
        .eq("is_active", true)
        .order("cost_points", { ascending: true }),
      supabase
        .from("family_challenges")
        .select("id, title, description, target_chores, current_chores, bonus_points, status")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("reward_points_ledger")
        .select("id, member_id, delta_points, reason, source_type, created_at")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(40),
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

    // Fetch full balance for currentMember (not capped at 40) + any pending approvals not in latest 30
    const [{ data: myFullLedger }, { data: pendingSubsData }] =
      await Promise.all([
        currentMember
          ? supabase
              .from("reward_points_ledger")
              .select("delta_points")
              .eq("family_id", familyId)
              .eq("member_id", currentMember.id)
          : Promise.resolve({ data: [] as Array<{ delta_points: number }> }),
        supabase
          .from("chore_submissions")
          .select("id, member_id, title, points_value, note, status, created_at")
          .eq("family_id", familyId)
          .eq("status", "pending_approval")
          .order("created_at", { ascending: false }),
      ]);

    const rawLedger = (ledgerData ?? []) as Array<{
      id: string;
      member_id: string;
      delta_points: number;
      reason: string;
      source_type: string;
      created_at: string;
    }>;

    const myPointsBalance = currentMember
      ? ((myFullLedger ?? []) as Array<{ delta_points: number }>).reduce(
          (sum, l) => sum + l.delta_points,
          0
        )
      : 0;

    const mergedSubmissionsMap = new Map<
      string,
      {
        id: string;
        member_id: string;
        title: string;
        points_value: number;
        note: string;
        status: "pending_approval" | "approved" | "needs_retry";
        created_at: string;
      }
    >();
    for (const s of [...(pendingSubsData ?? []), ...(submissionsData ?? [])]) {
      mergedSubmissionsMap.set(
        s.id,
        s as {
          id: string;
          member_id: string;
          title: string;
          points_value: number;
          note: string;
          status: "pending_approval" | "approved" | "needs_retry";
          created_at: string;
        }
      );
    }
    const mergedSubmissions = Array.from(mergedSubmissionsMap.values());

    return {
      currentMemberId: currentMember?.id ?? null,
      canApproveChores: permSet.has("tasks.approve_chores"),
      canRedeemRewards: permSet.has("child_dev.rewards.redeem"),
      myPointsBalance,
      members: members.map(({ id, displayName }) => ({ id, displayName })),
      templates: (templatesData ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        defaultPoints: t.default_points,
        scheduleRule: t.schedule_rule,
        category: t.category,
        assigneeName: t.assigned_member_id
          ? memberMap.get(t.assigned_member_id) ?? null
          : null,
      })),
      submissions: mergedSubmissions.map((s) => ({
        id: s.id,
        memberId: s.member_id,
        memberName: memberMap.get(s.member_id) ?? "Member",
        title: s.title,
        pointsValue: s.points_value,
        note: s.note,
        status: s.status,
        createdAt: s.created_at,
      })),
      rewards: (rewardsData ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        costPoints: r.cost_points,
      })),
      challenges: (challengesData ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        targetChores: c.target_chores,
        currentChores: c.current_chores,
        bonusPoints: c.bonus_points,
        status: c.status,
      })),
      ledger: rawLedger.map((l) => ({
        id: l.id,
        memberName: memberMap.get(l.member_id) ?? "Member",
        deltaPoints: l.delta_points,
        reason: l.reason,
        sourceType: l.source_type,
        createdAt: l.created_at,
      })),
    };
  } catch {
    return empty;
  }
}
