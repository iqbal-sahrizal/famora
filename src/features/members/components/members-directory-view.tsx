"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Crown,
  MailPlus,
  MoreHorizontal,
  RefreshCw,
  ShieldBan,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BottomSheet, Dialog } from "@/components/ui/dialog";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatLocalizedDate } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import type { FamilyRole } from "@/types/domain";
import {
  inviteFamilyMemberAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  transferOwnershipAction,
  updateMemberRoleAction,
  updateMemberStatusAction,
} from "../actions";
import type { DirectoryInvitationItem, DirectoryMemberItem } from "../server";

const ROLE_TONES: Record<FamilyRole, "forest" | "sage" | "peach" | "lavender" | "blush" | "neutral"> = {
  owner: "forest",
  admin: "sage",
  adult: "neutral",
  teen: "lavender",
  child: "peach",
  extended: "blush",
  caregiver: "peach",
};

export function MembersDirectoryView({
  familyId,
  members,
  invitations,
  currentMemberId,
  currentRoleKey,
}: {
  familyId: string;
  members: DirectoryMemberItem[];
  invitations: DirectoryInvitationItem[];
  currentMemberId: string | null;
  currentRoleKey: FamilyRole | null;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const canManage = currentRoleKey === "owner" || currentRoleKey === "admin";
  const isOwner = currentRoleKey === "owner";

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<
    "admin" | "adult" | "teen" | "child" | "extended" | "caregiver"
  >("adult");
  const [generatedLink, setGeneratedLink] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [confirmAction, setConfirmAction] = React.useState<{
    type: "remove" | "transfer" | "revoke";
    targetId: string;
    label: string;
  } | null>(null);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await inviteFamilyMemberAction({
      familyId,
      email: inviteEmail,
      roleKey: inviteRole,
    });
    setBusy(false);

    if (!res.ok || !res.data) {
      toast.error(te(res.error));
      return;
    }

    setGeneratedLink(res.data.inviteUrl);
    setInviteEmail("");
    toast.success(t("members.createdLinkToast"));
    router.refresh();
  };

  const handleCopyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success(t("members.copiedToast"));
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setBusy(true);
    let ok = false;
    let errMsg: string | undefined;

    if (confirmAction.type === "remove") {
      const r = await removeMemberAction({ familyId, memberId: confirmAction.targetId });
      ok = r.ok;
      errMsg = r.error;
    } else if (confirmAction.type === "transfer") {
      const r = await transferOwnershipAction({ familyId, memberId: confirmAction.targetId });
      ok = r.ok;
      errMsg = r.error;
    } else if (confirmAction.type === "revoke") {
      const r = await revokeInvitationAction({ familyId, invitationId: confirmAction.targetId });
      ok = r.ok;
      errMsg = r.error;
    }

    setBusy(false);
    setConfirmAction(null);

    if (!ok) {
      toast.error(te(errMsg));
      return;
    }
    toast.success(t("members.updatedToast"));
    router.refresh();
  };

  return (
    <Section>
      <PageHeader
        title={t("members.title")}
        description={t("members.desc")}
        badge={<Badge variant="sage">{t("members.activeBadge", { count: members.length })}</Badge>}
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setGeneratedLink(null);
                setInviteOpen(true);
              }}
            >
              <MailPlus className="h-4 w-4" />
              {t("members.inviteBtn")}
            </Button>
          ) : undefined
        }
      />

      {/* Member Directory */}
      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={t("members.emptyTitle")}
          description={t("members.emptyDesc")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {members.map((member) => {
            const isSelf = member.id === currentMemberId;
            const actions: DropdownItem[] = [];

            if (canManage && !isSelf && member.roleKey !== "owner") {
              actions.push(
                {
                  id: "make-admin",
                  label: t("members.setRoleAdmin"),
                  onSelect: async () => {
                    const r = await updateMemberRoleAction({
                      familyId,
                      memberId: member.id,
                      roleKey: "admin",
                    });
                    if (r.ok) {
                      toast.success(t("members.roleUpdatedToast"));
                      router.refresh();
                    } else toast.error(te(r.error));
                  },
                },
                {
                  id: "make-adult",
                  label: t("members.setRoleAdult"),
                  onSelect: async () => {
                    const r = await updateMemberRoleAction({
                      familyId,
                      memberId: member.id,
                      roleKey: "adult",
                    });
                    if (r.ok) {
                      toast.success(t("members.roleUpdatedToast"));
                      router.refresh();
                    } else toast.error(te(r.error));
                  },
                },
                {
                  id: "toggle-status",
                  label:
                    member.status === "suspended"
                      ? t("members.reactivate")
                      : t("members.suspend"),
                  icon:
                    member.status === "suspended" ? (
                      <UserCheck className="h-4 w-4" />
                    ) : (
                      <ShieldBan className="h-4 w-4" />
                    ),
                  onSelect: async () => {
                    const nextStatus =
                      member.status === "suspended" ? "active" : "suspended";
                    const r = await updateMemberStatusAction({
                      familyId,
                      memberId: member.id,
                      status: nextStatus,
                    });
                    if (r.ok) {
                      toast.success(t("members.statusUpdatedToast"));
                      router.refresh();
                    } else toast.error(te(r.error));
                  },
                }
              );

              if (isOwner && !member.isManagedChild && member.userId) {
                actions.push({
                  id: "transfer-owner",
                  label: t("members.transferOwner"),
                  icon: <Crown className="h-4 w-4" />,
                  onSelect: () =>
                    setConfirmAction({
                      type: "transfer",
                      targetId: member.id,
                      label: member.displayName,
                    }),
                });
              }

              actions.push({
                id: "remove",
                label: t("members.removeMember"),
                icon: <UserMinus className="h-4 w-4" />,
                danger: true,
                onSelect: () =>
                  setConfirmAction({
                    type: "remove",
                    targetId: member.id,
                    label: member.displayName,
                  }),
              });
            }

            return (
              <Card key={member.id} className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar
                    name={member.displayName}
                    size="lg"
                    tone={
                      ROLE_TONES[member.roleKey] === "neutral"
                        ? "sage"
                        : (ROLE_TONES[member.roleKey] as
                            | "forest"
                            | "sage"
                            | "peach"
                            | "lavender"
                            | "blush")
                    }
                    status={member.status === "active" ? "online" : "offline"}
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-heading text-[16px] font-semibold">
                        {member.displayName}
                      </p>
                      {isSelf && <Badge variant="neutral">{t("members.youBadge")}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ROLE_TONES[member.roleKey]}>
                        {member.roleDisplayName}
                      </Badge>
                      {member.isManagedChild && (
                        <Badge variant="lavender">{t("members.managedBadge")}</Badge>
                      )}
                      {member.status === "suspended" && (
                        <Badge variant="danger">{t("members.suspendedBadge")}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {actions.length > 0 && (
                  <Dropdown
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={t("members.actionsAria", { name: member.displayName })}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                    items={actions}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Invitations Section */}
      {canManage && (
        <div className="space-y-4 pt-4">
          <h2 className="font-heading text-[19px] font-semibold">
            {t("members.invitationsTitle", { count: invitations.length })}
          </h2>
          {invitations.length === 0 ? (
            <Card variant="subtle" className="p-5">
              <CardDescription>
                {t("members.invitationsEmpty")}
              </CardDescription>
            </Card>
          ) : (
            <div className="space-y-3">
              {invitations.map((inv) => {
                const isExpired =
                  inv.status === "pending" && new Date(inv.expiresAt) <= new Date();
                const displayStatus = isExpired ? "expired" : inv.status;
                return (
                  <Card
                    key={inv.id}
                    className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[14.5px]">
                          {inv.email}
                        </span>
                        <Badge variant={ROLE_TONES[inv.roleKey]}>
                          {inv.roleDisplayName}
                        </Badge>
                        <Badge
                          variant={
                            displayStatus === "pending"
                              ? "peach"
                              : displayStatus === "accepted"
                              ? "sage"
                              : "neutral"
                          }
                        >
                          {t(`members.status.${displayStatus}` as "members.status.pending")}
                        </Badge>
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)]">
                        {t("members.expiresOn", { date: formatLocalizedDate(inv.expiresAt, locale) })}
                      </p>
                    </div>

                    {inv.status === "pending" && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            const r = await resendInvitationAction({
                              familyId,
                              invitationId: inv.id,
                            });
                            if (r.ok && r.data) {
                              setGeneratedLink(r.data.inviteUrl);
                              setInviteOpen(true);
                              toast.success(t("members.resendToast"));
                              router.refresh();
                            } else {
                              toast.error(te(r.error));
                            }
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t("members.resendBtn")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirmAction({
                              type: "revoke",
                              targetId: inv.id,
                              label: inv.email,
                            })
                          }
                        >
                          {t("members.revokeBtn")}
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Invite BottomSheet (bottom sheet on mobile, centered dialog on desktop) */}
      <BottomSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t("members.inviteDialogTitle")}
        description={t("members.inviteDialogDesc")}
      >
        {generatedLink ? (
          <div className="space-y-4">
            <Card variant="sage" className="p-4">
              <CardTitle className="text-[14px]">{t("members.inviteLinkReady")}</CardTitle>
              <CardDescription className="mt-1 break-all font-mono text-[12px] text-[var(--tint-sage-fg)]">
                {generatedLink}
              </CardDescription>
            </Card>
            <p className="text-[12.5px] text-[var(--text-secondary)]">
              {t("members.inviteShareNote")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>
                {t("members.doneBtn")}
              </Button>
              <Button onClick={() => handleCopyLink(generatedLink)}>
                <Copy className="h-4 w-4" />
                {t("members.copyLinkBtn")}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-4">
            <Input
              label={t("members.recipientEmail")}
              type="email"
              required
              placeholder={t("onboarding.emailPlaceholder")}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <Select
              label={t("members.assignedRole")}
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as typeof inviteRole)
              }
              options={[
                { value: "admin", label: t("onboarding.role.admin") },
                { value: "adult", label: t("onboarding.role.adult") },
                { value: "teen", label: t("onboarding.role.teen") },
                { value: "child", label: t("onboarding.role.child") },
                { value: "extended", label: t("onboarding.role.extended") },
                { value: "caregiver", label: t("onboarding.role.caregiver") },
              ]}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInviteOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" isLoading={busy}>
                {t("members.generateLinkBtn")}
              </Button>
            </div>
          </form>
        )}
      </BottomSheet>

      {/* Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.type === "transfer"
            ? t("members.confirmTransferTitle")
            : confirmAction?.type === "revoke"
            ? t("members.confirmRevokeTitle")
            : t("members.confirmRemoveTitle")
        }
        description={
          confirmAction?.type === "transfer"
            ? t("members.confirmTransferDesc", { label: confirmAction.label })
            : confirmAction?.type === "revoke"
            ? t("members.confirmRevokeDesc", { label: confirmAction.label })
            : t("members.confirmRemoveDesc", { label: confirmAction?.label ?? "" })
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={confirmAction?.type === "transfer" ? "primary" : "danger"}
              isLoading={busy}
              onClick={handleConfirm}
            >
              {t("members.confirmBtn")}
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </Section>
  );
}
