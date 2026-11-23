import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";
import { sumDecimalStrings } from "./money";

export interface FinanceAccountItem {
  id: string;
  name: string;
  accountKind: "bank" | "cash" | "savings" | "allowance" | "custom";
  ownershipScope: "family" | "personal";
  currencyCode: string;
  balanceNumeric: string;
  monthlyBudgetNumeric: string;
  isArchived: boolean;
}

export interface FinanceTransactionItem {
  id: string;
  accountId: string;
  accountName: string;
  merchant: string;
  category: string;
  kind: "income" | "expense" | "transfer" | "reversal";
  amountNumeric: string;
  occurredOn: string;
  notes: string;
  attachmentName: string | null;
  isReversed: boolean;
  memberName: string;
}

export interface FinancePageData {
  authorized: boolean;
  canManageAccounts: boolean;
  canManageTransactions: boolean;
  currencyCode: string;
  totalBalanceNumeric: string;
  totalIncomeNumeric: string;
  totalExpenseNumeric: string;
  accounts: FinanceAccountItem[];
  transactions: FinanceTransactionItem[];
  auditHistory: Array<{
    id: string;
    eventType: string;
    amountNumeric: string | null;
    createdAt: string;
  }>;
}

export async function getFinancePageData(familyId: string): Promise<FinancePageData> {
  const denied: FinancePageData = {
    authorized: false,
    canManageAccounts: false,
    canManageTransactions: false,
    currencyCode: "USD",
    totalBalanceNumeric: "0.00",
    totalIncomeNumeric: "0.00",
    totalExpenseNumeric: "0.00",
    accounts: [],
    transactions: [],
    auditHistory: [],
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

    if (!canManageAccounts && !canManageTransactions) {
      return denied;
    }

    const [{ data: fam }, { data: membersData }, { data: accData }, { data: txData }, { data: auditData }] =
      await Promise.all([
        supabase.from("families").select("currency_code").eq("id", familyId).maybeSingle(),
        supabase
          .from("family_members")
          .select("id, display_name")
          .eq("family_id", familyId),
        supabase
          .from("finance_accounts")
          .select("id, name, account_kind, ownership_scope, currency_code, balance_numeric, monthly_budget_numeric, is_archived")
          .eq("family_id", familyId)
          .order("created_at", { ascending: true }),
        supabase
          .from("finance_transactions")
          .select(
            "id, account_id, member_id, merchant, category, kind, amount_numeric, occurred_on, notes, attachment_name, is_reversed"
          )
          .eq("family_id", familyId)
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("finance_audit_history")
          .select("id, event_type, amount_numeric, created_at")
          .eq("family_id", familyId)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

    const memberMap = new Map(
      ((membersData ?? []) as Array<{ id: string; display_name: string }>).map(
        (m) => [m.id, m.display_name]
      )
    );

    const accounts: FinanceAccountItem[] = (accData ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      accountKind: a.account_kind,
      ownershipScope: a.ownership_scope,
      currencyCode: a.currency_code,
      balanceNumeric: String(a.balance_numeric ?? "0.00"),
      monthlyBudgetNumeric: String(a.monthly_budget_numeric ?? "0.00"),
      isArchived: Boolean((a as { is_archived?: boolean }).is_archived),
    }));

    const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));

    const transactions: FinanceTransactionItem[] = (txData ?? []).map((t) => ({
      id: t.id,
      accountId: t.account_id,
      accountName: accountNameMap.get(t.account_id) ?? "Account",
      merchant: t.merchant,
      category: t.category,
      kind: t.kind,
      amountNumeric: String(t.amount_numeric ?? "0.00"),
      occurredOn: t.occurred_on,
      notes: t.notes ?? "",
      attachmentName: t.attachment_name,
      isReversed: Boolean(t.is_reversed),
      memberName: t.member_id ? memberMap.get(t.member_id) ?? "Member" : "Member",
    }));

    const totalBalanceNumeric = sumDecimalStrings(
      accounts.map((a) => a.balanceNumeric)
    );
    const totalIncomeNumeric = sumDecimalStrings(
      transactions
        .filter((t) => t.kind === "income" && !t.isReversed)
        .map((t) => t.amountNumeric)
    );
    const totalExpenseNumeric = sumDecimalStrings(
      transactions
        .filter((t) => t.kind === "expense" && !t.isReversed)
        .map((t) => t.amountNumeric)
    );

    return {
      authorized: true,
      canManageAccounts,
      canManageTransactions,
      currencyCode: fam?.currency_code ?? accounts[0]?.currencyCode ?? "USD",
      totalBalanceNumeric,
      totalIncomeNumeric,
      totalExpenseNumeric,
      accounts,
      transactions,
      auditHistory: (auditData ?? []).map((a) => ({
        id: a.id,
        eventType: a.event_type,
        amountNumeric: a.amount_numeric ? String(a.amount_numeric) : null,
        createdAt: a.created_at,
      })),
    };
  } catch {
    return denied;
  }
}
