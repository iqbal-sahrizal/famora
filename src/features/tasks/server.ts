import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/types/domain";

export interface TaskItemView {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "pending_approval" | "done";
  priority: "low" | "normal" | "high";
  category: "household" | "chores" | "school" | "errands" | "health" | "other";
  dueAt: string | null;
  pointsValue: number;
  recurrenceRule: "daily" | "weekly" | "monthly" | null;
  completedAt: string | null;
  assignees: Array<{ memberId: string; displayName: string }>;
  subtasks: Array<{ id: string; title: string; isCompleted: boolean }>;
  comments: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
  attachments: Array<{ id: string; fileName: string; sizeBytes: number }>;
  history: Array<{ id: string; actorName: string; eventType: string; createdAt: string }>;
}

export interface TasksPageData {
  currentMemberId: string | null;
  canManageAll: boolean;
  canApproveChores: boolean;
  members: Array<{ id: string; displayName: string }>;
  tasks: TaskItemView[];
}

export async function getTasksPageData(
  familyId: string,
  userId: string
): Promise<TasksPageData> {
  const fallback: TasksPageData = {
    currentMemberId: null,
    canManageAll: false,
    canApproveChores: false,
    members: [],
    tasks: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: perms }, { data: membersData }, { data: tasksData }] =
      await Promise.all([
        supabase.rpc("get_my_family_permissions", { p_family_id: familyId }),
        supabase
          .from("family_members")
          .select("id, user_id, display_name")
          .eq("family_id", familyId)
          .eq("status", "active"),
        supabase
          .from("tasks")
          .select(
            `
            id, title, description, status, priority, category, due_at, points_value,
            recurrence_rule, completed_at, assigned_member_id,
            task_assignees(member_id),
            task_subtasks(id, title, is_completed, sort_order),
            task_comments(id, author_member_id, body, created_at),
            task_attachments(id, file_name, size_bytes),
            task_history(id, actor_member_id, event_type, created_at)
          `
          )
          .eq("family_id", familyId)
          .order("created_at", { ascending: false }),
      ]);

    const permSet = new Set(
      ((perms as Array<{ permission_key: PermissionKey }>) ?? []).map(
        (p) => p.permission_key
      )
    );

    const members = ((membersData ?? []) as Array<{
      id: string;
      user_id: string | null;
      display_name: string;
    }>).map((m) => ({
      id: m.id,
      userId: m.user_id,
      displayName: m.display_name,
    }));

    const memberMap = new Map(members.map((m) => [m.id, m.displayName]));
    const currentMember = members.find((m) => m.userId === userId) ?? null;

    const tasks: TaskItemView[] = (
      (tasksData as unknown as Array<{
        id: string;
        title: string;
        description: string;
        status: TaskItemView["status"];
        priority: TaskItemView["priority"];
        category: TaskItemView["category"];
        due_at: string | null;
        points_value: number;
        recurrence_rule: TaskItemView["recurrenceRule"];
        completed_at: string | null;
        assigned_member_id: string | null;
        task_assignees: Array<{ member_id: string }>;
        task_subtasks: Array<{
          id: string;
          title: string;
          is_completed: boolean;
          sort_order: number;
        }>;
        task_comments: Array<{
          id: string;
          author_member_id: string | null;
          body: string;
          created_at: string;
        }>;
        task_attachments: Array<{
          id: string;
          file_name: string;
          size_bytes: number;
        }>;
        task_history: Array<{
          id: string;
          actor_member_id: string | null;
          event_type: string;
          created_at: string;
        }>;
      }>) ?? []
    ).map((t) => {
      const assigneeIds = Array.from(
        new Set([
          ...(t.assigned_member_id ? [t.assigned_member_id] : []),
          ...(t.task_assignees ?? []).map((a) => a.member_id),
        ])
      );
      return {
        id: t.id,
        title: t.title,
        description: t.description ?? "",
        status: t.status,
        priority: t.priority,
        category: t.category ?? "household",
        dueAt: t.due_at,
        pointsValue: t.points_value,
        recurrenceRule: t.recurrence_rule,
        completedAt: t.completed_at,
        assignees: assigneeIds.map((id) => ({
          memberId: id,
          displayName: memberMap.get(id) ?? "Member",
        })),
        subtasks: (t.task_subtasks ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({
            id: s.id,
            title: s.title,
            isCompleted: s.is_completed,
          })),
        comments: (t.task_comments ?? []).map((c) => ({
          id: c.id,
          authorName: c.author_member_id
            ? memberMap.get(c.author_member_id) ?? "Member"
            : "Member",
          body: c.body,
          createdAt: c.created_at,
        })),
        attachments: (t.task_attachments ?? []).map((a) => ({
          id: a.id,
          fileName: a.file_name,
          sizeBytes: a.size_bytes,
        })),
        history: (t.task_history ?? []).map((h) => ({
          id: h.id,
          actorName: h.actor_member_id
            ? memberMap.get(h.actor_member_id) ?? "System"
            : "System",
          eventType: h.event_type,
          createdAt: h.created_at,
        })),
      };
    });

    return {
      currentMemberId: currentMember?.id ?? null,
      canManageAll: permSet.has("tasks.manage_all"),
      canApproveChores: permSet.has("tasks.approve_chores"),
      members: members.map(({ id, displayName }) => ({ id, displayName })),
      tasks,
    };
  } catch {
    return fallback;
  }
}
