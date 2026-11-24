"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  Eye,
  Lock,
  Megaphone,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Trash2,
  Vote,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BottomSheet, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { formatLocalizedDate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";
import {
  castPollVoteAction,
  closePollAction,
  createAnnouncementAction,
  createPollAction,
  deleteAnnouncementAction,
  deletePollAction,
  getAnnouncementAttachmentSignedUrlAction,
  markAnnouncementReadAction,
  toggleAnnouncementArchiveAction,
  updateAnnouncementAction,
  uploadAnnouncementAttachmentAction,
} from "../actions";
import type { NoticeboardAnnouncement, NoticeboardData, NoticeboardPoll } from "../server";

export function FamilyNoticeboardView({
  familyId,
  data,
}: {
  familyId: string;
  data: NoticeboardData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [tab, setTab] = React.useState<"active" | "polls" | "archived">("active");
  const [annOpen, setAnnOpen] = React.useState(false);
  const [pollOpen, setPollOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Announcement form
  const [annTitle, setAnnTitle] = React.useState("");
  const [annBody, setAnnBody] = React.useState("");
  const [annAudience, setAnnAudience] = React.useState<"all" | "adults_only" | "children_teens">("all");
  const [annPinned, setAnnPinned] = React.useState(false);
  const [annAttachment, setAnnAttachment] = React.useState("");
  const [annFile, setAnnFile] = React.useState<File | null>(null);

  // Edit / Delete Announcement state
  const [editAnn, setEditAnn] = React.useState<NoticeboardAnnouncement | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [editAudience, setEditAudience] = React.useState<"all" | "adults_only" | "children_teens">("all");
  const [editPinned, setEditPinned] = React.useState(false);
  const [deleteAnnTarget, setDeleteAnnTarget] = React.useState<NoticeboardAnnouncement | null>(null);

  // Poll form
  const [pollQuestion, setPollQuestion] = React.useState("");
  const [pollOptionsText, setPollOptionsText] = React.useState("Homemade Pizza\nTaco Night\nSushi");
  const [pollMultiple, setPollMultiple] = React.useState(false);
  const [pollAnonymous, setPollAnonymous] = React.useState(false);
  const [pollAllowEdit, setPollAllowEdit] = React.useState(true);
  const [pollVisibility, setPollVisibility] = React.useState<"family" | "adults_only">("family");
  const [pollExpiresInDays, setPollExpiresInDays] = React.useState("3");

  const [selectedVotes, setSelectedVotes] = React.useState<Record<string, string[]>>({});

  const activeAnnouncements = data.announcements.filter((a) => !a.isArchived);
  const archivedAnnouncements = data.announcements.filter((a) => a.isArchived);

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    let attachmentStoragePath: string | null = null;
    let attachmentName = annAttachment.trim() || undefined;

    if (annFile) {
      const formData = new FormData();
      formData.set("familyId", familyId);
      formData.set("file", annFile);
      const upRes = await uploadAnnouncementAttachmentAction(formData);
      if (!upRes.ok) {
        setBusy(false);
        toast.error(te(upRes.error));
        return;
      }
      attachmentStoragePath = upRes.storagePath ?? null;
      attachmentName = upRes.fileName ?? annFile.name;
    }

    const res = await createAnnouncementAction({
      familyId,
      title: annTitle,
      body: annBody,
      audience: annAudience,
      pinned: annPinned,
      attachmentName,
      attachmentStoragePath,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setAnnTitle("");
      setAnnBody("");
      setAnnAttachment("");
      setAnnFile(null);
      setAnnOpen(false);
      toast.success(t("noticeboard.toast.published"));
      router.refresh();
    }
  };

  const openEditAnnouncement = (ann: NoticeboardAnnouncement) => {
    setEditAnn(ann);
    setEditTitle(ann.title);
    setEditBody(ann.body);
    setEditAudience(ann.audience);
    setEditPinned(ann.pinned);
  };

  const handleUpdateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAnn) return;
    setBusy(true);
    const res = await updateAnnouncementAction({
      familyId,
      announcementId: editAnn.id,
      title: editTitle,
      body: editBody,
      audience: editAudience,
      pinned: editPinned,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setEditAnn(null);
    toast.success(t("noticeboard.toast.updated"));
    router.refresh();
  };

  const handleDeleteAnnouncement = async () => {
    if (!deleteAnnTarget) return;
    setBusy(true);
    const res = await deleteAnnouncementAction({
      familyId,
      announcementId: deleteAnnTarget.id,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    setDeleteAnnTarget(null);
    toast.success(t("noticeboard.toast.deleted"));
    router.refresh();
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const options = pollOptionsText
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    const days = Number(pollExpiresInDays);
    const expiresAt =
      days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    setBusy(true);
    const res = await createPollAction({
      familyId,
      question: pollQuestion,
      description: "",
      options,
      allowMultiple: pollMultiple,
      isAnonymous: pollAnonymous,
      allowVoteEdit: pollAllowEdit,
      visibility: pollVisibility,
      expiresAt,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setPollQuestion("");
      setPollOpen(false);
      toast.success(t("noticeboard.toast.pollCreated"));
      router.refresh();
    }
  };

  const togglePollSelection = (poll: NoticeboardPoll, optionId: string) => {
    const current = selectedVotes[poll.id] ?? poll.mySelectedOptionIds;
    if (poll.allowMultiple) {
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      setSelectedVotes((prev) => ({ ...prev, [poll.id]: next }));
    } else {
      setSelectedVotes((prev) => ({ ...prev, [poll.id]: [optionId] }));
    }
  };

  const submitVote = async (poll: NoticeboardPoll) => {
    const optionIds = selectedVotes[poll.id] ?? poll.mySelectedOptionIds;
    if (optionIds.length === 0) {
      toast.error(t("noticeboard.toast.selectOption"));
      return;
    }
    setBusy(true);
    const res = await castPollVoteAction({
      familyId,
      pollId: poll.id,
      optionIds,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("noticeboard.toast.voted"));
      router.refresh();
    }
  };

  return (
    <Section>
      <PageHeader
        title={t("noticeboard.title")}
        description={t("noticeboard.subtitle")}
        actions={
          data.canPublish ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPollOpen(true)}>
                <Vote className="h-4 w-4" />
                {t("noticeboard.newPoll")}
              </Button>
              <Button size="sm" onClick={() => setAnnOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("noticeboard.newAnnouncement")}
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "active", label: t("noticeboard.tab.active"), badge: activeAnnouncements.length },
          { id: "polls", label: t("noticeboard.tab.polls"), badge: data.polls.length },
          { id: "archived", label: t("noticeboard.tab.archived"), badge: archivedAnnouncements.length },
        ]}
      />

      {(tab === "active" || tab === "archived") && (
        <div className="space-y-4">
          {(tab === "active" ? activeAnnouncements : archivedAnnouncements).length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title={tab === "active" ? t("noticeboard.emptyTitle") : t("noticeboard.emptyArchivedTitle")}
              description={t("noticeboard.emptyDesc")}
              actionLabel={tab === "active" && data.canPublish ? t("noticeboard.postBtn") : undefined}
              onAction={tab === "active" && data.canPublish ? () => setAnnOpen(true) : undefined}
            />
          ) : (
            (tab === "active" ? activeAnnouncements : archivedAnnouncements).map((ann) => (
              <Card
                key={ann.id}
                variant={ann.pinned ? "blush" : "elevated"}
                className="space-y-4 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={ann.authorName} size="md" tone="forest" />
                    <div>
                      <p className="font-heading text-[15px] font-semibold">
                        {ann.authorName}
                      </p>
                      <p className="text-[12px] opacity-75">
                        {formatLocalizedDate(ann.createdAt, locale)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {ann.pinned && (
                      <Badge variant="peach">
                        <Pin className="h-3 w-3" /> Pinned
                      </Badge>
                    )}
                    {ann.audience !== "all" && (
                      <Badge variant="lavender">
                        <Lock className="h-3 w-3" /> {ann.audience.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <CardTitle className="text-[19px]">{ann.title}</CardTitle>
                  <p className="whitespace-pre-line text-[14.5px] leading-relaxed opacity-90">
                    {ann.body}
                  </p>
                </div>

                {ann.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {ann.attachments.map((att) =>
                      ann.attachmentStoragePath ? (
                        <button
                          key={att.name}
                          type="button"
                          onClick={async () => {
                            const r = await getAnnouncementAttachmentSignedUrlAction({
                              familyId,
                              announcementId: ann.id,
                            });
                            if (!r.ok || !r.url) {
                              toast.error(te(r.error));
                              return;
                            }
                            window.open(r.url, "_blank", "noopener,noreferrer");
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-subtle)] px-3 py-1 text-[12px] font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                        >
                          <Paperclip className="h-3 w-3" /> {att.name}
                        </button>
                      ) : (
                        <Badge key={att.name} variant="neutral">
                          <Paperclip className="h-3 w-3" /> {att.name}
                        </Badge>
                      )
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] opacity-80 tabular-nums">
                    <Eye className="h-3.5 w-3.5" />
                    {t("noticeboard.seenBy", { count: ann.readCount })}
                  </span>

                  <div className="flex items-center gap-2">
                    {!ann.hasRead && (
                      <Button
                        variant="tonal"
                        size="sm"
                        onClick={async () => {
                          const r = await markAnnouncementReadAction({
                            familyId,
                            announcementId: ann.id,
                          });
                          if (r.ok) router.refresh();
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Mark read
                      </Button>
                    )}
                    {ann.canEditOrDelete && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${t("common.edit")} ${ann.title}`}
                          onClick={() => openEditAnnouncement(ann)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${t("common.delete")} ${ann.title}`}
                          onClick={() => setDeleteAnnTarget(ann)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                          Delete
                        </Button>
                      </>
                    )}
                    {ann.canEditOrDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const r = await toggleAnnouncementArchiveAction({
                            familyId,
                            announcementId: ann.id,
                            isArchived: !ann.isArchived,
                          });
                          if (r.ok) {
                            toast.success(ann.isArchived ? t("noticeboard.restoredToast") : t("noticeboard.archivedToast"));
                            router.refresh();
                          } else if (r.error) {
                            toast.error(te(r.error));
                          }
                        }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        {ann.isArchived ? t("noticeboard.restoreBtn") : t("noticeboard.archiveBtn")}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "polls" && (
        <div className="grid gap-6 md:grid-cols-2">
          {data.polls.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                icon={<Vote className="h-5 w-5" />}
                title={t("noticeboard.pollsEmptyTitle")}
                description={t("noticeboard.pollsEmptyDesc")}
                actionLabel={data.canPublish ? t("noticeboard.createPollBtn") : undefined}
                onAction={data.canPublish ? () => setPollOpen(true) : undefined}
              />
            </div>
          ) : (
            data.polls.map((poll) => {
              const expired =
                poll.isClosed ||
                (poll.expiresAt ? new Date(poll.expiresAt) <= new Date() : false);
              const currentSelection =
                selectedVotes[poll.id] ?? poll.mySelectedOptionIds;
              const lockedByRule =
                poll.mySelectedOptionIds.length > 0 && !poll.allowVoteEdit;

              return (
                <Card key={poll.id} className="space-y-4 p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {poll.isAnonymous && <Badge variant="lavender">{t("noticeboard.badge.anonymous")}</Badge>}
                    {poll.visibility === "adults_only" && (
                      <Badge variant="blush">{t("noticeboard.badge.adultsOnly")}</Badge>
                    )}
                    {poll.allowMultiple && <Badge variant="sage">{t("noticeboard.badge.multiSelect")}</Badge>}
                    {expired && <Badge variant="neutral">{t("noticeboard.badge.closed")}</Badge>}
                  </div>

                  <div>
                    <CardTitle className="text-[18px]">{poll.question}</CardTitle>
                    {poll.expiresAt && (
                      <CardDescription className="mt-1">
                        {expired ? t("noticeboard.ended") : t("noticeboard.closes")}{" "}
                        {formatLocalizedDate(poll.expiresAt, locale)}
                      </CardDescription>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {poll.options.map((opt) => {
                      const pct =
                        poll.totalVotes > 0
                          ? Math.round((opt.voteCount / poll.totalVotes) * 100)
                          : 0;
                      const isSelected = currentSelection.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={expired || lockedByRule}
                          onClick={() => togglePollSelection(poll, opt.id)}
                          className={cn(
                            "relative w-full overflow-hidden rounded-2xl border p-3.5 text-left transition-all cursor-pointer",
                            isSelected
                              ? "border-[var(--accent-primary)] bg-[var(--tint-sage)]/30"
                              : "border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 hover:bg-[var(--bg-subtle)]"
                          )}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-[var(--tint-sage)]/45 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center justify-between gap-2">
                            <span className="font-medium text-[14px]">
                              {opt.label}
                            </span>
                            <span className="text-[12.5px] font-semibold tabular-nums">
                              {pct}% ({opt.voteCount})
                            </span>
                          </div>
                          {!poll.isAnonymous && opt.voterNames.length > 0 && (
                            <p className="relative mt-1 text-[11.5px] text-[var(--text-secondary)]">
                              {opt.voterNames.join(", ")}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {!expired && !lockedByRule && (
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={busy}
                      onClick={() => submitVote(poll)}
                    >
                      {poll.mySelectedOptionIds.length > 0 ? t("noticeboard.updateVoteBtn") : t("noticeboard.submitVoteBtn")}
                    </Button>
                  )}

                  {poll.canEditOrDelete && (
                    <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const r = await closePollAction({
                            familyId,
                            pollId: poll.id,
                            isClosed: !poll.isClosed,
                          });
                          setBusy(false);
                          if (!r.ok) toast.error(te(r.error));
                          else router.refresh();
                        }}
                      >
                        <Lock className="h-3.5 w-3.5" />
                        {poll.isClosed ? t("noticeboard.restoreBtn") : t("common.close")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const r = await deletePollAction({
                            familyId,
                            pollId: poll.id,
                          });
                          setBusy(false);
                          if (!r.ok) toast.error(te(r.error));
                          else router.refresh();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                        {t("common.delete")}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Create Announcement Sheet */}
      <BottomSheet
        open={annOpen}
        onClose={() => setAnnOpen(false)}
        title={t("noticeboard.modal.postTitle")}
      >
        <form onSubmit={handlePublishAnnouncement} className="space-y-4">
          <Input
            label={t("noticeboard.modal.headlineLabel")}
            required
            placeholder={t("noticeboard.annTitlePlaceholder")}
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-body" className="text-[13.5px] font-medium">
              {t("noticeboard.modal.messageLabel")}
            </label>
            <textarea
              id="ann-body"
              rows={4}
              required
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              className="w-full rounded-xl bg-[var(--bg-subtle)] p-3.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
            />
          </div>
          <Select
            label={t("noticeboard.modal.audienceLabel")}
            value={annAudience}
            onChange={(e) => setAnnAudience(e.target.value as typeof annAudience)}
            options={[
              { value: "all", label: t("noticeboard.audience.all") },
              { value: "adults_only", label: t("noticeboard.audience.adultsOnly") },
              { value: "children_teens", label: t("noticeboard.audience.parentsChildren") },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[13.5px] font-medium">
              {t("noticeboard.modal.attachmentLabel")}
            </label>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setAnnFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-xl bg-[var(--bg-subtle)] p-2.5 text-[13.5px] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent-primary)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-white"
            />
          </div>
          <label className="flex items-center gap-2 text-[13.5px] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={annPinned}
              onChange={(e) => setAnnPinned(e.target.checked)}
              className="h-4 w-4 accent-[#315C49]"
            />
            {t("noticeboard.modal.pinCheckbox")}
          </label>
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("noticeboard.modal.publishBtn")}
          </Button>
        </form>
      </BottomSheet>

      {/* Edit Announcement Sheet */}
      <BottomSheet
        open={Boolean(editAnn)}
        onClose={() => setEditAnn(null)}
        title={t("noticeboard.modal.editTitle")}
      >
        <form onSubmit={handleUpdateAnnouncement} className="space-y-4">
          <Input
            label={t("noticeboard.modal.headlineLabel")}
            required
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-ann-body" className="text-[13.5px] font-medium">
              {t("noticeboard.modal.messageLabel")}
            </label>
            <textarea
              id="edit-ann-body"
              rows={4}
              required
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full rounded-xl bg-[var(--bg-subtle)] p-3.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
            />
          </div>
          <Select
            label={t("noticeboard.modal.audienceLabel")}
            value={editAudience}
            onChange={(e) => setEditAudience(e.target.value as typeof editAudience)}
            options={[
              { value: "all", label: t("noticeboard.audience.all") },
              { value: "adults_only", label: t("noticeboard.audience.adultsOnly") },
              { value: "children_teens", label: t("noticeboard.audience.parentsChildren") },
            ]}
          />
          <label className="flex items-center gap-2 text-[13.5px] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={editPinned}
              onChange={(e) => setEditPinned(e.target.checked)}
              className="h-4 w-4 accent-[#315C49]"
            />
            {t("noticeboard.modal.pinCheckbox")}
          </label>
          <Button type="submit" className="w-full" isLoading={busy}>
            {t("common.saveChanges")}
          </Button>
        </form>
      </BottomSheet>

      <Dialog
        open={Boolean(deleteAnnTarget)}
        onClose={() => !busy && setDeleteAnnTarget(null)}
        title={t("noticeboard.modal.deleteTitle")}
        description={
          deleteAnnTarget
            ? t("noticeboard.modal.deleteDesc", { title: deleteAnnTarget.title })
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleteAnnTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={busy}
              onClick={handleDeleteAnnouncement}
            >
              {t("noticeboard.modal.deleteBtn")}
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-[var(--text-secondary)]">
          {t("noticeboard.modal.deleteReadNote")}
        </p>
      </Dialog>

      {/* Create Poll Sheet */}
      <BottomSheet
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        title={t("noticeboard.modal.pollTitle")}
      >
        <form onSubmit={handleCreatePoll} className="space-y-4">
          <Input
            label={t("noticeboard.modal.questionLabel")}
            required
            placeholder={t("noticeboard.pollQuestionPlaceholder")}
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="poll-opts" className="text-[13.5px] font-medium">
              {t("noticeboard.modal.optionsLabel")}
            </label>
            <textarea
              id="poll-opts"
              rows={3}
              required
              value={pollOptionsText}
              onChange={(e) => setPollOptionsText(e.target.value)}
              className="w-full rounded-xl bg-[var(--bg-subtle)] p-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("noticeboard.modal.visibilityLabel")}
              value={pollVisibility}
              onChange={(e) => setPollVisibility(e.target.value as "family" | "adults_only")}
              options={[
                { value: "family", label: t("noticeboard.pollVis.family") },
                { value: "adults_only", label: t("noticeboard.pollVis.adultsOnly") },
              ]}
            />
            <Select
              label={t("noticeboard.modal.durationLabel")}
              value={pollExpiresInDays}
              onChange={(e) => setPollExpiresInDays(e.target.value)}
              options={[
                { value: "1", label: t("noticeboard.dur.1") },
                { value: "3", label: t("noticeboard.dur.3") },
                { value: "7", label: t("noticeboard.dur.7") },
                { value: "0", label: t("noticeboard.modal.noExpiration") },
              ]}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} className="h-4 w-4 accent-[#315C49]" />
              {t("noticeboard.modal.allowMultiple")}
            </label>
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} className="h-4 w-4 accent-[#315C49]" />
              Anonymous voting
            </label>
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={pollAllowEdit} onChange={(e) => setPollAllowEdit(e.target.checked)} className="h-4 w-4 accent-[#315C49]" />
              Allow members to change their vote
            </label>
          </div>
          <Button type="submit" className="w-full" isLoading={busy}>
            Launch Poll
          </Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
