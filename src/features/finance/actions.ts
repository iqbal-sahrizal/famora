"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyFamilyMembers } from "@/features/notifications/triggers";
import { parseDecimalToMinorUnits } from "./money";
import {
  archiveFinanceAccountSchema,
  createAccountSchema,
  recordTransactionSchema,
  reverseTransactionSchema,
  updateFinanceAccountSchema,
  type ArchiveFinanceAccountInput,
  type CreateAccountInput,
  type RecordTransactionInput,
  type ReverseTransactionInput,
  type UpdateFinanceAccountInput,
} from "./schemas";

export interface FinanceActionResult {
  ok: boolean;
  id?: string;
  error?: string;
}

async function hasFinanceAccountsManagePermission(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  familyId: string
): Promise<boolean> {
  const { data: perms } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: familyId,
  });
  return ((perms as Array<{ permission_key: string }>) ?? []).some(
    (p) => p.permission_key === "finance.accounts.manage"
  );
}

export async function createFinanceAccountAction(
  input: CreateAccountInput
): Promise<FinanceActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid account." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    });
    const canManage = ((perms as Array<{ permission_key: string }>) ?? []).some(
      (p) => p.permission_key === "finance.accounts.manage"
    );
    if (!canManage) {
      return { ok: false, error: "Missing permission: finance.accounts.manage" };
    }

    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    const initialCents = Number(parseDecimalToMinorUnits(parsed.data.initialBalance));
    const budgetCents = Number(parseDecimalToMinorUnits(parsed.data.monthlyBudget));

    const { data: created, error } = await supabase
      .from("finance_accounts")
      .insert({
        family_id: parsed.data.familyId,
        name: parsed.data.name,
        account_type:
          parsed.data.accountKind === "bank" || parsed.data.accountKind === "custom"
            ? "checking"
            : parsed.data.accountKind,
        account_kind: parsed.data.accountKind,
        ownership_scope: parsed.data.ownershipScope,
        owner_member_id:
          parsed.data.ownershipScope === "personal" ? actor?.id ?? null : null,
        currency_code: parsed.data.currencyCode,
        balance_cents: initialCents,
        monthly_budget_cents: budgetCents,
        balance_numeric: parsed.data.initialBalance,
        monthly_budget_numeric: parsed.data.monthlyBudget,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !created) {
      return { ok: false, error: error?.message ?? "Failed to create account." };
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true, id: created.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create account.",
    };
  }
}

export async function updateFinanceAccountAction(
  input: UpdateFinanceAccountInput
): Promise<FinanceActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = updateFinanceAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid account." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const canManage = await hasFinanceAccountsManagePermission(
      supabase,
      parsed.data.familyId
    );
    if (!canManage) {
      return { ok: false, error: "Missing permission: finance.accounts.manage" };
    }

    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    const budgetCents = Number(parseDecimalToMinorUnits(parsed.data.monthlyBudget));

    const { data: updated, error } = await supabase
      .from("finance_accounts")
      .update({
        name: parsed.data.name,
        account_type:
          parsed.data.accountKind === "bank" || parsed.data.accountKind === "custom"
            ? "checking"
            : parsed.data.accountKind,
        account_kind: parsed.data.accountKind,
        ownership_scope: parsed.data.ownershipScope,
        owner_member_id:
          parsed.data.ownershipScope === "personal" ? actor?.id ?? null : null,
        monthly_budget_cents: budgetCents,
        monthly_budget_numeric: parsed.data.monthlyBudget,
      })
      .eq("id", parsed.data.accountId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Finance account not found." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true, id: updated.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update account.",
    };
  }
}

export async function archiveFinanceAccountAction(
  input: ArchiveFinanceAccountInput
): Promise<FinanceActionResult> {
  await requireAuthenticatedUser();
  const parsed = archiveFinanceAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid account." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const canManage = await hasFinanceAccountsManagePermission(
      supabase,
      parsed.data.familyId
    );
    if (!canManage) {
      return { ok: false, error: "Missing permission: finance.accounts.manage" };
    }

    const { data: updated, error } = await supabase
      .from("finance_accounts")
      .update({
        is_archived: parsed.data.archive,
        archived_at: parsed.data.archive ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.accountId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Finance account not found." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true, id: updated.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to archive account.",
    };
  }
}

export async function recordFinanceTransactionAction(
  input: RecordTransactionInput
): Promise<FinanceActionResult> {
  await requireAuthenticatedUser();
  const parsed = recordTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid transaction.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: acc } = await supabase
      .from("finance_accounts")
      .select("is_archived")
      .eq("id", parsed.data.accountId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{ is_archived?: boolean }>();

    if (acc?.is_archived) {
      return {
        ok: false,
        error: "Cannot record transactions on an archived account. Restore it first.",
      };
    }

    const { data, error } = await supabase.rpc("record_finance_transaction", {
      p_family_id: parsed.data.familyId,
      p_account_id: parsed.data.accountId,
      p_kind: parsed.data.kind,
      p_amount: parsed.data.amount,
      p_merchant: parsed.data.merchant,
      p_category: parsed.data.category,
      p_occurred_on: parsed.data.occurredOn,
      p_notes: parsed.data.notes,
      p_transfer_account_id: parsed.data.transferAccountId,
      p_attachment_name: parsed.data.attachmentName,
      p_idempotency_key: parsed.data.idempotencyKey ?? crypto.randomUUID(),
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    void notifyFamilyMembers({
      familyId: parsed.data.familyId,
      category: "bill_reminder",
      domain: "finance",
      title: "Aktivitas Keuangan Keluarga",
      body: "Ada pencatatan transaksi keuangan baru.",
      deepLink: routes.familyDomain(parsed.data.familyId, "finance"),
      idempotencyPrefix: `finance-tx:${String(data)}`,
    });
    return { ok: true, id: String(data) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to record transaction.",
    };
  }
}

export async function reverseFinanceTransactionAction(
  input: ReverseTransactionInput
): Promise<FinanceActionResult> {
  await requireAuthenticatedUser();
  const parsed = reverseTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Provide a reversal reason.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("reverse_finance_transaction", {
      p_family_id: parsed.data.familyId,
      p_transaction_id: parsed.data.transactionId,
      p_reason: parsed.data.reason,
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "finance"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true, id: String(data) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reverse transaction.",
    };
  }
}
