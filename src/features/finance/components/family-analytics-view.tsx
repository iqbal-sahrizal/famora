"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Download,
  Lock,
  PiggyBank,
  Plus,
  Scale,
  TrendingUp,
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
import { formatLocalizedDate, toIntlLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  buildCategoryBreakdown,
  buildMonthlyCashFlow,
  computePeriodSummary,
  exportTransactionsCsv,
  filterTransactionsByDateRange,
} from "../analytics";
import {
  contributeToGoalAction,
  createDebtReceivableAction,
  createFinanceGoalAction,
  recordDebtPaymentAction,
} from "../analytics-actions";
import type { AnalyticsPageData } from "../analytics-server";
import { formatNumericCurrency, parseDecimalToMinorUnits } from "../money";

type RangePreset = "30d" | "90d" | "180d";

function getDateWindow(days: number): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
} {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startD = new Date(now.getTime() - days * 86_400_000);
  const prevEndD = new Date(startD.getTime() - 86_400_000);
  const prevStartD = new Date(prevEndD.getTime() - days * 86_400_000);
  return {
    start: startD.toISOString().slice(0, 10),
    end,
    prevStart: prevStartD.toISOString().slice(0, 10),
    prevEnd: prevEndD.toISOString().slice(0, 10),
  };
}

export function FamilyAnalyticsView({
  familyId,
  data,
}: {
  familyId: string;
  data: AnalyticsPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const intlLocale = toIntlLocale(locale);
  const [range, setRange] = React.useState<RangePreset>("30d");
  const [activeFlowMonth, setActiveFlowMonth] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"reports" | "goals" | "debts">("reports");
  const [busy, setBusy] = React.useState(false);

  const [goalOpen, setGoalOpen] = React.useState(false);
  const [goalTitle, setGoalTitle] = React.useState("");
  const [goalTarget, setGoalTarget] = React.useState("1000.00");

  const [contribGoalId, setContribGoalId] = React.useState<string | null>(null);
  const [contribAmount, setContribAmount] = React.useState("100.00");

  const [debtOpen, setDebtOpen] = React.useState(false);
  const [debtKind, setDebtKind] = React.useState<"debt" | "receivable">("debt");
  const [debtTitle, setDebtTitle] = React.useState("");
  const [debtCounterparty, setDebtCounterparty] = React.useState("");
  const [debtPrincipal, setDebtPrincipal] = React.useState("500.00");

  const [payDebtId, setPayDebtId] = React.useState<string | null>(null);
  const [payDebtAmount, setPayDebtAmount] = React.useState("50.00");

  if (!data.authorized) {
    return (
      <Section>
        <PageHeader title={t("analytics.title")} description={t("analytics.restrictedHeaderDesc")} />
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("analytics.restrictedTitle")}
          description={t("analytics.restrictedDesc")}
        />
      </Section>
    );
  }

  const days = range === "30d" ? 30 : range === "90d" ? 90 : 180;
  const win = getDateWindow(days);
  const currentTxs = filterTransactionsByDateRange(data.transactions, win.start, win.end);
  const prevTxs = filterTransactionsByDateRange(data.transactions, win.prevStart, win.prevEnd);

  const summary = computePeriodSummary(currentTxs);
  const prevSummary = computePeriodSummary(prevTxs);
  const categories = buildCategoryBreakdown(currentTxs);
  const cashFlow = buildMonthlyCashFlow(currentTxs);

  const maxFlowMinor = cashFlow.reduce((max, pt) => {
    const inc = parseDecimalToMinorUnits(pt.incomeNumeric);
    const exp = parseDecimalToMinorUnits(pt.expenseNumeric);
    return inc > max ? inc : exp > max ? exp : max;
  }, 1n);

  const handleExportCsv = () => {
    const csv = exportTransactionsCsv(currentTxs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `famora-finance-report-${win.start}-to-${win.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("analytics.csvExportedToast"));
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createFinanceGoalAction({
      familyId,
      title: goalTitle,
      targetNumeric: goalTarget,
      targetDate: null,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setGoalTitle("");
      setGoalOpen(false);
      toast.success(t("analytics.goalCreatedToast"));
      router.refresh();
    }
  };

  const handleContributeGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribGoalId) return;
    setBusy(true);
    const res = await contributeToGoalAction({
      familyId,
      goalId: contribGoalId,
      amountNumeric: contribAmount,
      notes: "",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setContribGoalId(null);
      toast.success(t("analytics.contribSavedToast"));
      router.refresh();
    }
  };

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createDebtReceivableAction({
      familyId,
      kind: debtKind,
      counterparty: debtCounterparty,
      title: debtTitle,
      principalNumeric: debtPrincipal,
      dueOn: null,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setDebtTitle("");
      setDebtCounterparty("");
      setDebtOpen(false);
      toast.success(t("analytics.debtCreatedToast"));
      router.refresh();
    }
  };

  const handleRecordDebtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDebtId) return;
    setBusy(true);
    const res = await recordDebtPaymentAction({
      familyId,
      debtId: payDebtId,
      amountNumeric: payDebtAmount,
      notes: "",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setPayDebtId(null);
      toast.success(t("analytics.debtPaidToast"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("analytics.title")}
        description={t("analytics.desc")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label={t("analytics.rangeAria")}
              value={range}
              onChange={(e) => setRange(e.target.value as RangePreset)}
              options={[
                { value: "30d", label: t("analytics.range30") },
                { value: "90d", label: t("analytics.range90") },
                { value: "180d", label: t("analytics.range180") },
              ]}
            />
            <Button variant="secondary" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              {t("analytics.exportCsvBtn")}
            </Button>
          </div>
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "reports", label: t("analytics.tab.reports") },
          { id: "goals", label: t("analytics.tab.goals"), badge: data.goals.length },
          { id: "debts", label: t("analytics.tab.debts"), badge: data.debtsReceivables.length },
        ]}
      />

      {tab === "reports" && (
        <div className="space-y-8">
          {/* Period Comparison Strip */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card variant="sage" className="min-w-0 p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wider opacity-80">
                {t("analytics.periodIncome")}
              </p>
              <p className="mt-1 font-heading text-[22px] sm:text-[26px] font-bold tabular-nums break-words">
                {formatNumericCurrency(summary.incomeNumeric, data.currencyCode, intlLocale)}
              </p>
              <p className="mt-1 text-[12px] opacity-80 tabular-nums break-words">
                {t("analytics.priorPeriod", {
                  amount: formatNumericCurrency(prevSummary.incomeNumeric, data.currencyCode, intlLocale),
                })}
              </p>
            </Card>

            <Card variant="peach" className="min-w-0 p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wider opacity-80">
                {t("analytics.periodExpense")}
              </p>
              <p className="mt-1 font-heading text-[22px] sm:text-[26px] font-bold tabular-nums break-words">
                {formatNumericCurrency(summary.expenseNumeric, data.currencyCode, intlLocale)}
              </p>
              <p className="mt-1 text-[12px] opacity-80 tabular-nums break-words">
                {t("analytics.priorPeriod", {
                  amount: formatNumericCurrency(prevSummary.expenseNumeric, data.currencyCode, intlLocale),
                })}
              </p>
            </Card>

            <Card className="min-w-0 p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t("analytics.netCashFlow")}
              </p>
              <p className="mt-1 font-heading text-[22px] sm:text-[26px] font-bold tabular-nums break-words">
                {formatNumericCurrency(summary.netCashFlowNumeric, data.currencyCode, intlLocale)}
              </p>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)] tabular-nums break-words">
                {t("budgets.dateRange", {
                  start: formatLocalizedDate(win.start, locale),
                  end: formatLocalizedDate(win.end, locale),
                })}
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
            {/* Cash Flow Chart */}
            <Card className="space-y-4 p-6">
              <CardHeader className="mb-0">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[var(--accent-primary)]" />
                  <CardTitle>{t("analytics.monthlyCashFlow")}</CardTitle>
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-primary)]" />
                    {t("analytics.incomeLegend")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E9B98B]" />
                    {t("analytics.expenseLegend")}
                  </span>
                </div>
              </CardHeader>

              {cashFlow.length === 0 ? (
                <EmptyState
                  icon={<BarChart3 className="h-5 w-5" />}
                  title={t("analytics.noCashFlowTitle")}
                  description={t("analytics.noCashFlowDesc")}
                />
              ) : (
                <div className="space-y-3">
                  {activeFlowMonth && (() => {
                    const activePt = cashFlow.find((p) => p.monthKey === activeFlowMonth);
                    if (!activePt) return null;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--bg-subtle)] px-3 py-2 text-[12.5px] tabular-nums">
                        <span className="font-semibold">{activePt.monthKey}</span>
                        <div className="flex flex-wrap gap-3">
                          <span className="text-[var(--accent-primary)] font-medium">
                            {t("analytics.incomeLegend")}: {formatNumericCurrency(activePt.incomeNumeric, data.currencyCode, intlLocale)}
                          </span>
                          <span className="font-medium">
                            {t("analytics.expenseLegend")}: {formatNumericCurrency(activePt.expenseNumeric, data.currencyCode, intlLocale)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="overflow-x-auto pb-1">
                    <div className="flex h-52 min-w-[480px] items-end gap-4 pt-6">
                      {cashFlow.map((pt) => {
                        const incH = Math.max(
                          8,
                          Number((parseDecimalToMinorUnits(pt.incomeNumeric) * 100n) / maxFlowMinor)
                        );
                        const expH = Math.max(
                          8,
                          Number((parseDecimalToMinorUnits(pt.expenseNumeric) * 100n) / maxFlowMinor)
                        );
                        const isSelected = activeFlowMonth === pt.monthKey;
                        return (
                          <button
                            key={pt.monthKey}
                            type="button"
                            onClick={() =>
                              setActiveFlowMonth((prev) => (prev === pt.monthKey ? null : pt.monthKey))
                            }
                            aria-label={`${pt.monthKey}: ${t("analytics.incomeLegend")} ${formatNumericCurrency(pt.incomeNumeric, data.currencyCode, intlLocale)}, ${t("analytics.expenseLegend")} ${formatNumericCurrency(pt.expenseNumeric, data.currencyCode, intlLocale)}`}
                            className={cn(
                              "flex flex-1 flex-col items-center gap-2 rounded-xl p-1 transition-colors cursor-pointer",
                              isSelected && "bg-[var(--bg-subtle)]"
                            )}
                          >
                            <div className="flex h-36 w-full items-end justify-center gap-1.5">
                              <div
                                title={`${t("analytics.incomeLegend")}: ${formatNumericCurrency(pt.incomeNumeric, data.currencyCode, intlLocale)}`}
                                style={{ height: `${incH}%` }}
                                className="w-4 sm:w-6 rounded-t-lg bg-[var(--accent-primary)] transition-all"
                              />
                              <div
                                title={`${t("analytics.expenseLegend")}: ${formatNumericCurrency(pt.expenseNumeric, data.currencyCode, intlLocale)}`}
                                style={{ height: `${expH}%` }}
                                className="w-4 sm:w-6 rounded-t-lg bg-[#E9B98B] transition-all"
                              />
                            </div>
                            <span className="text-[11.5px] font-medium text-[var(--text-secondary)] tabular-nums">
                              {pt.monthKey}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Category Breakdown */}
            <Card className="space-y-4 p-6">
              <CardHeader className="mb-0">
                <CardTitle>{t("analytics.spendingBreakdown")}</CardTitle>
              </CardHeader>
              {categories.length === 0 ? (
                <p className="text-[13.5px] text-[var(--text-secondary)]">
                  {t("analytics.noExpenses")}
                </p>
              ) : (
                <div className="space-y-3">
                  {categories.map((cat) => (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex justify-between text-[13px] tabular-nums">
                        <span className="font-medium">{cat.category}</span>
                        <span>
                          {formatNumericCurrency(cat.amountNumeric, data.currencyCode)} ({cat.sharePct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent-primary)]"
                          style={{ width: `${cat.sharePct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "goals" && (
        <div className="space-y-5">
          {data.canManageTransactions && (
            <Button size="sm" onClick={() => setGoalOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("analytics.newGoalBtn")}
            </Button>
          )}
          {data.goals.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="h-5 w-5" />}
              title={t("analytics.goalsEmptyTitle")}
              description={t("analytics.goalsEmptyDesc")}
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {data.goals.map((g) => {
                const cur = parseDecimalToMinorUnits(g.currentNumeric);
                const tgt = parseDecimalToMinorUnits(g.targetNumeric);
                const pct = tgt > 0n ? Math.min(100, Number((cur * 100n) / tgt)) : 0;
                return (
                  <Card key={g.id} className="space-y-4 p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle>{g.title}</CardTitle>
                        <CardDescription className="tabular-nums">
                          {t("analytics.goalProgress", {
                            current: formatNumericCurrency(g.currentNumeric, data.currencyCode),
                            target: formatNumericCurrency(g.targetNumeric, data.currencyCode),
                          })}
                        </CardDescription>
                      </div>
                      <Badge variant={g.status === "completed" ? "sage" : "lavender"}>
                        {pct}%
                      </Badge>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent-primary)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {g.status === "active" && data.canManageTransactions && (
                      <Button
                        variant="tonal"
                        size="sm"
                        onClick={() => setContribGoalId(g.id)}
                      >
                        {t("analytics.addContributionBtn")}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "debts" && (
        <div className="space-y-5">
          {data.canManageTransactions && (
            <Button size="sm" onClick={() => setDebtOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("analytics.newDebtBtn")}
            </Button>
          )}
          {data.debtsReceivables.length === 0 ? (
            <EmptyState
              icon={<Scale className="h-5 w-5" />}
              title={t("analytics.debtsEmptyTitle")}
              description={t("analytics.debtsEmptyDesc")}
            />
          ) : (
            <div className="space-y-3">
              {data.debtsReceivables.map((d) => (
                <Card key={d.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-heading text-[16px] font-semibold">{d.title}</p>
                      <Badge variant={d.kind === "debt" ? "blush" : "sage"}>
                        {t(`analytics.kind.${d.kind}` as "analytics.kind.debt")}
                      </Badge>
                      <Badge variant={d.status === "settled" ? "sage" : "neutral"}>
                        {t(`analytics.status.${d.status}` as "analytics.status.open")}
                      </Badge>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] tabular-nums">
                      {t("analytics.remainingOf", {
                        counterparty: d.counterparty,
                        remaining: formatNumericCurrency(d.remainingNumeric, data.currencyCode),
                        principal: formatNumericCurrency(d.principalNumeric, data.currencyCode),
                      })}
                    </p>
                  </div>
                  {d.status === "open" && data.canManageTransactions && (
                    <Button size="sm" variant="secondary" onClick={() => setPayDebtId(d.id)}>
                      {t("analytics.recordPaymentBtn")}
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sheets */}
      <BottomSheet open={goalOpen} onClose={() => setGoalOpen(false)} title={t("analytics.modal.goalTitle")}>
        <form onSubmit={handleCreateGoal} className="space-y-4">
          <Input label={t("analytics.modal.goalName")} required placeholder={t("analytics.modal.goalPlaceholder")} value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} />
          <Input label={t("analytics.modal.targetAmount")} required value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} className="tabular-nums" />
          <Button type="submit" className="w-full" isLoading={busy}>{t("analytics.modal.createGoalBtn")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={Boolean(contribGoalId)} onClose={() => setContribGoalId(null)} title={t("analytics.modal.contribTitle")}>
        <form onSubmit={handleContributeGoal} className="space-y-4">
          <Input label={t("analytics.modal.contribAmount")} required value={contribAmount} onChange={(e) => setContribAmount(e.target.value)} className="tabular-nums" />
          <Button type="submit" className="w-full" isLoading={busy}>{t("analytics.modal.saveContribBtn")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={debtOpen} onClose={() => setDebtOpen(false)} title={t("analytics.modal.debtTitle")}>
        <form onSubmit={handleCreateDebt} className="space-y-4">
          <Select label={t("analytics.modal.debtType")} value={debtKind} onChange={(e) => setDebtKind(e.target.value as typeof debtKind)} options={[{ value: "debt", label: t("analytics.modal.debtOption") }, { value: "receivable", label: t("analytics.modal.receivableOption") }]} />
          <Input label={t("analytics.modal.title")} required placeholder={t("analytics.modal.debtPlaceholder")} value={debtTitle} onChange={(e) => setDebtTitle(e.target.value)} />
          <Input label={t("analytics.modal.counterparty")} required placeholder={t("analytics.modal.counterpartyPlaceholder")} value={debtCounterparty} onChange={(e) => setDebtCounterparty(e.target.value)} />
          <Input label={t("analytics.modal.principal")} required value={debtPrincipal} onChange={(e) => setDebtPrincipal(e.target.value)} className="tabular-nums" />
          <Button type="submit" className="w-full" isLoading={busy}>{t("analytics.modal.saveRecordBtn")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={Boolean(payDebtId)} onClose={() => setPayDebtId(null)} title={t("analytics.modal.payDebtTitle")}>
        <form onSubmit={handleRecordDebtPayment} className="space-y-4">
          <Input label={t("analytics.modal.payAmount")} required value={payDebtAmount} onChange={(e) => setPayDebtAmount(e.target.value)} className="tabular-nums" />
          <Button type="submit" className="w-full" isLoading={busy}>{t("analytics.recordPaymentBtn")}</Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
