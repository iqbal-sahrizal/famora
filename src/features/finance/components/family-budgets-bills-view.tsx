"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Lock,
  PieChart,
  Play,
  Plus,
  Receipt,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatLocalizedDate, toIntlLocale } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import {
  createBillAction,
  createBudgetAction,
  createRecurringScheduleAction,
  payBillAction,
  runDueRecurringSchedulesAction,
} from "../budget-actions";
import type { BudgetsBillsPageData } from "../budget-server";
import { formatNumericCurrency } from "../money";

export function FamilyBudgetsBillsView({
  familyId,
  data,
}: {
  familyId: string;
  data: BudgetsBillsPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [tab, setTab] = React.useState<"budgets" | "bills" | "schedules" | "history">("budgets");
  const [busy, setBusy] = React.useState(false);

  const [budgetOpen, setBudgetOpen] = React.useState(false);
  const [billOpen, setBillOpen] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [payTarget, setPayTarget] = React.useState<BudgetsBillsPageData["bills"][number] | null>(null);
  const [payAccountId, setPayAccountId] = React.useState(data.accounts[0]?.id ?? "");

  // Budget form
  const [bName, setBName] = React.useState("");
  const [bCategory, setBCategory] = React.useState("Groceries");
  const [bLimit, setBLimit] = React.useState("600.00");
  const [bStart, setBStart] = React.useState(() => new Date().toISOString().slice(0, 8) + "01");
  const [bEnd, setBEnd] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });

  // Bill form
  const [billTitle, setBillTitle] = React.useState("");
  const [billPayee, setBillPayee] = React.useState("");
  const [billAmount, setBillAmount] = React.useState("");
  const [billDue, setBillDue] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [billFreq, setBillFreq] = React.useState<"once" | "monthly" | "quarterly" | "yearly">("monthly");

  // Schedule form
  const [sKind, setSKind] = React.useState<"expense" | "income">("expense");
  const [sMerchant, setSMerchant] = React.useState("");
  const [sAmount, setSAmount] = React.useState("");
  const [sAccount, setSAccount] = React.useState(data.accounts[0]?.id ?? "");
  const [sFreq, setSFreq] = React.useState<"weekly" | "monthly" | "yearly">("monthly");
  const [sNext, setSNext] = React.useState(() => new Date().toISOString().slice(0, 10));

  if (!data.authorized) {
    return (
      <Section>
        <PageHeader title={t("budgets.title")} description={t("budgets.restrictedHeaderDesc")} />
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("budgets.restrictedTitle")}
          description={t("budgets.restrictedDesc")}
        />
      </Section>
    );
  }

  const overdueCount = data.bills.filter((b) => b.computedStatus === "overdue").length;
  const dueSoonCount = data.bills.filter((b) => b.computedStatus === "due_soon").length;

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createBudgetAction({
      familyId,
      name: bName,
      category: bCategory,
      periodType: "monthly",
      periodStart: bStart,
      periodEnd: bEnd,
      limitNumeric: bLimit,
      alertThresholdPct: 80,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setBName("");
      setBudgetOpen(false);
      toast.success(t("budgets.createdToast"));
      router.refresh();
    }
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createBillAction({
      familyId,
      accountId: data.accounts[0]?.id ?? null,
      title: billTitle,
      payee: billPayee,
      category: "Utilities",
      amountNumeric: billAmount,
      dueOn: billDue,
      recurrenceFrequency: billFreq,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setBillTitle("");
      setBillPayee("");
      setBillAmount("");
      setBillOpen(false);
      toast.success(t("budgets.billCreatedToast"));
      router.refresh();
    }
  };

  const handlePayBill = async () => {
    if (!payTarget || !payAccountId) return;
    setBusy(true);
    const res = await payBillAction({
      familyId,
      billId: payTarget.id,
      accountId: payAccountId,
    });
    setBusy(false);
    setPayTarget(null);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("budgets.billPaidToast"));
      router.refresh();
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createRecurringScheduleAction({
      familyId,
      accountId: sAccount,
      kind: sKind,
      merchant: sMerchant,
      category: sKind === "income" ? "Income" : "Subscriptions",
      amountNumeric: sAmount,
      frequency: sFreq,
      nextRunOn: sNext,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setSMerchant("");
      setSAmount("");
      setScheduleOpen(false);
      toast.success(t("budgets.scheduleCreatedToast"));
      router.refresh();
    }
  };

  const handleRunDue = async () => {
    setBusy(true);
    const res = await runDueRecurringSchedulesAction({
      familyId,
      timezone: data.timezone,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("budgets.processedDueToast", { count: res.generatedCount ?? 0 }));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("budgets.title")}
        description={t("budgets.desc", { timezone: data.timezone })}
        actions={
          <div className="flex flex-wrap gap-2">
            {data.canManageBudgets && (
              <Button variant="secondary" size="sm" onClick={() => setBudgetOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("budgets.newBudgetBtn")}
              </Button>
            )}
            {data.canManageTransactions && (
              <Button size="sm" onClick={() => setBillOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("budgets.addBillBtn")}
              </Button>
            )}
          </div>
        }
      />

      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--tint-peach)] px-5 py-3.5 text-[13.5px] text-[var(--tint-peach-fg)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {overdueCount > 0 && <strong>{t("budgets.overdueCount", { count: overdueCount })}</strong>}
            {overdueCount > 0 && dueSoonCount > 0 && " · "}
            {dueSoonCount > 0 && <span>{t("budgets.dueSoonCount", { count: dueSoonCount })}</span>}
          </span>
        </div>
      )}

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "budgets", label: t("budgets.tab.budgets"), badge: data.budgets.length },
          { id: "bills", label: t("budgets.tab.bills"), badge: data.bills.filter((b) => b.computedStatus !== "paid").length },
          { id: "schedules", label: t("budgets.tab.schedules"), badge: data.schedules.length },
          { id: "history", label: t("budgets.tab.history"), badge: data.paymentHistory.length },
        ]}
      />

      {tab === "budgets" && (
        <div className="grid gap-5 md:grid-cols-2">
          {data.budgets.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                icon={<PieChart className="h-5 w-5" />}
                title={t("budgets.emptyTitle")}
                description={t("budgets.emptyDesc")}
              />
            </div>
          ) : (
            data.budgets.map((b) => {
              const barPct = Math.min(100, b.progress.percentUsed);
              return (
                <Card key={b.id} className="space-y-4 p-6">
                  <CardHeader className="mb-0">
                    <div>
                      <CardTitle>{b.name}</CardTitle>
                      <CardDescription>
                        {b.category} · {t("budgets.dateRange", {
                          start: formatLocalizedDate(b.periodStart, locale),
                          end: formatLocalizedDate(b.periodEnd, locale),
                        })}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        b.progress.alertState === "exceeded"
                          ? "danger"
                          : b.progress.alertState === "warning"
                          ? "peach"
                          : "sage"
                      }
                    >
                      {t("budgets.pctUsed", { pct: b.progress.percentUsed })}
                    </Badge>
                  </CardHeader>

                  <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        b.progress.alertState === "exceeded"
                          ? "bg-[var(--status-danger)]"
                          : b.progress.alertState === "warning"
                          ? "bg-[#E9B98B]"
                          : "bg-[var(--accent-primary)]"
                      )}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[13px] tabular-nums">
                    <span>
                      {t("budgets.spentLabel")}{" "}
                      <strong>
                        {formatNumericCurrency(b.progress.spentNumeric, data.currencyCode)}
                      </strong>
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {t("budgets.limitLabel", {
                        limit: formatNumericCurrency(b.progress.limitNumeric, data.currencyCode),
                      })}
                    </span>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === "bills" && (
        <div className="space-y-3">
          {data.bills.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title={t("budgets.billsEmptyTitle")}
              description={t("budgets.billsEmptyDesc")}
            />
          ) : (
            data.bills.map((bill) => (
              <Card
                key={bill.id}
                className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-[16px] font-semibold">
                      {bill.title}
                    </p>
                    <Badge
                      variant={
                        bill.computedStatus === "paid"
                          ? "sage"
                          : bill.computedStatus === "overdue"
                          ? "danger"
                          : bill.computedStatus === "due_soon"
                          ? "peach"
                          : "neutral"
                      }
                    >
                      {t(`budgets.billStatus.${bill.computedStatus}` as "budgets.billStatus.paid")}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-[var(--text-secondary)] tabular-nums">
                    {t("budgets.dueMeta", {
                      payee: bill.payee,
                      date: formatLocalizedDate(bill.dueOn, locale),
                      freq: t(`budgets.freq.${bill.recurrenceFrequency}` as "budgets.freq.monthly"),
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-heading text-[17px] font-bold tabular-nums">
                    {formatNumericCurrency(bill.amountNumeric, data.currencyCode)}
                  </span>
                  {bill.computedStatus !== "paid" &&
                    data.canManageTransactions &&
                    data.accounts.length > 0 && (
                      <Button size="sm" onClick={() => setPayTarget(bill)}>
                        <CheckCircle2 className="h-4 w-4" />
                        {t("budgets.markPaidBtn")}
                      </Button>
                    )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "schedules" && (
        <div className="space-y-4">
          {data.canManageTransactions && data.accounts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setScheduleOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("budgets.addScheduleBtn")}
              </Button>
              <Button variant="tonal" size="sm" isLoading={busy} onClick={handleRunDue}>
                <Play className="h-3.5 w-3.5" />
                {t("budgets.runDueBtn")}
              </Button>
            </div>
          )}

          {data.schedules.length === 0 ? (
            <EmptyState
              icon={<Repeat className="h-5 w-5" />}
              title={t("budgets.schedulesEmptyTitle")}
              description={t("budgets.schedulesEmptyDesc")}
            />
          ) : (
            <div className="space-y-2.5">
              {data.schedules.map((s) => (
                <Card key={s.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[15px]">{s.merchant}</p>
                      <Badge variant={s.kind === "income" ? "sage" : "neutral"}>
                        {t(`budgets.kind.${s.kind}` as "budgets.kind.income")}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                      {t("budgets.nextRunMeta", {
                        freq: t(`budgets.freq.${s.frequency}` as "budgets.freq.monthly"),
                        date: formatLocalizedDate(s.nextRunOn, locale),
                      })}
                    </p>
                  </div>
                  <span className="font-heading text-[16px] font-bold tabular-nums">
                    {formatNumericCurrency(s.amountNumeric, data.currencyCode)}
                  </span>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <Card className="divide-y divide-[var(--border-subtle)] p-2">
          {data.paymentHistory.length === 0 ? (
            <p className="p-6 text-center text-[13.5px] text-[var(--text-secondary)]">
              {t("budgets.historyEmpty")}
            </p>
          ) : (
            data.paymentHistory.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3 text-[13.5px]">
                <div className="flex items-center gap-2.5">
                  <CalendarClock className="h-4 w-4 text-[var(--accent-primary)]" />
                  <span className="font-medium">{h.billTitle}</span>
                </div>
                <div className="flex items-center gap-4 tabular-nums">
                  <span className="font-semibold">
                    {formatNumericCurrency(h.amountNumeric, data.currencyCode)}
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {formatLocalizedDate(h.paidAt, locale)}
                  </span>
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Modals */}
      <BottomSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} title={t("budgets.modal.budgetTitle")}>
        <form onSubmit={handleCreateBudget} className="space-y-4">
          <Input label={t("budgets.modal.budgetName")} required placeholder={t("budgets.modal.budgetPlaceholder")} value={bName} onChange={(e) => setBName(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("budgets.modal.category")} required value={bCategory} onChange={(e) => setBCategory(e.target.value)} />
            <Input label={t("budgets.modal.limit")} required value={bLimit} onChange={(e) => setBLimit(e.target.value)} className="tabular-nums" />
            <Input label={t("budgets.modal.periodStart")} type="date" value={bStart} onChange={(e) => setBStart(e.target.value)} />
            <Input label={t("budgets.modal.periodEnd")} type="date" value={bEnd} onChange={(e) => setBEnd(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>{t("budgets.modal.saveBudget")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={billOpen} onClose={() => setBillOpen(false)} title={t("budgets.modal.billTitle")}>
        <form onSubmit={handleCreateBill} className="space-y-4">
          <Input label={t("budgets.modal.billName")} required placeholder={t("budgets.modal.billPlaceholder")} value={billTitle} onChange={(e) => setBillTitle(e.target.value)} />
          <Input label={t("budgets.modal.payee")} required placeholder={t("budgets.modal.payeePlaceholder")} value={billPayee} onChange={(e) => setBillPayee(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label={t("budgets.modal.amount")} required placeholder="145.00" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} className="tabular-nums" />
            <Input label={t("budgets.modal.dueDate")} type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} />
            <Select label={t("budgets.modal.repeat")} value={billFreq} onChange={(e) => setBillFreq(e.target.value as typeof billFreq)} options={[{ value: "once", label: t("budgets.freq.once") }, { value: "monthly", label: t("budgets.freq.monthly") }, { value: "quarterly", label: t("budgets.freq.quarterly") }, { value: "yearly", label: t("budgets.freq.yearly") }]} />
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>{t("budgets.modal.scheduleBill")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={scheduleOpen} onClose={() => setScheduleOpen(false)} title={t("budgets.modal.scheduleTitle")}>
        <form onSubmit={handleCreateSchedule} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t("budgets.modal.type")} value={sKind} onChange={(e) => setSKind(e.target.value as typeof sKind)} options={[{ value: "expense", label: t("budgets.modal.typeExpense") }, { value: "income", label: t("budgets.modal.typeIncome") }]} />
            <Select label={t("budgets.modal.account")} value={sAccount} onChange={(e) => setSAccount(e.target.value)} options={data.accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </div>
          <Input label={t("budgets.modal.merchant")} required placeholder={t("budgets.modal.merchantPlaceholder")} value={sMerchant} onChange={(e) => setSMerchant(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label={t("budgets.modal.amount")} required placeholder="85.00" value={sAmount} onChange={(e) => setSAmount(e.target.value)} className="tabular-nums" />
            <Select label={t("budgets.modal.frequency")} value={sFreq} onChange={(e) => setSFreq(e.target.value as typeof sFreq)} options={[{ value: "weekly", label: t("budgets.freq.weekly") }, { value: "monthly", label: t("budgets.freq.monthly") }, { value: "yearly", label: t("budgets.freq.yearly") }]} />
            <Input label={t("budgets.modal.nextRun")} type="date" value={sNext} onChange={(e) => setSNext(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>{t("budgets.modal.saveSchedule")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={t("budgets.modal.payTitle")}
        description={
          payTarget
            ? t("budgets.modal.payDesc", {
                amount: formatNumericCurrency(payTarget.amountNumeric, data.currencyCode, toIntlLocale(locale)),
                payee: payTarget.payee,
              })
            : ""
        }
      >
        <div className="space-y-4">
          <Select
            label={t("budgets.modal.payFromAccount")}
            value={payAccountId}
            onChange={(e) => setPayAccountId(e.target.value)}
            options={data.accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <div className="flex flex-wrap justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setPayTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button isLoading={busy} onClick={handlePayBill}>
              {t("budgets.modal.confirmPayBtn")}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </Section>
  );
}
