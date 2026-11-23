"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addTaskAttachmentSchema,
  addTaskCommentSchema,
  saveTaskSchema,
  toggleSubtaskSchema,
  toggleTaskStatusSchema,
  type AddTaskAttachmentInput,
  type AddTaskCommentInput,
  type SaveTaskInput,
  type ToggleTaskStatusInput,
} from "./schemas";

export interface TaskActionResult {
  ok: boolean;
  taskId?: string;
  error?: string;
}

function nextRecurringDueDate(
  dueIso: string | null,
  rule: "daily" | "weekly" | "monthly"
): string {
  const base = dueIso ? new Date(dueIso) : new Date();
  if (rule === "daily") base.setUTCDate(base.getUTCDate() + 1);
  else if (rule === "weekly") base.setUTCDate(base.getUTCDate() + 7);
  else if (rule === "monthly") base.setUTCMonth(base.getUTCMonth() + 1);
  return base.toISOString();
}

export async function saveTaskAction(input: SaveTaskInput): Promise<TaskActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = saveTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: perms } = await supabase.rpc("get_my_family_permissions", {
      p_family_id: parsed.data.familyId,
    });
    const canManage = ((perms as Array<{ permission_key: string }>) ?? []).some(
      (p) => p.permission_key === "tasks.manage_all"
    );
    if (!canManage) {
      return { ok: false, error: "Missing permission: tasks.manage_all" };
    }

    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    if (!actor) return { ok: false, error: "Active membership not found." };

    let calendarEventId: string | null = null;
    if (parsed.data.syncToCalendar && parsed.data.dueAt) {
      const start = new Date(parsed.data.dueAt);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const { data: calEvent } = await supabase
        .from("calendar_events")
        .insert({
          family_id: parsed.data.familyId,
          created_by_member_id: actor.id,
          title: `Task Due: ${parsed.data.title}`,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          category: "tasks",
          color_token: "peach",
        })
        .select("id")
        .maybeSingle<{ id: string }>();
      calendarEventId = calEvent?.id ?? null;
    }

    const assignees = Array.from(new Set(parsed.data.assigneeMemberIds));
    const primaryAssignee = assignees[0] ?? null;

    const taskPayload = {
      family_id: parsed.data.familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      due_at: parsed.data.dueAt,
      points_value: parsed.data.pointsValue,
      recurrence_rule: parsed.data.recurrenceRule,
      assigned_member_id: primaryAssignee,
      ...(calendarEventId ? { calendar_event_id: calendarEventId } : {}),
    };

    let taskId = parsed.data.taskId;
    const isEdit = Boolean(taskId);

    if (taskId) {
      const { error } = await supabase
        .from("tasks")
        .update(taskPayload)
        .eq("id", taskId)
        .eq("family_id", parsed.data.familyId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data: inserted, error } = await supabase
        .from("tasks")
        .insert({ ...taskPayload, created_by_member_id: actor.id })
        .select("id")
        .single<{ id: string }>();
      if (error || !inserted) {
        return { ok: false, error: error?.message ?? "Failed to create task." };
      }
      taskId = inserted.id;
    }

    // Sync multiple assignees
    await supabase.from("task_assignees").delete().eq("task_id", taskId);
    if (assignees.length > 0) {
      await supabase.from("task_assignees").insert(
        assignees.map((memberId) => ({
          family_id: parsed.data.familyId,
          task_id: taskId,
          member_id: memberId,
        }))
      );

      // Notify newly assigned members
      if (!isEdit) {
        await supabase.from("notifications").insert(
          assignees.map((memberId) => ({
            family_id: parsed.data.familyId,
            recipient_member_id: memberId,
            category: "task_assignment",
            domain: "tasks",
            title: `Assigned task: ${parsed.data.title}`,
            body: parsed.data.dueAt ? "Check due date in Tasks" : "New household task",
            deep_link: routes.familyDomain(parsed.data.familyId, "tasks"),
          }))
        );
      }
    }

    // Sync subtasks if provided on creation or explicit edit
    if (parsed.data.subtasks.length > 0 && !isEdit) {
      await supabase.from("task_subtasks").insert(
        parsed.data.subtasks.map((title, idx) => ({
          family_id: parsed.data.familyId,
          task_id: taskId,
          title,
          sort_order: idx,
        }))
      );
    }

    await supabase.from("task_history").insert({
      family_id: parsed.data.familyId,
      task_id: taskId,
      actor_member_id: actor.id,
      event_type: isEdit ? "task.updated" : "task.created",
      details: { title: parsed.data.title },
    });

    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    if (calendarEventId) {
      revalidatePath(routes.familyDomain(parsed.data.familyId, "calendar"));
    }
    return { ok: true, taskId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save task.",
    };
  }
}

