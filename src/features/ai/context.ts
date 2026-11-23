import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import type { AuthorizedFamilyContext } from "./types";

/**
 * Retrieves ONLY the family data that the current authenticated member is
 * authorized to access. Never queries child_health_records or private documents.
 */
export async function retrieveAuthorizedFamilyContext(params: {
  familyId: string;
  memberName: string;
  permissions: Set<PermissionKey>;
}): Promise<AuthorizedFamilyContext> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;

  const [
    { data: familyRow },
    { data: eventsData },
    { data: tasksData },
    { data: shoppingData },
    { data: recipesData },
    { data: habitsData },
    { data: activityData },
  ] = await Promise.all([
    supabase
      .from("families")
      .select("name")
      .eq("id", params.familyId)
      .maybeSingle<{ name: string }>(),
    supabase
      .from("calendar_events")
      .select("title, start_at")
      .eq("family_id", params.familyId)
      .gte("start_at", now.toISOString())
      .lte("start_at", in7Days)
      .order("start_at", { ascending: true })
      .limit(10),
    supabase
      .from("tasks")
      .select("title, priority, due_at")
      .eq("family_id", params.familyId)
      .is("completed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from("shopping_items")
      .select("name, quantity, category")
      .eq("family_id", params.familyId)
      .eq("is_checked", false)
      .limit(15),
    supabase
      .from("recipes")
      .select("title, dietary_tags")
      .eq("family_id", params.familyId)
      .limit(10),
    supabase
      .from("habits")
      .select("title, cadence")
      .eq("family_id", params.familyId)
      .eq("is_active", true)
      .limit(10),
    supabase
      .from("activity_logs")
      .select("action, created_at")
      .eq("family_id", params.familyId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  let financeSummary: AuthorizedFamilyContext["financeSummary"] = {
    authorized: false,
    monthlyExpenseCents: 0,
    monthlyIncomeCents: 0,
    unpaidBills: [],
  };

  if (params.permissions.has("finance.transactions.manage")) {
    const [{ data: txRows }, { data: billRows }] = await Promise.all([
      supabase
        .from("finance_transactions")
        .select("kind, amount_numeric, amount_cents")
        .eq("family_id", params.familyId)
        .gte("occurred_on", monthStart),
      supabase
        .from("household_bills")
        .select("title, due_on, amount_numeric")
        .eq("family_id", params.familyId)
        .eq("status", "unpaid")
        .order("due_on", { ascending: true })
        .limit(8),
    ]);

    let monthlyExpenseCents = 0;
    let monthlyIncomeCents = 0;
    for (const tx of (txRows as Array<{
      kind: string;
      amount_numeric: number | string | null;
      amount_cents: number | null;
    }>) ?? []) {
      const cents =
        tx.amount_numeric !== null && tx.amount_numeric !== undefined
          ? Math.round(Number(tx.amount_numeric) * 100)
          : Number(tx.amount_cents ?? 0);
      if (tx.kind === "expense") monthlyExpenseCents += cents;
      if (tx.kind === "income") monthlyIncomeCents += cents;
    }

    financeSummary = {
      authorized: true,
      monthlyExpenseCents,
      monthlyIncomeCents,
      unpaidBills: (
        (billRows as Array<{
          title: string;
          due_on: string;
          amount_numeric: number | string;
        }>) ?? []
      ).map((b) => ({
        title: b.title,
        dueOn: b.due_on,
        amountCents: Math.round(Number(b.amount_numeric ?? 0) * 100),
      })),
    };
  }

  return {
    familyName: familyRow?.name ?? "Your Family",
    memberName: params.memberName,
    calendarEvents: (
      (eventsData as Array<{ title: string; start_at: string }>) ?? []
    ).map((e) => ({ title: e.title, startsAt: e.start_at })),
    pendingTasks: (
      (tasksData as Array<{
        title: string;
        priority: string;
        due_at: string | null;
      }>) ?? []
    ).map((t) => ({ title: t.title, priority: t.priority, dueAt: t.due_at })),
    shoppingItems: (
      (shoppingData as Array<{
        name: string;
        quantity: string;
        category: string;
      }>) ?? []
    ).map((s) => ({ name: s.name, quantity: s.quantity, category: s.category })),
    recipes: (
      (recipesData as Array<{ title: string; dietary_tags?: string[] | null }>) ??
      []
    ).map((r) => ({ title: r.title, category: r.dietary_tags?.[0] ?? "Recipe" })),
    habits: (
      (habitsData as Array<{ title: string; cadence: string }>) ?? []
    ).map((h) => ({ title: h.title, cadence: h.cadence })),
    recentActivities: (
      (activityData as Array<{ action: string; created_at: string }>) ?? []
    ).map((a) => ({ action: a.action, createdAt: a.created_at })),
    financeSummary,
  };
}
