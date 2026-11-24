"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { validateDocumentFile } from "@/features/documents/validation";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyFamilyMembers } from "@/features/notifications/triggers";
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

const taskTargetSchema = z.object({
  familyId: z.string().uuid(),
  taskId: z.string().uuid(),
});

async function getTaskActorContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  familyId: string,
  userId: string
): Promise<{
  actorId: string | null;
  canManageAll: boolean;
}> {
  const [{ data: actor }, { data: perms }] = await Promise.all([
    supabase
      .from("family_members")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle<{ id: string }>(),
    supabase.rpc("get_my_family_permissions", {
      p_family_id: familyId,
    }),
  ]);

  const canManageAll = ((perms as Array<{ permission_key: string }>) ?? []).some(
    (p) => p.permission_key === "tasks.manage_all"
  );

  return {
    actorId: actor?.id ?? null,
    canManageAll,
  };
}

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
    if (!isEdit && parsed.data.assigneeMemberIds.length > 0) {
      void notifyFamilyMembers({
        familyId: parsed.data.familyId,
        onlyMemberIds: parsed.data.assigneeMemberIds,
        excludeMemberId: actor.id,
        category: "task_assignment",
        domain: "tasks",
        title: parsed.data.title,
        body: "Anda mendapat tugas keluarga baru.",
        deepLink: routes.familyDomain(parsed.data.familyId, "tasks"),
        idempotencyPrefix: `task-assigned:${taskId}`,
      });
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
    const { actorId, canManageAll } = await getTaskActorContext(
      supabase,
      parsed.data.familyId,
      user.id
    );
    if (!actorId) {
      return { ok: false, error: "Active family membership required." };
    }

    const { data: existing } = await supabase
      .from("tasks")
      .select(
        "id, status, title, description, category, priority, due_at, points_value, recurrence_rule, assigned_member_id"
      )
      .eq("id", parsed.data.taskId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{
        id: string;
        status: string;
        title: string;
        description: string;
        category: string;
        priority: string;
        due_at: string | null;
        points_value: number;
        recurrence_rule: string | null;
        assigned_member_id: string | null;
      }>();

    if (!existing) {
      return { ok: false, error: "Task not found." };
    }

    let canToggle = canManageAll || existing.assigned_member_id === actorId;
    if (!canToggle) {
      const { data: assigneeRow } = await supabase
        .from("task_assignees")
        .select("member_id")
        .eq("task_id", existing.id)
        .eq("member_id", actorId)
        .maybeSingle<{ member_id: string }>();
      canToggle = Boolean(assigneeRow);
    }

    if (!canToggle) {
      return {
        ok: false,
        error: "You do not have permission to update this task.",
      };
    }

    // Idempotency guard: avoid duplicate history or double recurring task spawn
    if (existing.status === parsed.data.nextStatus) {
      return { ok: true, taskId: existing.id };
    }

    const { data: updated, error } = await supabase
      .from("tasks")
      .update({
        status: parsed.data.nextStatus,
        completed_at:
          parsed.data.nextStatus === "done" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.taskId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!updated) {
      return { ok: false, error: "Task not found or not authorized." };
    }

    // Spawn next recurring occurrence when marked done
    if (parsed.data.nextStatus === "done" && existing.recurrence_rule) {
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
      actor_member_id: actorId,
      event_type: `status.${parsed.data.nextStatus}`,
    });

    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true, taskId: existing.id };
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

export async function uploadTaskAttachmentAction(
  formData: FormData
): Promise<TaskActionResult> {
  const user = await requireAuthenticatedUser();
  const familyId = String(formData.get("familyId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const parsedIds = taskTargetSchema.safeParse({ familyId, taskId });
  if (!parsedIds.success) {
    return { ok: false, error: "Invalid task reference." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Select a file to upload." };
  }
  const fileCheck = validateDocumentFile({
    name: file.name,
    type: file.type,
    size: Math.min(file.size, 10 * 1024 * 1024 + 1),
  });
  if (!fileCheck.valid || !fileCheck.safeName) {
    return { ok: false, error: fileCheck.error ?? "Invalid file." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "File size must be 10 MB or less." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { actorId } = await getTaskActorContext(
      supabase,
      parsedIds.data.familyId,
      user.id
    );
    if (!actorId) {
      return { ok: false, error: "Active family membership required." };
    }

    const { data: task } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", parsedIds.data.taskId)
      .eq("family_id", parsedIds.data.familyId)
      .maybeSingle<{ id: string }>();
    if (!task) {
      return { ok: false, error: "Task not found." };
    }

    const storagePath = `${parsedIds.data.familyId}/tasks/${parsedIds.data.taskId}/${crypto.randomUUID()}-${fileCheck.safeName}`;
    const { error: uploadErr } = await supabase.storage
      .from("family-tasks")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) return { ok: false, error: uploadErr.message };

    const { error: insertErr } = await supabase.from("task_attachments").insert({
      family_id: parsedIds.data.familyId,
      task_id: parsedIds.data.taskId,
      uploaded_by_member_id: actorId,
      file_name: fileCheck.safeName,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: storagePath,
    });

    if (insertErr) {
      await supabase.storage.from("family-tasks").remove([storagePath]);
      return { ok: false, error: insertErr.message };
    }

    revalidatePath(routes.familyDomain(parsedIds.data.familyId, "tasks"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to upload attachment.",
    };
  }
}

export async function getTaskAttachmentSignedUrlAction(params: {
  familyId: string;
  attachmentId: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const user = await requireAuthenticatedUser();
  const parsed = z
    .object({ familyId: z.string().uuid(), attachmentId: z.string().uuid() })
    .safeParse(params);
  if (!parsed.success) return { ok: false, error: "Invalid attachment reference." };

  try {
    const supabase = await createSupabaseServerClient();
    const { actorId } = await getTaskActorContext(
      supabase,
      parsed.data.familyId,
      user.id
    );
    if (!actorId) return { ok: false, error: "Active family membership required." };

    const { data: att } = await supabase
      .from("task_attachments")
      .select("id, storage_path")
      .eq("id", parsed.data.attachmentId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{ id: string; storage_path: string }>();
    if (!att) return { ok: false, error: "Attachment not found." };

    const { data: signed, error: signErr } = await supabase.storage
      .from("family-tasks")
      .createSignedUrl(att.storage_path, 60);
    if (signErr || !signed?.signedUrl) {
      return { ok: false, error: signErr?.message ?? "Could not generate download link." };
    }

    return { ok: true, url: signed.signedUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to open attachment.",
    };
  }
}

export async function deleteTaskAttachmentAction(params: {
  familyId: string;
  attachmentId: string;
}): Promise<TaskActionResult> {
  const user = await requireAuthenticatedUser();
  const parsed = z
    .object({ familyId: z.string().uuid(), attachmentId: z.string().uuid() })
    .safeParse(params);
  if (!parsed.success) return { ok: false, error: "Invalid attachment reference." };

  try {
    const supabase = await createSupabaseServerClient();
    const { actorId, canManageAll } = await getTaskActorContext(
      supabase,
      parsed.data.familyId,
      user.id
    );
    if (!actorId) return { ok: false, error: "Active family membership required." };

    const { data: att } = await supabase
      .from("task_attachments")
      .select("id, storage_path, uploaded_by_member_id")
      .eq("id", parsed.data.attachmentId)
      .eq("family_id", parsed.data.familyId)
      .maybeSingle<{
        id: string;
        storage_path: string;
        uploaded_by_member_id: string | null;
      }>();
    if (!att) return { ok: false, error: "Attachment not found." };

    if (!canManageAll && att.uploaded_by_member_id !== actorId) {
      return { ok: false, error: "Not authorized to delete this attachment." };
    }

    const { data: deleted, error: delErr } = await supabase
      .from("task_attachments")
      .delete()
      .eq("id", parsed.data.attachmentId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();
    if (delErr) return { ok: false, error: delErr.message };
    if (!deleted) return { ok: false, error: "Attachment not found." };

    await supabase.storage.from("family-tasks").remove([att.storage_path]);
    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete attachment.",
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

    if (!actor) return { ok: false, error: "Active family membership required." };

    const { error } = await supabase.from("task_attachments").insert({
      family_id: parsed.data.familyId,
      task_id: parsed.data.taskId,
      uploaded_by_member_id: actor.id,
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
  const user = await requireAuthenticatedUser();
  const parsed = taskTargetSchema.safeParse(params);
  if (!parsed.success) return { ok: false, error: "Invalid task reference." };

  try {
    const supabase = await createSupabaseServerClient();
    const { actorId, canManageAll } = await getTaskActorContext(
      supabase,
      parsed.data.familyId,
      user.id
    );
    if (!actorId) {
      return { ok: false, error: "Active family membership required." };
    }
    if (!canManageAll) {
      return { ok: false, error: "Missing permission: tasks.manage_all" };
    }

    const { data: deleted, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data.taskId)
      .eq("family_id", parsed.data.familyId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!deleted) return { ok: false, error: "Task not found or not authorized." };

    revalidatePath(routes.familyDomain(parsed.data.familyId, "tasks"));
    revalidatePath(routes.familyDashboard(parsed.data.familyId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete task.",
    };
  }
}
