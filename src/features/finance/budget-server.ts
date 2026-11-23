import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import {
  classifyBillStatus,
  computeBudgetProgress,
  getLocalDateInTimezone,
  type BudgetProgressResult,
  type ComputedBillStatus,
} from "./budgets";

export interface BudgetsBillsPageData {
  authorized: boolean;
  canManageBudgets: boolean;
  canManageTransactions: boolean;
  currencyCode: string;
  timezone: string;
  accounts: Array<{ id: string; name: string }>;
  budgets: Array<{
    id: string;
    name: string;
    category: string;
    periodType: "monthly" | "custom";
    periodStart: string;
    periodEnd: string;
    alertThresholdPct: number;
    progress: BudgetProgressResult;
  }>;
  bills: Array<{
    id: string;
    title: string;
    payee: string;
    category: string;
    amountNumeric: string;
    dueOn: string;
    recurrenceFrequency: string;
    accountId: string | null;
    computedStatus: ComputedBillStatus;
  }>;
  schedules: Array<{
    id: string;
    kind: "income" | "expense";
    merchant: string;
    category: string;
    amountNumeric: string;
    frequency: string;
    nextRunOn: string;
  }>;
  paymentHistory: Array<{
    id: string;
    billTitle: string;
    amountNumeric: string;
    paidAt: string;
  }>;
}

export async function getBudgetsBillsPageData(
  familyId: string
): Promise<BudgetsBillsPageData> {
  const denied: BudgetsBillsPageData = {
    authorized: false,
    canManageBudgets: false,
    canManageTransactions: false,
    currencyCode: "USD",
    timezone: "UTC",
    accounts: [],
    budgets: [],
    bills: [],
    schedules: [],
    paymentHistory: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: familyId,
    });
    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const canManageBudgets = permSet.has("finance.accounts.manage");
    const canManageTransactions = permSet.has("finance.transactions.manage");
    if (!canManageBudgets && !canManageTransactions) return denied;

    const [
      { data: fam },
      { data: accData },
      { data: budgetsData },
      { data: txData },
      { data: billsData },
      { data: schedData },
      { data: payHistData },
    ] = await Promise.all([
      supabase.from("families").select("currency_code, timezone").eq("id", familyId).maybeSingle(),
      supabase.from("finance_accounts").select("id, name").eq("family_id", familyId).eq("is_archived", false),
      supabase.from("finance_budgets").select("*").eq("family_id", familyId).order("period_start", { ascending: false }),
      supabase
        .from("finance_transactions")
        .select("kind, category, amount_numeric, occurred_on, is_reversed")
        .eq("family_id", familyId),
      supabase.from("household_bills").select("*").eq("family_id", familyId).order("due_on", { ascending: true }),
      supabase.from("recurring_schedules").select("*").eq("family_id", familyId).eq("is_active", true).order("next_run_on", { ascending: true }),
      supabase
        .from("bill_payment_history")
        .select("id, amount_numeric, paid_at, household_bills(title)")
        .eq("family_id", familyId)
        .order("paid_at", { ascending: false })
        .limit(20),
    ]);

    const timezone = fam?.timezone ?? "UTC";
    const todayLocal = getLocalDateInTimezone(timezone);

    const txs = (txData ?? []).map((t) => ({
      kind: t.kind,
      category: t.category,
      amountNumeric: String(t.amount_numeric ?? "0.00"),
      occurredOn: t.occurred_on,
      isReversed: Boolean(t.is_reversed),
    }));

    return {
      authorized: true,
      canManageBudgets,
      canManageTransactions,
      currencyCode: fam?.currency_code ?? "USD",
      timezone,
      accounts: (accData ?? []).map((a) => ({ id: a.id, name: a.name })),
      budgets: (budgetsData ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        category: b.category,
        periodType: b.period_type,
        periodStart: b.period_start,
        periodEnd: b.period_end,
        alertThresholdPct: b.alert_threshold_pct,
        progress: computeBudgetProgress({
          limitNumeric: String(b.limit_numeric),
          alertThresholdPct: b.alert_threshold_pct,
          category: b.category,
          periodStart: b.period_start,
          periodEnd: b.period_end,
          transactions: txs,
        }),
      })),
      bills: (billsData ?? []).map((bill) => ({
        id: bill.id,
        title: bill.title,
        payee: bill.payee,
        category: bill.category,
        amountNumeric: String(bill.amount_numeric),
        dueOn: bill.due_on,
        recurrenceFrequency: bill.recurrence_frequency,
        accountId: bill.account_id,
        computedStatus: classifyBillStatus({
          persistedStatus: bill.status,
          dueOn: bill.due_on,
          todayLocalDate: todayLocal,
        }),
      })),
      schedules: (schedData ?? []).map((s) => ({
        id: s.id,
        kind: s.kind,
        merchant: s.merchant,
        category: s.category,
        amountNumeric: String(s.amount_numeric),
        frequency: s.frequency,
        nextRunOn: s.next_run_on,
      })),
      paymentHistory: (
        (payHistData as unknown as Array<{
          id: string;
          amount_numeric: string;
          paid_at: string;
          household_bills: { title: string } | null;
        }>) ?? []
      ).map((h) => ({
        id: h.id,
        billTitle: h.household_bills?.title ?? "Household Bill",
        amountNumeric: String(h.amount_numeric),
        paidAt: h.paid_at,
      })),
    };
  } catch {
    return denied;
  }
}
