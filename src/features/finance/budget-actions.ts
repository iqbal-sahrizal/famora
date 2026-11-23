"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLocalDateInTimezone } from "./budgets";

const createBudgetSchema = z
  .object({
    familyId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(60),
    periodType: z.enum(["monthly", "custom"]).default("monthly"),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    limitNumeric: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    alertThresholdPct: z.number().int().min(10).max(100).default(80),
  })
  .refine((d) => d.periodEnd >= d.periodStart, {
    message: "End date must be on or after start date.",
  });

const createBillSchema = z.object({
  familyId: z.string().uuid(),
  accountId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(120),
  payee: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60).default("Utilities"),
  amountNumeric: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recurrenceFrequency: z
    .enum(["once", "monthly", "quarterly", "yearly"])
    .default("monthly"),
});

const createScheduleSchema = z.object({
  familyId: z.string().uuid(),
  accountId: z.string().uuid(),
  kind: z.enum(["income", "expense"]),
  merchant: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60).default("General"),
  amountNumeric: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  nextRunOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createBudgetAction(input: z.infer<typeof createBudgetSchema>) {
  await requireAuthenticatedUser();
  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid budget." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("finance_budgets").insert({
      family_id: parsed.data.familyId,
      name: parsed.data.name,
      category: parsed.data.category,
      period_type: parsed.data.periodType,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      limit_numeric: parsed.data.limitNumeric,
      alert_threshold_pct: parsed.data.alertThresholdPct,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create budget." };
  }
}

export async function createBillAction(input: z.infer<typeof createBillSchema>) {
  const user = await requireAuthenticatedUser();
  const parsed = createBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid bill." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    const { error } = await supabase.from("household_bills").insert({
      family_id: parsed.data.familyId,
      account_id: parsed.data.accountId,
      title: parsed.data.title,
      payee: parsed.data.payee,
      category: parsed.data.category,
      amount_numeric: parsed.data.amountNumeric,
      due_on: parsed.data.dueOn,
      recurrence_frequency: parsed.data.recurrenceFrequency,
      status: "unpaid",
    });

    if (error) return { ok: false, error: error.message };

    // Schedule bill reminder notification 2 days before due date
    if (actor) {
      const remindAt = new Date(`${parsed.data.dueOn}T09:00:00Z`);
      remindAt.setUTCDate(remindAt.getUTCDate() - 2);
      await supabase.from("notifications").insert({
        family_id: parsed.data.familyId,
        recipient_member_id: actor.id,
        category: "bill_reminder",
        domain: "finance",
        title: `Bill due soon: ${parsed.data.title}`,
        body: `Due on ${parsed.data.dueOn} (${parsed.data.payee})`,
        deep_link: routes.familyDomain(parsed.data.familyId, "budgets"),
        scheduled_for: remindAt.toISOString(),
      });
    }

    revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create bill." };
  }
}

export async function payBillAction(params: {
  familyId: string;
  billId: string;
  accountId: string;
  idempotencyKey?: string;
}) {
  await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("pay_household_bill", {
      p_family_id: params.familyId,
      p_bill_id: params.billId,
      p_account_id: params.accountId,
      p_idempotency_key: params.idempotencyKey ?? `bill:${params.billId}`,
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(params.familyId, "budgets"));
    revalidatePath(routes.familyDomain(params.familyId, "finance"));
    revalidatePath(routes.familyDashboard(params.familyId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to pay bill." };
  }
}

export async function createRecurringScheduleAction(
  input: z.infer<typeof createScheduleSchema>
) {
  await requireAuthenticatedUser();
  const parsed = createScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid schedule." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("recurring_schedules").insert({
      family_id: parsed.data.familyId,
      account_id: parsed.data.accountId,
      kind: parsed.data.kind,
      merchant: parsed.data.merchant,
      category: parsed.data.category,
      amount_numeric: parsed.data.amountNumeric,
      frequency: parsed.data.frequency,
      next_run_on: parsed.data.nextRunOn,
      is_active: true,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.familyDomain(parsed.data.familyId, "budgets"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create schedule." };
  }
}

export async function runDueRecurringSchedulesAction(params: {
  familyId: string;
  timezone: string;
}) {
  await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const asOfDate = getLocalDateInTimezone(params.timezone);
    const { data, error } = await supabase.rpc("process_due_recurring_schedules", {
      p_family_id: params.familyId,
      p_as_of_date: asOfDate,
    });

    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(params.familyId, "budgets"));
    revalidatePath(routes.familyDomain(params.familyId, "finance"));
    return { ok: true, generatedCount: Number(data ?? 0) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to process recurring schedules.",
    };
  }
}
