import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FamilyRole, PermissionKey } from "@/types/domain";

export interface DashboardMember {
  id: string;
  displayName: string;
  roleKey: FamilyRole;
  isManagedChild: boolean;
}

export interface DashboardEvent {
  id: string;
  title: string;
  location: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  category: string;
}

export interface DashboardTask {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "pending_approval" | "done";
  priority: "low" | "normal" | "high";
  dueAt: string | null;
  pointsValue: number;
  assigneeName: string | null;
}

export interface DashboardAnnouncement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
}

export interface DashboardShoppingItem {
  id: string;
  name: string;
  category: string;
  quantity: string;
  isChecked: boolean;
}

export interface DashboardFinanceSummary {
  currencyCode: string;
  totalBalanceCents: number;
  monthlyBudgetCents: number;
  monthlySpentCents: number;
  recentTransactions: Array<{
    id: string;
    merchant: string;
    category: string;
    kind: "income" | "expense";
    amountCents: number;
    occurredOn: string;
  }>;
}

export interface DashboardActivityItem {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
}

export interface FamilyDashboardPayload {
  greeting: string;
  userName: string;
  family: {
    id: string;
    name: string;
    description: string;
    timezone: string;
    currencyCode: string;
  } | null;
  currentRoleKey: FamilyRole | null;
  permissions: PermissionKey[];
  members: DashboardMember[];
  todaysEvents: DashboardEvent[];
  upcomingEvents: DashboardEvent[];
  pendingTasks: DashboardTask[];
  announcements: DashboardAnnouncement[];
  shoppingItems: DashboardShoppingItem[];
  financeSummary: DashboardFinanceSummary | null;
  recentActivity: DashboardActivityItem[];
}

export function getTimeOfDayGreeting(timezone = "UTC", now = new Date()): string {
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(now);
    const hour = Number(hourStr);
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  } catch {
    return "Welcome back";
  }
}

