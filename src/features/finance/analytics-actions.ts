"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createGoalSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  targetNumeric: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

const contributeGoalSchema = z.object({
  familyId: z.string().uuid(),
  goalId: z.string().uuid(),
  amountNumeric: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  notes: z.string().trim().max(300).default(""),
});

const createDebtSchema = z.object({
  familyId: z.string().uuid(),
  kind: z.enum(["debt", "receivable"]),
  counterparty: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  principalNumeric: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

const recordDebtPaymentSchema = z.object({
  familyId: z.string().uuid(),
  debtId: z.string().uuid(),
  amountNumeric: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  notes: z.string().trim().max(300).default(""),
});

export async function createFinanceGoalAction(input: z.infer<typeof createGoalSchema>) {
  await requireAuthenticatedUser();
  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid savings goal." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("finance_goals").insert({
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      target_numeric: parsed.data.targetNumeric,
      target_date: parsed.data.targetDate,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create goal." };
  }
}

export async function contributeToGoalAction(
  input: z.infer<typeof contributeGoalSchema>
) {
  await requireAuthenticatedUser();
  const parsed = contributeGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid contribution amount." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("contribute_to_finance_goal", {
      p_family_id: parsed.data.familyId,
      p_goal_id: parsed.data.goalId,
      p_amount: parsed.data.amountNumeric,
      p_notes: parsed.data.notes,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Contribution failed." };
  }
}

export async function createDebtReceivableAction(
  input: z.infer<typeof createDebtSchema>
) {
  await requireAuthenticatedUser();
  const parsed = createDebtSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid debt/receivable record." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("finance_debts_receivables").insert({
      family_id: parsed.data.familyId,
      kind: parsed.data.kind,
      counterparty: parsed.data.counterparty,
      title: parsed.data.title,
      principal_numeric: parsed.data.principalNumeric,
      remaining_numeric: parsed.data.principalNumeric,
      due_on: parsed.data.dueOn,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create record." };
  }
}

export async function recordDebtPaymentAction(
  input: z.infer<typeof recordDebtPaymentSchema>
) {
  await requireAuthenticatedUser();
  const parsed = recordDebtPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid payment amount." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("record_debt_payment", {
      p_family_id: parsed.data.familyId,
      p_debt_id: parsed.data.debtId,
      p_amount: parsed.data.amountNumeric,
      p_notes: parsed.data.notes,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Payment failed." };
  }
}

async function hasTxManagePerm(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  familyId: string
): Promise<boolean> {
  const { data } = await supabase.rpc("get_my_family_permissions", {
    p_family_id: familyId,
  });
  return ((data as Array<{ permission_key: string }>) ?? []).some(
    (p) => p.permission_key === "finance.transactions.manage"
  );
}

export async function updateFinanceGoalAction(
  input: z.infer<typeof createGoalSchema> & { goalId: string }
) {
  await requireAuthenticatedUser();
  const parsed = createGoalSchema.extend({ goalId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid savings goal." };
  try {
    const supabase = await createSupabaseServerClient();
    if (!(await hasTxManagePerm(supabase, parsed.data.familyId))) {
      return { ok: false, error: "Missing permission: finance.transactions.manage" };
    }
    const { data: updated, error } = await supabase
      .from("finance_goals")
      .update({
        title: parsed.data.title,
        target_numeric: parsed.data.targetNumeric,
        target_date: parsed.data.targetDate,
      })
      .eq("id", parsed.data.goalId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "Goal not found." };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update goal." };
  }
}

export async function deleteFinanceGoalAction(params: {
  familyId: string;
  goalId: string;
}) {
  await requireAuthenticatedUser();
  const parsed = z
    .object({ familyId: z.string().uuid(), goalId: z.string().uuid() })
    .safeParse(params);
  if (!parsed.success) return { ok: false, error: "Invalid goal reference." };
  try {
    const supabase = await createSupabaseServerClient();
    if (!(await hasTxManagePerm(supabase, parsed.data.familyId))) {
      return { ok: false, error: "Missing permission: finance.transactions.manage" };
    }
    const { data: deleted, error } = await supabase
      .from("finance_goals")
      .delete()
      .eq("id", parsed.data.goalId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!deleted) return { ok: false, error: "Goal not found." };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete goal." };
  }
}

export async function deleteDebtReceivableAction(params: {
  familyId: string;
  debtId: string;
}) {
  await requireAuthenticatedUser();
  const parsed = z
    .object({ familyId: z.string().uuid(), debtId: z.string().uuid() })
    .safeParse(params);
  if (!parsed.success) return { ok: false, error: "Invalid debt reference." };
  try {
    const supabase = await createSupabaseServerClient();
    if (!(await hasTxManagePerm(supabase, parsed.data.familyId))) {
      return { ok: false, error: "Missing permission: finance.transactions.manage" };
    }
    const { data: deleted, error } = await supabase
      .from("finance_debts_receivables")
      .delete()
      .eq("id", parsed.data.debtId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!deleted) return { ok: false, error: "Record not found." };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "analytics"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete record." };
  }
}
