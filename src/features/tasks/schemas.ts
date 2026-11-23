import { z } from "zod";

export const taskCategorySchema = z.enum([
  "household",
  "chores",
  "school",
  "errands",
  "health",
  "other",
]);

export const saveTaskSchema = z.object({
  familyId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Task title is required.").max(160),
  description: z.string().trim().max(2000).default(""),
  category: taskCategorySchema.default("household"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
  pointsValue: z.number().int().min(0).max(1000).default(0),
  recurrenceRule: z.enum(["daily", "weekly", "monthly"]).nullable().default(null),
  assigneeMemberIds: z.array(z.string().uuid()).default([]),
  subtasks: z.array(z.string().trim().min(1).max(160)).default([]),
  syncToCalendar: z.boolean().default(false),
});

export const toggleTaskStatusSchema = z.object({
  familyId: z.string().uuid(),
  taskId: z.string().uuid(),
  nextStatus: z.enum(["todo", "in_progress", "pending_approval", "done"]),
});

export const toggleSubtaskSchema = z.object({
  familyId: z.string().uuid(),
  subtaskId: z.string().uuid(),
  isCompleted: z.boolean(),
});

export const addTaskCommentSchema = z.object({
  familyId: z.string().uuid(),
  taskId: z.string().uuid(),
  body: z.string().trim().min(1, "Comment cannot be empty.").max(1000),
});

export const addTaskAttachmentSchema = z.object({
  familyId: z.string().uuid(),
  taskId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).default("application/octet-stream"),
  sizeBytes: z.number().int().min(0).max(25_000_000),
});

export type SaveTaskInput = z.infer<typeof saveTaskSchema>;
export type ToggleTaskStatusInput = z.infer<typeof toggleTaskStatusSchema>;
export type AddTaskCommentInput = z.infer<typeof addTaskCommentSchema>;
export type AddTaskAttachmentInput = z.infer<typeof addTaskAttachmentSchema>;
