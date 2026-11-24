"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckSquare,
  Clock,
  Edit3,
  History,
  MessageSquare,
  Paperclip,
  Plus,
  Repeat,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { OfflineCacheBanner } from "@/components/pwa/offline-cache-banner";
import { PageHeader, Section } from "@/components/layout/primitives";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BottomSheet } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { useOfflineCachedData } from "@/hooks/use-offline-cached-data";
import { enqueueOfflineMutation } from "@/lib/pwa/sync-engine";
import { cn } from "@/lib/utils";
import { formatLocalizedDate } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";
import {
  addTaskCommentAction,
  deleteTaskAction,
  deleteTaskAttachmentAction,
  getTaskAttachmentSignedUrlAction,
  saveTaskAction,
  toggleSubtaskAction,
  toggleTaskStatusAction,
  uploadTaskAttachmentAction,
} from "../actions";
import type { TaskItemView, TasksPageData } from "../server";

const PRIORITY_BADGES: Record<TaskItemView["priority"], "danger" | "peach" | "neutral"> = {
  high: "danger",
  normal: "peach",
  low: "neutral",
};

export function FamilyTasksView({
  familyId,
  data,
}: {
  familyId: string;
  data: TasksPageData;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const isTasksEmpty = React.useCallback(
    (d: TasksPageData) => d.tasks.length === 0 && d.members.length === 0,
    []
  );
  const {
    effectiveData,
    isFromCache,
    isCacheExpired,
    cachedAt,
    isOnline,
  } = useOfflineCachedData({
    familyId,
    domain: "tasks",
    serverData: data,
    isEmptyData: isTasksEmpty,
  });
  const [statusFilter, setStatusFilter] = React.useState<"active" | "done" | "all">("active");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [priorityFilter, setPriorityFilter] = React.useState("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState("all");

  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const selectedTask = React.useMemo(
    () => (selectedTaskId ? effectiveData.tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [effectiveData.tasks, selectedTaskId]
  );
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [commentText, setCommentText] = React.useState("");

  // Editor state
  const [editingId, setEditingId] = React.useState<string | undefined>();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<TaskItemView["category"]>("household");
  const [priority, setPriority] = React.useState<TaskItemView["priority"]>("normal");
  const [dueDateStr, setDueDateStr] = React.useState("");
  const [recurrenceRule, setRecurrenceRule] = React.useState<"" | "daily" | "weekly" | "monthly">("");
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = React.useState("");
  const [syncToCalendar, setSyncToCalendar] = React.useState(false);

  const completedCount = effectiveData.tasks.filter((t) => t.status === "done").length;
  const totalCount = effectiveData.tasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const filteredTasks = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return effectiveData.tasks.filter((t) => {
      if (statusFilter === "active" && t.status === "done") return false;
      if (statusFilter === "done" && t.status !== "done") return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (
        assigneeFilter !== "all" &&
        !t.assignees.some((a) => a.memberId === assigneeFilter)
      ) {
        return false;
      }
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !t.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [effectiveData.tasks, statusFilter, categoryFilter, priorityFilter, assigneeFilter, searchQuery]);

  const openNewTask = () => {
    setEditingId(undefined);
    setTitle("");
    setDescription("");
    setCategory("household");
    setPriority("normal");
    setDueDateStr("");
    setRecurrenceRule("");
    setAssignees(data.currentMemberId ? [data.currentMemberId] : []);
    setSubtaskDraft("");
    setSyncToCalendar(false);
    setEditorOpen(true);
  };

  const openEditTask = (task: TaskItemView) => {
    setEditingId(task.id);
    setTitle(task.title);
    setDescription(task.description);
    setCategory(task.category);
    setPriority(task.priority);
    setDueDateStr(task.dueAt ? task.dueAt.slice(0, 10) : "");
    setRecurrenceRule(task.recurrenceRule ?? "");
    setAssignees(task.assignees.map((a) => a.memberId));
    setSubtaskDraft("");
    setSyncToCalendar(false);
    setSelectedTaskId(null);
    setEditorOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const subtasks = subtaskDraft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!isOnline) {
      await enqueueOfflineMutation({
        familyId,
        domain: "tasks",
        actionType: "save_task",
        payload: {
          taskId: editingId,
          title,
          description,
          category,
          priority,
          dueAt: dueDateStr
            ? new Date(`${dueDateStr}T17:00:00`).toISOString()
            : null,
          pointsValue: category === "chores" ? 15 : 0,
          recurrenceRule: recurrenceRule || null,
          assigneeMemberIds: assignees,
          subtasks,
          syncToCalendar,
        },
      });
      setBusy(false);
      setEditorOpen(false);
      toast.info(t("tasks.offlineSavedToast"));
      return;
    }

    const res = await saveTaskAction({
      familyId,
      taskId: editingId,
      title,
      description,
      category,
      priority,
      dueAt: dueDateStr ? new Date(`${dueDateStr}T17:00:00`).toISOString() : null,
      pointsValue: category === "chores" ? 15 : 0,
      recurrenceRule: recurrenceRule || null,
      assigneeMemberIds: assignees,
      subtasks,
      syncToCalendar,
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }

    setEditorOpen(false);
    toast.success(editingId ? t("tasks.updatedToast") : t("tasks.createdToast"));
    router.refresh();
  };

  const handleQuickToggle = async (task: TaskItemView) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    if (!isOnline) {
      await enqueueOfflineMutation({
        familyId,
        domain: "tasks",
        actionType: "toggle_status",
        payload: { taskId: task.id, nextStatus },
      });
      toast.info(t("tasks.offlineToggleToast"));
      return;
    }
    const res = await toggleTaskStatusAction({
      familyId,
      taskId: task.id,
      nextStatus,
    });
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(
        nextStatus === "done"
          ? task.recurrenceRule
            ? t("tasks.completedNextToast")
            : t("tasks.completedToast")
          : t("tasks.reopenedToast")
      );
      router.refresh();
    }
  };

  const handleToggleSubtask = async (subtaskId: string, current: boolean) => {
    const res = await toggleSubtaskAction({
      familyId,
      subtaskId,
      isCompleted: !current,
    });
    if (!res.ok) toast.error(te(res.error));
    else router.refresh();
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !commentText.trim()) return;
    setBusy(true);
    const res = await addTaskCommentAction({
      familyId,
      taskId: selectedTask.id,
      body: commentText,
    });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setCommentText("");
      toast.success(t("tasks.commentAddedToast"));
      router.refresh();
    }
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedTask) return;
    setBusy(true);
    const formData = new FormData();
    formData.set("familyId", familyId);
    formData.set("taskId", selectedTask.id);
    formData.set("file", file);
    const res = await uploadTaskAttachmentAction(formData);
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      toast.success(t("tasks.attachedToast", { name: file.name }));
      router.refresh();
    }
  };

  const handleOpenAttachment = async (attachmentId: string) => {
    const res = await getTaskAttachmentSignedUrlAction({ familyId, attachmentId });
    if (!res.ok || !res.url) {
      toast.error(te(res.error));
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    setBusy(true);
    const res = await deleteTaskAttachmentAction({ familyId, attachmentId });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else router.refresh();
  };

  const handleDeleteTask = async (taskId: string) => {
    setBusy(true);
    const res = await deleteTaskAction({ familyId, taskId });
    setBusy(false);
    if (!res.ok) toast.error(te(res.error));
    else {
      setSelectedTaskId(null);
      toast.success(t("tasks.deletedToast"));
      router.refresh();
    }
  };

  return (
    <Section>
      <OfflineCacheBanner
        isFromCache={isFromCache}
        isCacheExpired={isCacheExpired}
        cachedAt={cachedAt}
      />
      <PageHeader
        title={t("tasks.title")}
        description={t("tasks.desc")}
        actions={
          data.canManageAll ? (
            <Button onClick={openNewTask}>
              <Plus className="h-4 w-4" />
              {t("tasks.newTaskBtn")}
            </Button>
          ) : undefined
        }
      />

      {/* Progress Visualization Strip */}
      <Card variant="sage" className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-[12.5px] font-medium opacity-80">{t("tasks.progressLabel")}</p>
          <p className="font-heading text-[22px] font-bold tabular-nums">
            {t("tasks.progressSummary", {
              completed: completedCount,
              total: totalCount,
              pct: progressPct,
            })}
          </p>
        </div>
        <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-[var(--bg-surface)]/70">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </Card>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          tabs={[
            { id: "active", label: t("tasks.tab.active"), badge: totalCount - completedCount },
            { id: "done", label: t("tasks.tab.done"), badge: completedCount },
            { id: "all", label: t("tasks.tab.all"), badge: totalCount },
          ]}
        />

        <div className="grid gap-2.5 sm:grid-cols-4">
          <Input
            placeholder={t("tasks.searchPlaceholder")}
            leadingIcon={<Search className="h-4 w-4" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Select
            aria-label={t("tasks.filterCatAria")}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: "all", label: t("tasks.allCategories") },
              { value: "household", label: t("tasks.cat.household") },
              { value: "chores", label: t("tasks.cat.chores") },
              { value: "school", label: t("tasks.cat.school") },
              { value: "errands", label: t("tasks.cat.errands") },
              { value: "health", label: t("tasks.cat.health") },
              { value: "other", label: t("tasks.cat.other") },
            ]}
          />
          <Select
            aria-label={t("tasks.filterPrioAria")}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            options={[
              { value: "all", label: t("tasks.allPriorities") },
              { value: "high", label: t("tasks.prio.high") },
              { value: "normal", label: t("tasks.prio.normal") },
              { value: "low", label: t("tasks.prio.low") },
            ]}
          />
          <Select
            aria-label={t("tasks.filterMemberAria")}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            options={[
              { value: "all", label: t("tasks.allMembers") },
              ...data.members.map((m) => ({
                value: m.id,
                label: m.displayName,
              })),
            ]}
          />
        </div>
      </div>

      {/* Interactive Task List */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-5 w-5" />}
          title={t("tasks.emptyTitle")}
          description={t("tasks.emptyDesc")}
          actionLabel={data.canManageAll ? t("tasks.createTaskBtn") : undefined}
          onAction={data.canManageAll ? openNewTask : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const done = task.status === "done";
            const doneSubs = task.subtasks.filter((s) => s.isCompleted).length;
            return (
              <Card
                key={task.id}
                className={cn(
                  "flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center transition-all hover:border-[var(--border-strong)]",
                  done && "opacity-70"
                )}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <button
                    type="button"
                    aria-label={done ? t("tasks.reopenAria") : t("tasks.completeAria")}
                    onClick={() => handleQuickToggle(task)}
                    className="-ml-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:ml-0 sm:mt-0.5 sm:h-7 sm:w-7 cursor-pointer"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                        done
                          ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                          : "border-[var(--border-strong)] hover:border-[var(--accent-primary)]"
                      )}
                    >
                      {done && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className="min-w-0 text-left cursor-pointer"
                  >
                    <p
                      className={cn(
                        "font-heading text-[15.5px] font-semibold",
                        done && "line-through"
                      )}
                    >
                      {task.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                      <Badge variant={PRIORITY_BADGES[task.priority]}>
                        {t(`tasks.prioLabel.${task.priority}` as "tasks.prioLabel.normal")}
                      </Badge>
                      <Badge variant="neutral">
                        {t(`tasks.cat.${task.category}` as "tasks.cat.household")}
                      </Badge>
                      {task.dueAt && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {formatLocalizedDate(task.dueAt, locale)}
                        </span>
                      )}
                      {task.recurrenceRule && (
                        <span className="inline-flex items-center gap-1">
                          <Repeat className="h-3 w-3" />
                          {t(`tasks.repeat.${task.recurrenceRule}` as "tasks.repeat.daily")}
                        </span>
                      )}
                      {task.subtasks.length > 0 && (
                        <span className="tabular-nums">
                          {t("tasks.subtasksCount", { done: doneSubs, total: task.subtasks.length })}
                        </span>
                      )}
                      {task.comments.length > 0 && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <MessageSquare className="h-3 w-3" />
                          {task.comments.length}
                        </span>
                      )}
                      {task.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Paperclip className="h-3 w-3" />
                          {task.attachments.length}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {task.assignees.length > 0 && (
                    <AvatarStack
                      size="sm"
                      members={task.assignees.map((a) => ({
                        name: a.displayName,
                        tone: "sage",
                      }))}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    {t("tasks.detailsBtn")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Task Detail Sheet */}
      <BottomSheet
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTaskId(null)}
        title={selectedTask?.title ?? t("tasks.detailsTitle")}
      >
        {selectedTask && (
          <div className="space-y-5">
            {selectedTask.description && (
              <p className="rounded-2xl bg-[var(--bg-subtle)] p-3.5 text-[13.5px]">
                {selectedTask.description}
              </p>
            )}

            {/* Subtasks */}
            {selectedTask.subtasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-[12.5px] font-semibold text-[var(--text-muted)]">
                  {t("tasks.subtasksHeading")}
                </p>
                {selectedTask.subtasks.map((sub) => (
                  <label
                    key={sub.id}
                    className="flex min-h-11 sm:min-h-0 items-center gap-2.5 rounded-xl bg-[var(--bg-subtle)] px-3.5 py-2 text-[13.5px] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={sub.isCompleted}
                      onChange={() =>
                        handleToggleSubtask(sub.id, sub.isCompleted)
                      }
                      className="h-4 w-4 accent-[#315C49]"
                    />
                    <span className={cn(sub.isCompleted && "line-through opacity-65")}>
                      {sub.title}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-semibold text-[var(--text-muted)]">
                  {t("tasks.attachmentsHeading", { count: selectedTask.attachments.length })}
                </p>
                <label className="inline-flex min-h-11 sm:min-h-0 cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-[var(--accent-primary)] hover:underline">
                  <Paperclip className="h-3.5 w-3.5" />
                  {t("tasks.addFileBtn")}
                  <input
                    type="file"
                    onChange={handleAttachFile}
                    className="sr-only"
                  />
                </label>
              </div>
              {selectedTask.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg-subtle)] px-3 py-2 text-[12.5px]"
                >
                  <button
                    type="button"
                    onClick={() => void handleOpenAttachment(att.id)}
                    className="min-w-0 flex-1 truncate text-left font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                  >
                    {att.fileName}
                  </button>
                  <span className="shrink-0 text-[var(--text-muted)] tabular-nums">
                    {Math.max(1, Math.round(att.sizeBytes / 1024))} KB
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${t("common.delete")} ${att.fileName}`}
                    onClick={() => void handleDeleteAttachment(att.id)}
                    className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--tint-peach)] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Comments */}
            <div className="space-y-2.5">
              <p className="text-[12.5px] font-semibold text-[var(--text-muted)]">
                {t("tasks.commentsHeading", { count: selectedTask.comments.length })}
              </p>
              <div className="space-y-2">
                {selectedTask.comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl bg-[var(--bg-subtle)] px-3.5 py-2.5 text-[13px]"
                  >
                    <span className="font-semibold">{c.authorName}: </span>
                    <span>{c.body}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={handlePostComment} className="flex gap-2">
                <Input
                  placeholder={t("tasks.commentPlaceholder")}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button type="submit" size="icon" isLoading={busy} aria-label={t("tasks.sendCommentAria")}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>

            {/* History */}
            {selectedTask.history.length > 0 && (
              <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)]">
                  <History className="h-3.5 w-3.5" />
                  {t("tasks.historyHeading")}
                </p>
                {selectedTask.history.slice(0, 4).map((h) => (
                  <p key={h.id} className="text-[12px] text-[var(--text-secondary)]">
                    {h.actorName} · {h.eventType}
                  </p>
                ))}
              </div>
            )}

            {data.canManageAll && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditTask(selectedTask)}
                >
                  <Edit3 className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleDeleteTask(selectedTask.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </Button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Create / Edit Task Sheet */}
      <BottomSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? t("tasks.editTaskTitle") : t("tasks.createTaskTitle")}
        fullHeight
      >
        <form
          onSubmit={handleSaveTask}
          className="space-y-4"
        >
          <Input
            label={t("tasks.taskTitleLabel")}
            required
            placeholder={t("tasks.taskTitlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label={t("tasks.notesLabel")}
            placeholder={t("tasks.notesPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("tasks.categoryLabel")}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as TaskItemView["category"])
              }
              options={[
                { value: "household", label: t("tasks.cat.household") },
                { value: "chores", label: t("tasks.cat.chores") },
                { value: "school", label: t("tasks.cat.school") },
                { value: "errands", label: t("tasks.cat.errands") },
                { value: "health", label: t("tasks.cat.health") },
                { value: "other", label: t("tasks.cat.other") },
              ]}
            />
            <Select
              label={t("tasks.priorityLabel")}
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as TaskItemView["priority"])
              }
              options={[
                { value: "low", label: t("tasks.prioLabel.low") },
                { value: "normal", label: t("tasks.prioLabel.normal") },
                { value: "high", label: t("tasks.prioLabel.high") },
              ]}
            />
            <Input
              label={t("tasks.dueDateLabel")}
              type="date"
              value={dueDateStr}
              onChange={(e) => setDueDateStr(e.target.value)}
            />
            <Select
              label={t("tasks.repeatLabel")}
              value={recurrenceRule}
              onChange={(e) =>
                setRecurrenceRule(e.target.value as typeof recurrenceRule)
              }
              options={[
                { value: "", label: t("tasks.repeat.once") },
                { value: "daily", label: t("tasks.repeat.daily") },
                { value: "weekly", label: t("tasks.repeat.weekly") },
                { value: "monthly", label: t("tasks.repeat.monthly") },
              ]}
            />
          </div>

          {!editingId && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="subtask-draft"
                className="text-[13.5px] font-medium"
              >
                {t("tasks.subtasksDraftLabel")}
              </label>
              <textarea
                id="subtask-draft"
                rows={2}
                placeholder={t("tasks.subtasksDraftPlaceholder")}
                value={subtaskDraft}
                onChange={(e) => setSubtaskDraft(e.target.value)}
                className="w-full rounded-xl bg-[var(--bg-subtle)] p-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
              />
            </div>
          )}

          {data.members.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[13.5px] font-medium">{t("tasks.assigneesLabel")}</span>
              <div className="flex flex-wrap gap-2">
                {data.members.map((m) => {
                  const selected = assignees.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setAssignees((prev) =>
                          selected
                            ? prev.filter((id) => id !== m.id)
                            : [...prev, m.id]
                        )
                      }
                      className={cn(
                        "inline-flex min-h-11 sm:min-h-0 items-center rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer",
                        selected
                          ? "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]"
                          : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                      )}
                    >
                      {m.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {dueDateStr && (
            <label className="flex min-h-11 sm:min-h-0 items-center gap-2.5 text-[13.5px] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={syncToCalendar}
                onChange={(e) => setSyncToCalendar(e.target.checked)}
                className="h-4 w-4 accent-[#315C49]"
              />
              {t("tasks.syncToCalendar")}
            </label>
          )}

          <Button type="submit" className="w-full" isLoading={busy}>
            {editingId ? t("tasks.updateTaskBtn") : t("tasks.createTaskBtn")}
          </Button>
        </form>
      </BottomSheet>
    </Section>
  );
}
