"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Check,
  Gift,
  HeartHandshake,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { formatLocalizedDate } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import {
  createChoreTemplateAction,
  createFamilyChallengeAction,
  createRewardAction,
  deleteChoreTemplateAction,
  deleteRewardAction,
  redeemRewardAction,
  reviewChoreSubmissionAction,
  submitChoreCompletionAction,
  updateChoreTemplateAction,
  updateRewardAction,
} from "../actions";
import type { ChoresPageData } from "../server";

export function ChoresRewardsView({
  familyId,
  data,
}: {
  familyId: string;
  data: ChoresPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [tab, setTab] = React.useState<"chores" | "rewards" | "approvals" | "history">("chores");
  const [busy, setBusy] = React.useState(false);

  const [choreOpen, setChoreOpen] = React.useState(false);
  const [editingChoreId, setEditingChoreId] = React.useState<string | null>(null);
  const [rewardOpen, setRewardOpen] = React.useState(false);
  const [editingRewardId, setEditingRewardId] = React.useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = React.useState(false);

  // Forms
  const [choreTitle, setChoreTitle] = React.useState("");
  const [chorePoints, setChorePoints] = React.useState("15");
  const [choreSchedule, setChoreSchedule] = React.useState<"daily" | "weekly" | "monthly" | "once">("daily");
  const [choreAssignee, setChoreAssignee] = React.useState("");

  const [rewardTitle, setRewardTitle] = React.useState("");
  const [rewardCost, setRewardCost] = React.useState("50");

  const [challengeTitle, setChallengeTitle] = React.useState("");
  const [challengeTarget, setChallengeTarget] = React.useState("15");

  const pendingSubmissions = data.submissions.filter(
    (s) => s.status === "pending_approval"
  );

  const handleSubmitChore = async (item: ChoresPageData["templates"][number]) => {
    setBusy(true);
    const res = await submitChoreCompletionAction({
      familyId,
      templateId: item.id,
      title: item.title,
      pointsValue: item.defaultPoints,
      note: "",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("chores.submittedToast"));
      router.refresh();
    }
  };

  const handleReview = async (submissionId: string, approved: boolean) => {
    setBusy(true);
    const res = await reviewChoreSubmissionAction({
      familyId,
      submissionId,
      approved,
      note: "",
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(approved ? t("chores.approvedToast") : t("chores.sentBackToast"));
      router.refresh();
    }
  };

  const handleRedeem = async (rewardId: string, title: string) => {
    setBusy(true);
    const res = await redeemRewardAction({ familyId, rewardId });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("chores.redeemedToast", { title }));
      router.refresh();
    }
  };

  const handleCreateChore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = editingChoreId
      ? await updateChoreTemplateAction({
          familyId,
          templateId: editingChoreId,
          title: choreTitle,
          description: "",
          defaultPoints: Number(chorePoints) || 10,
          scheduleRule: choreSchedule,
          category: "household",
          assignedMemberId: choreAssignee || null,
        })
      : await createChoreTemplateAction({
          familyId,
          title: choreTitle,
          description: "",
          defaultPoints: Number(chorePoints) || 10,
          scheduleRule: choreSchedule,
          category: "household",
          assignedMemberId: choreAssignee || null,
        });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setChoreTitle("");
      setEditingChoreId(null);
      setChoreOpen(false);
      toast.success(t("chores.addedToast"));
      router.refresh();
    }
  };

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createRewardAction({
      familyId,
      title: rewardTitle,
      description: "",
      costPoints: Number(rewardCost) || 50,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setRewardTitle("");
      setRewardOpen(false);
      toast.success(t("chores.rewardAddedToast"));
      router.refresh();
    }
  };

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createFamilyChallengeAction({
      familyId,
      title: challengeTitle,
      description: t("chores.challengeDefaultDesc"),
      targetChores: Number(challengeTarget) || 15,
      bonusPoints: 25,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setChallengeTitle("");
      setChallengeOpen(false);
      toast.success(t("chores.challengeStartedToast"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("chores.title")}
        description={t("chores.desc")}
        actions={
          data.canApproveChores ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setChallengeOpen(true)}>
                <Trophy className="h-4 w-4" />
                {t("chores.newChallengeBtn")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setRewardOpen(true)}>
                <Gift className="h-4 w-4" />
                {t("chores.newRewardBtn")}
              </Button>
              <Button size="sm" onClick={() => setChoreOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("chores.newChoreBtn")}
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Positive Reinforcement Hero Strip */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card variant="peach" className="flex items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <p className="text-[12.5px] font-semibold uppercase tracking-wider opacity-80">
              {t("chores.pointsBalanceLabel")}
            </p>
            <p className="font-heading text-[36px] font-bold leading-none tabular-nums">
              {data.myPointsBalance}
            </p>
            <p className="text-[13px] opacity-85">
              {t("chores.pointsBalanceHint")}
            </p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-surface)]/80 text-[#5C3B1C]">
            <Award className="h-7 w-7" />
          </div>
        </Card>

        <Card variant="sage" className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5" />
              <CardTitle>{t("chores.challengesTitle")}</CardTitle>
            </div>
            <Badge variant="forest">{t("chores.teamGoalBadge")}</Badge>
          </div>
          {data.challenges.length === 0 ? (
            <CardDescription className="text-[var(--tint-sage-fg)]">
              {t("chores.noChallenges")}
            </CardDescription>
          ) : (
            data.challenges.slice(0, 2).map((ch) => {
              const pct = Math.min(
                100,
                Math.round((ch.currentChores / Math.max(ch.targetChores, 1)) * 100)
              );
              return (
                <div key={ch.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[13.5px] font-medium">
                    <span>{ch.title}</span>
                    <span className="tabular-nums">
                      {t("chores.challengeProgress", {
                        current: ch.currentChores,
                        target: ch.targetChores,
                      })}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface)]/70">
                    <div
                      className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </div>

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "chores", label: t("chores.tab.chores"), badge: data.templates.length },
          { id: "rewards", label: t("chores.tab.rewards"), badge: data.rewards.length },
          ...(data.canApproveChores
            ? [{ id: "approvals", label: t("chores.tab.approvals"), badge: pendingSubmissions.length }]
            : []),
          { id: "history", label: t("chores.tab.history") },
        ]}
      />

      {tab === "chores" && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.templates.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title={t("chores.emptyTitle")}
                description={t("chores.emptyDesc")}
                actionLabel={data.canApproveChores ? t("chores.createFirstBtn") : undefined}
                onAction={data.canApproveChores ? () => setChoreOpen(true) : undefined}
              />
            </div>
          ) : (
            data.templates.map((item) => (
              <Card key={item.id} className="flex items-center justify-between gap-4 p-5">
                <div className="space-y-1.5">
                  <p className="font-heading text-[16px] font-semibold">{item.title}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="peach">{t("chores.ptsSuffix", { pts: item.defaultPoints })}</Badge>
                    <Badge variant="neutral">
                      {t(`chores.schedule.${item.scheduleRule}` as "chores.schedule.daily")}
                    </Badge>
                    {item.assigneeName && <Badge variant="sage">{item.assigneeName}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {data.canApproveChores && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${t("common.edit")} ${item.title}`}
                        onClick={() => {
                          setEditingChoreId(item.id);
                          setChoreTitle(item.title);
                          setChorePoints(String(item.defaultPoints));
                          setChoreSchedule(item.scheduleRule as typeof choreSchedule);
                          setChoreAssignee(
                            data.members.find((m) => m.displayName === item.assigneeName)?.id ?? ""
                          );
                          setChoreOpen(true);
                        }}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${t("common.delete")} ${item.title}`}
                        onClick={async () => {
                          setBusy(true);
                          const r = await deleteChoreTemplateAction({
                            familyId,
                            templateId: item.id,
                          });
                          setBusy(false);
                          if (!r.ok) toast.error(te(r.error));
                          else router.refresh();
                        }}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                      </button>
                    </>
                  )}
                  <Button
                    variant="tonal"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleSubmitChore(item)}
                  >
                    <Check className="h-4 w-4" />
                    {t("chores.iDidItBtn")}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "rewards" && (
        <div className="grid gap-4 md:grid-cols-3">
          {data.rewards.length === 0 ? (
            <div className="md:col-span-3">
              <EmptyState
                icon={<Gift className="h-5 w-5" />}
                title={t("chores.rewardsEmptyTitle")}
                description={t("chores.rewardsEmptyDesc")}
              />
            </div>
          ) : (
            data.rewards.map((r) => {
              const canAfford = data.myPointsBalance >= r.costPoints;
              return (
                <Card key={r.id} className="flex flex-col justify-between gap-4 p-5">
                  <div className="space-y-1">
                    <Badge variant="lavender">{t("chores.ptsSuffix", { pts: r.costPoints })}</Badge>
                    <CardTitle className="pt-1">{r.title}</CardTitle>
                    {r.description && <CardDescription>{r.description}</CardDescription>}
                  </div>
                  <div className="flex items-center gap-2">
                    {data.canApproveChores && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`${t("common.edit")} ${r.title}`}
                          onClick={() => {
                            setEditingRewardId(r.id);
                            setRewardTitle(r.title);
                            setRewardCost(String(r.costPoints));
                            setRewardOpen(true);
                          }}
                          className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`${t("common.delete")} ${r.title}`}
                          onClick={async () => {
                            setBusy(true);
                            const res = await deleteRewardAction({
                              familyId,
                              rewardId: r.id,
                            });
                            setBusy(false);
                            if (!res.ok) toast.error(te(res.error));
                            else router.refresh();
                          }}
                          className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                        </button>
                      </>
                    )}
                    <Button
                      className="flex-1"
                      disabled={busy || !data.canRedeemRewards || !canAfford}
                      variant={canAfford ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => handleRedeem(r.id, r.title)}
                    >
                      {canAfford
                        ? t("chores.redeemBtn")
                        : t("chores.needMorePts", { pts: r.costPoints - data.myPointsBalance })}
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === "approvals" && data.canApproveChores && (
        <div className="space-y-3">
          {pendingSubmissions.length === 0 ? (
            <EmptyState
              icon={<Check className="h-5 w-5" />}
              title={t("chores.approvalsEmptyTitle")}
              description={t("chores.approvalsEmptyDesc")}
            />
          ) : (
            pendingSubmissions.map((sub) => (
              <Card
                key={sub.id}
                className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <p className="font-heading text-[16px] font-semibold">
                    {t("chores.completedSub", { member: sub.memberName, title: sub.title })}
                  </p>
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    <strong className="tabular-nums">{t("chores.worthPts", { pts: sub.pointsValue })}</strong> ·{" "}
                    {formatLocalizedDate(sub.createdAt, locale)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleReview(sub.id, false)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("chores.tryAgainBtn")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => handleReview(sub.id, true)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t("chores.approveBtn")}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "history" && (
        <Card className="divide-y divide-[var(--border-subtle)] p-2">
          {data.ledger.length === 0 ? (
            <p className="p-6 text-center text-[13.5px] text-[var(--text-secondary)]">
              {t("chores.historyEmpty")}
            </p>
          ) : (
            data.ledger.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-[13.5px]"
              >
                <div>
                  <p className="font-medium">{entry.reason}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {entry.memberName} · {formatLocalizedDate(entry.createdAt, locale)}
                  </p>
                </div>
                <Badge variant={entry.deltaPoints > 0 ? "sage" : "peach"} className="tabular-nums">
                  {t("chores.ptsSuffix", {
                    pts: entry.deltaPoints > 0 ? `+${entry.deltaPoints}` : entry.deltaPoints,
                  })}
                </Badge>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Parent Modals */}
      <BottomSheet
        open={choreOpen}
        onClose={() => {
          setChoreOpen(false);
          setEditingChoreId(null);
        }}
        title={t("chores.modal.createChore")}
      >
        <form onSubmit={handleCreateChore} className="space-y-4">
          <Input label={t("chores.modal.choreTitle")} required placeholder={t("chores.modal.chorePlaceholder")} value={choreTitle} onChange={(e) => setChoreTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("chores.modal.points")} type="number" min={1} max={1000} value={chorePoints} onChange={(e) => setChorePoints(e.target.value)} />
            <Select label={t("chores.modal.schedule")} value={choreSchedule} onChange={(e) => setChoreSchedule(e.target.value as typeof choreSchedule)} options={[{ value: "daily", label: t("chores.schedule.daily") }, { value: "weekly", label: t("chores.schedule.weekly") }, { value: "monthly", label: t("chores.schedule.monthly") }, { value: "once", label: t("chores.schedule.once") }]} />
          </div>
          {data.members.length > 0 && (
            <Select label={t("chores.modal.assignTo")} value={choreAssignee} onChange={(e) => setChoreAssignee(e.target.value)} options={[{ value: "", label: t("chores.modal.anyone") }, ...data.members.map((m) => ({ value: m.id, label: m.displayName }))]} />
          )}
          <Button type="submit" className="w-full" isLoading={busy}>{t("chores.modal.saveChore")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={rewardOpen}
        onClose={() => {
          setRewardOpen(false);
          setEditingRewardId(null);
        }}
        title={t("chores.modal.addReward")}
      >
        <form
          onSubmit={async (e) => {
            if (!editingRewardId) {
              await handleCreateReward(e);
              return;
            }
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            const res = await updateRewardAction({
              familyId,
              rewardId: editingRewardId,
              title: rewardTitle,
              description: "",
              costPoints: Number(rewardCost) || 50,
            });
            setBusy(false);
            if (!res.ok) toast.error(te(res.error));
            else {
              setRewardTitle("");
              setEditingRewardId(null);
              setRewardOpen(false);
              router.refresh();
            }
          }}
          className="space-y-4"
        >
          <Input label={t("chores.modal.rewardTitle")} required placeholder={t("chores.modal.rewardPlaceholder")} value={rewardTitle} onChange={(e) => setRewardTitle(e.target.value)} />
          <Input label={t("chores.modal.pointCost")} type="number" min={1} max={10000} value={rewardCost} onChange={(e) => setRewardCost(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("chores.modal.addRewardBtn")}</Button>
        </form>
      </BottomSheet>

      <BottomSheet open={challengeOpen} onClose={() => setChallengeOpen(false)} title={t("chores.modal.startChallenge")}>
        <form onSubmit={handleCreateChallenge} className="space-y-4">
          <Input label={t("chores.modal.challengeGoal")} required placeholder={t("chores.modal.challengePlaceholder")} value={challengeTitle} onChange={(e) => setChallengeTitle(e.target.value)} />
          <Input label={t("chores.modal.targetChores")} type="number" min={1} max={500} value={challengeTarget} onChange={(e) => setChallengeTarget(e.target.value)} />
          <Button type="submit" className="w-full" isLoading={busy}>{t("chores.modal.launchChallengeBtn")}</Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