export async function getFamilyDashboardData(
  familyId: string,
  userId: string
): Promise<FamilyDashboardPayload> {
  const empty: FamilyDashboardPayload = {
    greeting: "Welcome back",
    userName: "Member",
    family: null,
    currentRoleKey: null,
    permissions: [],
    members: [],
    todaysEvents: [],
    upcomingEvents: [],
    pendingTasks: [],
    announcements: [],
    shoppingItems: [],
    financeSummary: null,
    recentActivity: [],
  };

  try {
    const supabase = await createSupabaseServerClient();

    const [
      { data: profile },
      { data: family },
      { data: permsData },
      { data: membersData },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, default_timezone")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("families")
        .select("id, name, description, timezone, currency_code")
        .eq("id", familyId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
      supabase
        .from("family_members")
        .select("id, user_id, display_name, is_managed_child, family_roles!inner(role_key)")
        .eq("family_id", familyId)
        .eq("status", "active"),
    ]);

    const permissions = (
      (permsData as Array<{ permission_key: PermissionKey }>) ?? []
    ).map((p) => p.permission_key);

    const typedMembers = (
      (membersData as unknown as Array<{
        id: string;
        user_id: string | null;
        display_name: string;
        is_managed_child: boolean;
        family_roles: { role_key: FamilyRole };
      }>) ?? []
    );

    const selfMember = typedMembers.find((m) => m.user_id === userId) ?? null;
    const members: DashboardMember[] = typedMembers.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      roleKey: m.family_roles.role_key,
      isManagedChild: m.is_managed_child,
    }));

    const memberNameMap = new Map(members.map((m) => [m.id, m.displayName]));
    const timezone = family?.timezone ?? profile?.default_timezone ?? "UTC";
    const userName = selfMember?.display_name ?? profile?.full_name ?? "Member";
    const greeting = getTimeOfDayGreeting(timezone);

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const canViewFinance =
      permissions.includes("finance.accounts.manage") ||
      permissions.includes("finance.transactions.manage");
    const canViewAudit = permissions.includes("audit_logs.view");

    // Fetch domain data in parallel; financial queries are strictly skipped if unauthorized
    const [
      { data: eventsData },
      { data: tasksData },
      { data: announcementsData },
      { data: shoppingData },
      financeAccountsRes,
      financeTxRes,
      activityRes,
    ] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("id, title, location, start_at, end_at, all_day, category")
        .eq("family_id", familyId)
        .eq("status", "scheduled")
        .gte("end_at", startOfToday.toISOString())
        .lte("start_at", nextWeek.toISOString())
        .order("start_at", { ascending: true })
        .limit(12),
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_at, points_value, assigned_member_id")
        .eq("family_id", familyId)
        .neq("status", "done")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(8),
      supabase
        .from("family_announcements")
        .select("id, title, body, pinned, created_at")
        .eq("family_id", familyId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("shopping_items")
        .select("id, name, category, quantity, is_checked")
        .eq("family_id", familyId)
        .eq("is_checked", false)
        .order("created_at", { ascending: false })
        .limit(6),
      canViewFinance
        ? supabase
            .from("finance_accounts")
            .select("balance_cents, monthly_budget_cents, currency_code")
            .eq("family_id", familyId)
        : Promise.resolve({ data: null }),
      canViewFinance
        ? supabase
            .from("finance_transactions")
            .select("id, merchant, category, kind, amount_cents, occurred_on")
            .eq("family_id", familyId)
            .order("occurred_on", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: null }),
      canViewAudit
        ? supabase
            .from("activity_logs")
            .select("id, action, resource_type, created_at")
            .eq("family_id", familyId)
            .order("created_at", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: null }),
    ]);

    const allEvents: DashboardEvent[] = (eventsData ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      location: e.location,
      startAt: e.start_at,
      endAt: e.end_at,
      allDay: e.all_day,
      category: e.category,
    }));

    const todaysEvents = allEvents.filter(
      (e) => new Date(e.startAt) <= endOfToday
    );
    const upcomingEvents = allEvents.filter(
      (e) => new Date(e.startAt) > endOfToday
    );

    const pendingTasks: DashboardTask[] = (tasksData ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueAt: t.due_at,
      pointsValue: t.points_value,
      assigneeName: t.assigned_member_id
        ? memberNameMap.get(t.assigned_member_id) ?? null
        : null,
    }));

    let financeSummary: DashboardFinanceSummary | null = null;
    if (canViewFinance && financeAccountsRes.data) {
      const accounts = financeAccountsRes.data as Array<{
        balance_cents: number;
        monthly_budget_cents: number;
        currency_code: string;
      }>;
      const txs = (financeTxRes.data ?? []) as Array<{
        id: string;
        merchant: string;
        category: string;
        kind: "income" | "expense";
        amount_cents: number;
        occurred_on: string;
      }>;
      const totalBalanceCents = accounts.reduce(
        (sum, a) => sum + Number(a.balance_cents),
        0
      );
      const monthlyBudgetCents = accounts.reduce(
        (sum, a) => sum + Number(a.monthly_budget_cents),
        0
      );
      const monthlySpentCents = txs
        .filter((tx) => tx.kind === "expense")
        .reduce((sum, tx) => sum + Number(tx.amount_cents), 0);

      financeSummary = {
        currencyCode: family?.currency_code ?? accounts[0]?.currency_code ?? "USD",
        totalBalanceCents,
        monthlyBudgetCents,
        monthlySpentCents,
        recentTransactions: txs.map((tx) => ({
          id: tx.id,
          merchant: tx.merchant,
          category: tx.category,
          kind: tx.kind,
          amountCents: Number(tx.amount_cents),
          occurredOn: tx.occurred_on,
        })),
      };
    }

    return {
      greeting,
      userName,
      family: family
        ? {
            id: family.id,
            name: family.name,
            description: family.description ?? "",
            timezone: family.timezone,
            currencyCode: family.currency_code,
          }
        : null,
      currentRoleKey: selfMember?.family_roles.role_key ?? null,
      permissions,
      members,
      todaysEvents,
      upcomingEvents,
      pendingTasks,
      announcements: (announcementsData ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        pinned: a.pinned,
        createdAt: a.created_at,
      })),
      shoppingItems: (shoppingData ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        quantity: s.quantity,
        isChecked: s.is_checked,
      })),
      financeSummary,
      recentActivity: ((activityRes.data ?? []) as Array<{
        id: string;
        action: string;
        resource_type: string;
        created_at: string;
      }>).map((a) => ({
        id: a.id,
        action: a.action,
        resourceType: a.resource_type,
        createdAt: a.created_at,
      })),
    };
  } catch {
    return empty;
  }
}
