import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import type { AnalyticsTxInput } from "./analytics";

export interface FinanceGoalItem {
  id: string;
  title: string;
  targetNumeric: string;
  currentNumeric: string;
  targetDate: string | null;
  status: "active" | "completed";
}

export interface DebtReceivableItem {
  id: string;
  kind: "debt" | "receivable";
  counterparty: string;
  title: string;
  principalNumeric: string;
  remainingNumeric: string;
  dueOn: string | null;
  status: "open" | "settled";
}

export interface AnalyticsPageData {
  authorized: boolean;
  canManageTransactions: boolean;
  currencyCode: string;
  transactions: AnalyticsTxInput[];
  goals: FinanceGoalItem[];
  debtsReceivables: DebtReceivableItem[];
}

export async function getAnalyticsPageData(
  familyId: string
): Promise<AnalyticsPageData> {
  const denied: AnalyticsPageData = {
    authorized: false,
    canManageTransactions: false,
    currencyCode: "USD",
    transactions: [],
    goals: [],
    debtsReceivables: [],
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

    const canManageAccounts = permSet.has("finance.accounts.manage");
    const canManageTransactions = permSet.has("finance.transactions.manage");
    if (!canManageAccounts && !canManageTransactions) return denied;

    const [{ data: fam }, { data: txData }, { data: goalsData }, { data: debtsData }] =
      await Promise.all([
        supabase.from("families").select("currency_code").eq("id", familyId).maybeSingle(),
        supabase
          .from("finance_transactions")
          .select("id, merchant, category, kind, amount_numeric, occurred_on, is_reversed")
          .eq("family_id", familyId)
          .order("occurred_on", { ascending: false })
          .limit(300),
        supabase
          .from("finance_goals")
          .select("id, title, target_numeric, current_numeric, target_date, status")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("finance_debts_receivables")
          .select("id, kind, counterparty, title, principal_numeric, remaining_numeric, due_on, status")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false }),
      ]);

    return {
      authorized: true,
      canManageTransactions,
      currencyCode: fam?.currency_code ?? "USD",
      transactions: (txData ?? []).map((t) => ({
        id: t.id,
        merchant: t.merchant,
        category: t.category,
        kind: t.kind,
        amountNumeric: String(t.amount_numeric ?? "0.00"),
        occurredOn: t.occurred_on,
        isReversed: Boolean(t.is_reversed),
      })),
      goals: (goalsData ?? []).map((g) => ({
        id: g.id,
        title: g.title,
        targetNumeric: String(g.target_numeric),
        currentNumeric: String(g.current_numeric),
        targetDate: g.target_date,
        status: g.status,
      })),
      debtsReceivables: (debtsData ?? []).map((d) => ({
        id: d.id,
        kind: d.kind,
        counterparty: d.counterparty,
        title: d.title,
        principalNumeric: String(d.principal_numeric),
        remainingNumeric: String(d.remaining_numeric),
        dueOn: d.due_on,
        status: d.status,
      })),
    };
  } catch {
    return denied;
  }
}
