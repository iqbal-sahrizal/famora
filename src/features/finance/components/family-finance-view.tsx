"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Building2,
  History,
  Landmark,
  Lock,
  Paperclip,
  Pencil,
  PiggyBank,
  Plus,
  RotateCcw,
  Search,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomSheet, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { formatLocalizedDate, toIntlLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  archiveFinanceAccountAction,
  createFinanceAccountAction,
  recordFinanceTransactionAction,
  reverseFinanceTransactionAction,
  updateFinanceAccountAction,
} from "../actions";
import { formatNumericCurrency, parseDecimalToMinorUnits } from "../money";
import type { FinanceAccountItem, FinancePageData, FinanceTransactionItem } from "../server";

const ACCOUNT_ICONS: Record<FinanceAccountItem["accountKind"], React.ReactNode> = {
  bank: <Landmark className="h-4 w-4" />,
  cash: <Banknote className="h-4 w-4" />,
  savings: <PiggyBank className="h-4 w-4" />,
  allowance: <Wallet className="h-4 w-4" />,
  custom: <Building2 className="h-4 w-4" />,
};

export function FamilyFinanceView({
  familyId,
  data,
}: {
  familyId: string;
  data: FinancePageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const intlLocale = toIntlLocale(locale);
  const [tab, setTab] = React.useState<"overview" | "audit">("overview");
  const [search, setSearch] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState("all");
  const [accountFilter, setAccountFilter] = React.useState("all");
  const [busy, setBusy] = React.useState(false);

  const [accountOpen, setAccountOpen] = React.useState(false);
  const [txOpen, setTxOpen] = React.useState(false);
  const [reverseTarget, setReverseTarget] =
    React.useState<FinanceTransactionItem | null>(null);
  const [reverseReason, setReverseReason] = React.useState("Entered in error");

  // Account form
  const [accName, setAccName] = React.useState("");
  const [accKind, setAccKind] =
    React.useState<FinanceAccountItem["accountKind"]>("bank");
  const [accScope, setAccScope] = React.useState<"family" | "personal">("family");
  const [accInitial, setAccInitial] = React.useState("0.00");

  // Edit / Archive account state
  const [editAccount, setEditAccount] = React.useState<FinanceAccountItem | null>(null);
  const [editAccName, setEditAccName] = React.useState("");
  const [editAccKind, setEditAccKind] =
    React.useState<FinanceAccountItem["accountKind"]>("bank");
  const [editAccScope, setEditAccScope] = React.useState<"family" | "personal">("family");
  const [editAccBudget, setEditAccBudget] = React.useState("0.00");
  const [archiveTarget, setArchiveTarget] = React.useState<FinanceAccountItem | null>(null);

  const activeAccounts = React.useMemo(
    () => data.accounts.filter((a) => !a.isArchived),
    [data.accounts]
  );
  const archivedAccounts = React.useMemo(
    () => data.accounts.filter((a) => a.isArchived),
    [data.accounts]
  );

  // Transaction form
  const [txAccountId, setTxAccountId] = React.useState(
    () => data.accounts.find((a) => !a.isArchived)?.id ?? ""
  );
  const [txKind, setTxKind] = React.useState<"expense" | "income" | "transfer">("expense");
  const [txAmount, setTxAmount] = React.useState("");
  const [txMerchant, setTxMerchant] = React.useState("");
  const [txCategory, setTxCategory] = React.useState("Groceries");
  const [txDate, setTxDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [txNotes, setTxNotes] = React.useState("");
  const [txTransferDst, setTxTransferDst] = React.useState(
    () => data.accounts.filter((a) => !a.isArchived)[1]?.id ?? ""
  );
  const [txAttachment, setTxAttachment] = React.useState("");
  const [selectedTx, setSelectedTx] = React.useState<FinanceTransactionItem | null>(null);

  if (!data.authorized) {
    return (
      <Section>
        <PageHeader
          title={t("finance.title")}
          description={t("finance.subtitle")}
        />
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={t("finance.restrictedTitle")}
          description={t("finance.restrictedDesc")}
        />
      </Section>
    );
  }

  const filteredTx = data.transactions.filter((t) => {
    if (kindFilter !== "all" && t.kind !== kindFilter) return false;
    if (accountFilter !== "all" && t.accountId !== accountFilter) return false;
    const q = search.trim().toLowerCase();
    if (
      q &&
      !t.merchant.toLowerCase().includes(q) &&
      !t.category.toLowerCase().includes(q) &&
      !t.notes.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const incomeMinor = parseDecimalToMinorUnits(data.totalIncomeNumeric);
  const expenseMinor = parseDecimalToMinorUnits(data.totalExpenseNumeric);
  const totalFlow = incomeMinor + expenseMinor;
  const incomePct =
    totalFlow > 0n ? Number((incomeMinor * 100n) / totalFlow) : 50;

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createFinanceAccountAction({
      familyId,
      name: accName,
      accountKind: accKind,
      ownershipScope: accScope,
      currencyCode: data.currencyCode,
      initialBalance: accInitial,
      monthlyBudget: "0.00",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setAccName("");
      setAccInitial("0.00");
      setAccountOpen(false);
      toast.success(t("finance.toast.accountCreated"));
      router.refresh();
    }
  };

  const openEditAccount = (acc: FinanceAccountItem) => {
    setEditAccount(acc);
    setEditAccName(acc.name);
    setEditAccKind(acc.accountKind);
    setEditAccScope(acc.ownershipScope);
    setEditAccBudget(acc.monthlyBudgetNumeric);
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAccount) return;
    setBusy(true);
    const res = await updateFinanceAccountAction({
      familyId,
      accountId: editAccount.id,
      name: editAccName,
      accountKind: editAccKind,
      ownershipScope: editAccScope,
      monthlyBudget: editAccBudget,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setEditAccount(null);
    toast.success(t("finance.toast.accountUpdated"));
    router.refresh();
  };

  const handleToggleArchiveAccount = async (acc: FinanceAccountItem, archive: boolean) => {
    setBusy(true);
    const res = await archiveFinanceAccountAction({
      familyId,
      accountId: acc.id,
      archive,
    });
    setBusy(false);
    setArchiveTarget(null);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(archive ? t("finance.toast.accountArchived") : t("finance.toast.accountRestored"));
    router.refresh();
  };

  const handleRecordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (txKind === "transfer" && txTransferDst && txTransferDst === txAccountId) {
      toast.error(t("finance.transferSameAccount"));
      return;
    }
    setBusy(true);
    const res = await recordFinanceTransactionAction({
      familyId,
      accountId: txAccountId,
      kind: txKind,
      amount: txAmount,
      merchant: txMerchant,
      category: txKind === "transfer" ? "Transfer" : txCategory,
      occurredOn: txDate,
      notes: txNotes,
      transferAccountId: txKind === "transfer" ? txTransferDst || null : null,
      attachmentName: txAttachment.trim() || null,
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setTxAmount("");
      setTxMerchant("");
      setTxNotes("");
      setTxAttachment("");
      setTxOpen(false);
      toast.success(t("finance.toast.txRecorded"));
      router.refresh();
    }
  };

  const handleConfirmReverse = async () => {
    if (!reverseTarget) return;
    setBusy(true);
    const res = await reverseFinanceTransactionAction({
      familyId,
      transactionId: reverseTarget.id,
      reason: reverseReason,
    });
    setBusy(false);
    setReverseTarget(null);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("finance.toast.txReversed"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("finance.title")}
        description={t("finance.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            {data.canManageAccounts && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAccountOpen(true)}
              >
                <Plus className="h-4 w-4" />
                {t("finance.newAccount")}
              </Button>
            )}
            {data.canManageTransactions && activeAccounts.length > 0 && (
              <Button size="sm" onClick={() => setTxOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("finance.recordTx")}
              </Button>
            )}
          </div>
        }
      />

      {/* Fintech Overview Hero */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card variant="sage" className="flex flex-col justify-between gap-6 p-7">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-wider opacity-75">
              {t("finance.totalBalance")}
            </p>
            <p className="mt-1 font-heading text-[28px] sm:text-[38px] font-bold leading-none tabular-nums break-words">
              {formatNumericCurrency(data.totalBalanceNumeric, data.currencyCode, intlLocale)}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] font-medium tabular-nums">
              <span>
                {t("finance.income")}: {formatNumericCurrency(data.totalIncomeNumeric, data.currencyCode, intlLocale)}
              </span>
              <span>
                {t("finance.expenses")}: {formatNumericCurrency(data.totalExpenseNumeric, data.currencyCode, intlLocale)}
              </span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface)]/70">
              <div
                className="h-full bg-[var(--accent-primary)] transition-all"
                style={{ width: `${incomePct}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Accounts Strip */}
        <Card className="space-y-4 p-6">
          <CardHeader className="mb-0">
            <div>
              <CardTitle>Accounts ({activeAccounts.length})</CardTitle>
              <CardDescription>{t("finance.accountsSubtitle")}</CardDescription>
            </div>
          </CardHeader>
          {activeAccounts.length === 0 ? (
            <p className="text-[13.5px] text-[var(--text-secondary)]">
              Create your first bank, cash, or savings account to start tracking.
            </p>
          ) : (
            <div className="space-y-2.5">
              {activeAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--bg-subtle)] px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--accent-primary)]">
                      {ACCOUNT_ICONS[acc.accountKind]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{acc.name}</p>
                      <p className="text-[11.5px] text-[var(--text-muted)]">
                        {acc.accountKind} · {acc.ownershipScope}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        "font-heading text-[15.5px] font-bold tabular-nums mr-1",
                        acc.balanceNumeric.startsWith("-") && "text-[var(--accent-danger)]"
                      )}
                    >
                      {formatNumericCurrency(acc.balanceNumeric, acc.currencyCode, intlLocale)}
                    </span>
                    {data.canManageAccounts && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${acc.name}`}
                          onClick={() => openEditAccount(acc)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Archive ${acc.name}`}
                          onClick={() => setArchiveTarget(acc)}
                        >
                          <Archive className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {archivedAccounts.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Archived ({archivedAccounts.length})
              </p>
              {archivedAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between rounded-xl bg-[var(--bg-subtle)]/60 px-3.5 py-2 text-[13px] opacity-75"
                >
                  <span className="truncate font-medium">{acc.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums">
                      {formatNumericCurrency(acc.balanceNumeric, acc.currencyCode)}
                    </span>
                    {data.canManageAccounts && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Restore ${acc.name}`}
                        disabled={busy}
                        onClick={() => handleToggleArchiveAccount(acc, false)}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "overview", label: t("finance.tab.timeline"), badge: data.transactions.length },
          { id: "audit", label: t("finance.tab.audit"), badge: data.auditHistory.length },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder={t("finance.searchPlaceholder")}
              leadingIcon={<Search className="h-4 w-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label={t("finance.filterTypeAria")}
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              options={[
                { value: "all", label: t("finance.filter.allTypes") },
                { value: "expense", label: t("finance.filter.expenses") },
                { value: "income", label: t("finance.filter.income") },
                { value: "transfer", label: t("finance.filter.transfers") },
                { value: "reversal", label: t("finance.filter.reversals") },
              ]}
            />
            <Select
              aria-label={t("finance.filterAccountAria")}
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              options={[
                { value: "all", label: t("finance.filter.allAccounts") },
                ...data.accounts.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </div>

          {filteredTx.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title={t("finance.emptyTxTitle")}
              description={t("finance.emptyTxDesc")}
            />
          ) : (
            <Card className="divide-y divide-[var(--border-subtle)] p-2">
              {filteredTx.map((tx) => (
                <div
                  key={tx.id}
                  className={cn(
                    "flex flex-col justify-between gap-3 px-4 py-3.5 sm:flex-row sm:items-center",
                    tx.isReversed && "opacity-55"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTx(tx)}
                    className="flex min-w-0 flex-1 items-start gap-3.5 text-left cursor-pointer"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        tx.kind === "income"
                          ? "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]"
                          : tx.kind === "transfer"
                          ? "bg-[var(--tint-lavender)] text-[var(--tint-lavender-fg)]"
                          : "bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                      )}
                    >
                      {tx.kind === "income" ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : tx.kind === "transfer" ? (
                        <ArrowLeftRight className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-[15px] font-semibold">
                          {tx.merchant}
                        </p>
                        <Badge variant="neutral">{tx.category}</Badge>
                        {tx.isReversed && <Badge variant="peach">Reversed</Badge>}
                        {tx.attachmentName && (
                          <Badge variant="lavender">
                            <Paperclip className="h-3 w-3" /> {tx.attachmentName}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)]">
                        {tx.accountName} · {tx.occurredOn} · {tx.memberName}
                        {tx.notes ? ` — ${tx.notes}` : ""}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span
                      className={cn(
                        "font-heading text-[16px] font-bold tabular-nums",
                        tx.kind === "income"
                          ? "text-[var(--accent-primary)]"
                          : "text-[var(--text-primary)]"
                      )}
                    >
                      {tx.kind === "income" ? "+" : tx.kind === "expense" ? "-" : ""}
                      {formatNumericCurrency(tx.amountNumeric, data.currencyCode, intlLocale)}
                    </span>

                    {!tx.isReversed &&
                      tx.kind !== "reversal" &&
                      data.canManageTransactions && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReverseTarget(tx)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reverse
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === "audit" && (
        <Card className="divide-y divide-[var(--border-subtle)] p-2">
          {data.auditHistory.length === 0 ? (
            <p className="p-6 text-center text-[13.5px] text-[var(--text-secondary)]">
              No financial audit events yet.
            </p>
          ) : (
            data.auditHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3 text-[13px]"
              >
                <div className="flex items-center gap-2.5">
                  <History className="h-4 w-4 text-[var(--accent-primary)]" />
                  <span className="font-medium">{item.eventType}</span>
                </div>
                <div className="flex items-center gap-4 tabular-nums">
                  {item.amountNumeric && (
                    <span className="font-semibold">
                      {formatNumericCurrency(item.amountNumeric, data.currencyCode)}
                    </span>
                  )}
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {formatLocalizedDate(item.createdAt, locale)}
                  </span>
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Create Account Sheet */}
      <BottomSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={t("finance.modal.createAccountTitle")}
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <Input
            label={t("finance.modal.accountNameLabel")}
            required
            placeholder={t("finance.accountNamePlaceholder")}
            value={accName}
            onChange={(e) => setAccName(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("finance.modal.accountTypeLabel")}
              value={accKind}
              onChange={(e) =>
                setAccKind(e.target.value as FinanceAccountItem["accountKind"])
              }
              options={[
                { value: "bank", label: t("finance.accType.bank") },
                { value: "cash", label: t("finance.accType.cash") },
                { value: "savings", label: t("finance.accType.savings") },
                { value: "allowance", label: t("finance.accType.allowance") },
                { value: "custom", label: t("finance.accType.custom") },
              ]}
            />
            <Select
              label={t("finance.modal.visibilityLabel")}
              value={accScope}
              onChange={(e) =>
                setAccScope(e.target.value as "family" | "personal")
              }
              options={[
                { value: "family", label: t("finance.vis.family") },
                { value: "personal", label: t("finance.vis.personal") },
              ]}
            />
          </div>
          <Input
            label={t("finance.modal.openingBalance")}
            value={accInitial}
            onChange={(e) => setAccInitial(e.target.value)}
            className="tabular-nums"
          />
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("finance.modal.createAccountBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Record Transaction Sheet */}
      <BottomSheet
        open={txOpen}
        onClose={() => setTxOpen(false)}
        title={t("finance.modal.recordTxTitle")}
      >
        <form onSubmit={handleRecordTx} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("finance.modal.txTypeLabel")}
              value={txKind}
              onChange={(e) => setTxKind(e.target.value as typeof txKind)}
              options={[
                { value: "expense", label: t("finance.txType.expense") },
                { value: "income", label: t("finance.txType.income") },
                { value: "transfer", label: t("finance.txType.transfer") },
              ]}
            />
            <Input
              label={t("finance.modal.amountLabel")}
              required
              placeholder="45.50"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              className="tabular-nums"
            />
          </div>

          <Select
            label={txKind === "transfer" ? t("finance.modal.fromAccount") : t("finance.modal.accountLabel")}
            value={txAccountId}
            onChange={(e) => setTxAccountId(e.target.value)}
            options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
          />

          {txKind === "transfer" && (
            <Select
              label={t("finance.modal.toAccount")}
              value={txTransferDst}
              onChange={(e) => setTxTransferDst(e.target.value)}
              options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          )}

          <Input
            label={txKind === "transfer" ? t("finance.modal.transferDescLabel") : t("finance.modal.merchantLabel")}
            required
            placeholder={t("finance.merchantPlaceholder")}
            value={txMerchant}
            onChange={(e) => setTxMerchant(e.target.value)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {txKind !== "transfer" && (
              <Input
                label={t("finance.modal.categoryLabel")}
                value={txCategory}
                onChange={(e) => setTxCategory(e.target.value)}
              />
            )}
            <Input
              label={t("finance.modal.dateLabel")}
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
            />
          </div>

          <Input
            label={t("finance.modal.notesLabel")}
            placeholder={t("finance.notesPlaceholder")}
            value={txNotes}
            onChange={(e) => setTxNotes(e.target.value)}
          />
          <Input
            label={t("finance.modal.receiptLabel")}
            placeholder={t("finance.receiptPlaceholder")}
            value={txAttachment}
            onChange={(e) => setTxAttachment(e.target.value)}
          />

          <Button type="submit" className="w-full" isLoading={busy}>
            {t("finance.modal.saveTxBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Safe Reversal Dialog */}
      <Dialog
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title={t("finance.modal.reverseTitle")}
        description={t("finance.modal.reverseDesc")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReverseTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" isLoading={busy} onClick={handleConfirmReverse}>
              {t("finance.modal.confirmReverseBtn")}
            </Button>
          </>
        }
      >
        <Input
          label={t("finance.modal.reverseReasonLabel")}
          value={reverseReason}
          onChange={(e) => setReverseReason(e.target.value)}
        />
      </Dialog>

      {/* Edit Account Sheet */}
      <BottomSheet
        open={Boolean(editAccount)}
        onClose={() => setEditAccount(null)}
        title={t("finance.modal.editAccountTitle")}
      >
        <form onSubmit={handleUpdateAccount} className="space-y-4">
          <Input
            label={t("finance.modal.accountNameLabel")}
            required
            value={editAccName}
            onChange={(e) => setEditAccName(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("finance.modal.accountTypeLabel")}
              value={editAccKind}
              onChange={(e) =>
                setEditAccKind(e.target.value as FinanceAccountItem["accountKind"])
              }
              options={[
                { value: "bank", label: t("finance.accType.bank") },
                { value: "cash", label: t("finance.accType.cash") },
                { value: "savings", label: t("finance.accType.savings") },
                { value: "allowance", label: t("finance.accType.allowance") },
                { value: "custom", label: t("finance.accType.custom") },
              ]}
            />
            <Select
              label={t("finance.modal.visibilityLabel")}
              value={editAccScope}
              onChange={(e) =>
                setEditAccScope(e.target.value as "family" | "personal")
              }
              options={[
                { value: "family", label: t("finance.vis.family") },
                { value: "personal", label: t("finance.vis.personal") },
              ]}
            />
          </div>
          <Input
            label={t("finance.modal.monthlyBudgetLabel")}
            value={editAccBudget}
            onChange={(e) => setEditAccBudget(e.target.value)}
            className="tabular-nums"
          />
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("common.saveChanges")}
          </Button>
        </form>
      </BottomSheet>

      {/* Archive Account Dialog */}
      <Dialog
        open={Boolean(archiveTarget)}
        onClose={() => !busy && setArchiveTarget(null)}
        title={t("finance.modal.archiveTitle")}
        description={
          archiveTarget
            ? t("finance.modal.archiveDesc", { name: archiveTarget.name })
            : undefined
        }
        footer={
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setArchiveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={busy}
              onClick={() =>
                archiveTarget && handleToggleArchiveAccount(archiveTarget, true)
              }
            >
              Archive Account
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-[var(--text-secondary)]">
          You can restore this account later at any time.
        </p>
      </Dialog>

      {/* Transaction Detail Sheet */}
      <BottomSheet
        open={Boolean(selectedTx)}
        onClose={() => setSelectedTx(null)}
        title={t("finance.txDetailTitle")}
      >
        {selectedTx && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-heading text-[18px] font-bold break-words">
                  {selectedTx.merchant}
                </p>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  {selectedTx.accountName} · {selectedTx.occurredOn}
                </p>
              </div>
              <span
                className={cn(
                  "font-heading text-[18px] font-bold tabular-nums shrink-0",
                  selectedTx.kind === "income"
                    ? "text-[var(--accent-primary)]"
                    : "text-[var(--text-primary)]"
                )}
              >
                {selectedTx.kind === "income" ? "+" : selectedTx.kind === "expense" ? "-" : ""}
                {formatNumericCurrency(selectedTx.amountNumeric, data.currencyCode, intlLocale)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral">{selectedTx.category}</Badge>
              <Badge variant="neutral">{selectedTx.memberName}</Badge>
              {selectedTx.isReversed && <Badge variant="peach">Reversed</Badge>}
            </div>
            {selectedTx.notes && (
              <p className="rounded-2xl bg-[var(--bg-subtle)] p-3.5 text-[13.5px]">
                {selectedTx.notes}
              </p>
            )}
            {selectedTx.attachmentName && (
              <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                <Paperclip className="h-3.5 w-3.5" />
                {selectedTx.attachmentName}
              </p>
            )}
          </div>
        )}
      </BottomSheet>
    </Section>
  );
}