export async function toggleTaskStatusAction(
  input: ToggleTaskStatusInput
): Promise<TaskActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = toggleTaskStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid status update." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    const { data: existing } = await supabase
      .from("tasks")
      .select("title, description, category, priority, due_at, points_value, recurrence_rule, assigned_member_id")
      .eq("id", parsed.data.taskId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle();

    const { error } = await supabase
      .from("tasks")
      .update({
        status: parsed.data.nextStatus,
        completed_at:
          parsed.data.nextStatus === "done" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.taskId)
      .eq("family_id", parsed.data.familyId);

    if (error) return { ok: false, error: error.message };

    // Spawn next recurring occurrence when marked done
    if (parsed.data.nextStatus === "done" && existing?.recurrence_rule) {
      await supabase.from("tasks").insert({
        family_id: parsed.data.familyId,
        title: existing.title,
        description: existing.description,
        category: existing.category,
        priority: existing.priority,
        due_at: nextRecurringDueDate(
          existing.due_at,
          existing.recurrence_rule as "daily" | "weekly" | "monthly"
        ),
        points_value: existing.points_value,
        recurrence_rule: existing.recurrence_rule,
        assigned_member_id: existing.assigned_member_id,
        status: "todo",
      });
    }

    await supabase.from("task_history").insert({
      family_id: parsed.data.familyId,
      task_id: parsed.data.taskId,
      actor_member_id: actor?.id ?? null,
      event_type: `status.${parsed.data.nextStatus}`,
    });

    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update task.",
    };
  }
}

export async function toggleSubtaskAction(params: {
  familyId: string;
  subtaskId: string;
  isCompleted: boolean;
}): Promise<TaskActionResult> {
  await requireAuthenticatedUser();
  const parsed = toggleSubtaskSchema.safeParse(params);
  if (!parsed.success) return { ok: false, error: "Invalid subtask." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("task_subtasks")
      .update({ is_completed: parsed.data.isCompleted })
      .eq("id", parsed.data.subtaskId)
      .eq("family_id", parsed.data.familyId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update subtask.",
    };
  }
}

export async function addTaskCommentAction(
  input: AddTaskCommentInput
): Promise<TaskActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = addTaskCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
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

    const { error } = await supabase.from("task_comments").insert({
      family_id: parsed.data.familyId,
      task_id: parsed.data.taskId,
      author_member_id: actor?.id ?? null,
      body: parsed.data.body,
    });
    if (error) return { ok: false, error: error.message };

    await supabase.from("task_history").insert({
      family_id: parsed.data.familyId,
      task_id: parsed.data.taskId,
      actor_member_id: actor?.id ?? null,
      event_type: "comment.added",
    });

    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to post comment.",
    };
  }
}

export async function addTaskAttachmentAction(
  input: AddTaskAttachmentInput
): Promise<TaskActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = addTaskAttachmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid attachment metadata." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: actor } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", parsed.data.familyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();

    const { error } = await supabase.from("task_attachments").insert({
      family_id: parsed.data.familyId,
      task_id: parsed.data.taskId,
      uploaded_by_member_id: actor?.id ?? null,
      file_name: parsed.data.fileName,
      mime_type: parsed.data.mimeType,
      size_bytes: parsed.data.sizeBytes,
      storage_path: `${parsed.data.familyId}/tasks/${parsed.data.taskId}/${parsed.data.fileName}`,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to attach file.",
    };
  }
}

export async function deleteTaskAction(params: {
  familyId: string;
  taskId: string;
}): Promise<TaskActionResult> {
  await requireAuthenticatedUser();
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", params.taskId)
      .eq("family_id", params.familyId);
    if (error) return { ok: false, error: error.message };

    revalidatePath(routes.familyDomain(params.familyId, "tasks"));
    revalidatePath(routes.familyDashboard(params.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete task.",
    };
  }
}
