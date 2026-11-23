import { z } from "zod";
import type { PermissionKey } from "@/types/domain";
import type {
  AiActionTier,
  AiToolName,
  AuthorizedFamilyContext,
} from "./types";

export const AI_RATE_LIMIT_PER_HOUR = 30;

export const RESTRICTED_ACTIONS = new Set([
  "transfer_money",
  "delete_document",
  "change_permissions",
  "invite_member",
  "modify_child_health_record",
]);

const TOOL_REQUIRED_PERMISSIONS: Record<AiToolName, PermissionKey[]> = {
  get_family_activity_summary: ["ai.assistant.use"],
  get_calendar_agenda: ["ai.assistant.use"],
  get_task_recommendations: ["ai.assistant.use"],
  generate_shopping_list_draft: ["ai.assistant.use", "shopping.manage"],
  suggest_meal_plan: ["ai.assistant.use"],
  get_expense_summary: ["ai.assistant.use", "finance.transactions.manage"],
  get_budget_and_bills_analysis: ["ai.assistant.use", "finance.transactions.manage"],
  suggest_reminders: ["ai.assistant.use"],
  suggest_family_routines: ["ai.assistant.use"],
};

export function canExecuteAiTool(
  toolName: AiToolName,
  permissions: Set<PermissionKey>
): boolean {
  const required = TOOL_REQUIRED_PERMISSIONS[toolName];
  return required.every((p) => permissions.has(p));
}

export function classifyAiActionTier(actionName: string): AiActionTier {
  if (RESTRICTED_ACTIONS.has(actionName)) {
    return "restricted";
  }
  if (
    actionName === "create_shopping_items" ||
    actionName === "create_task" ||
    actionName === "create_calendar_event"
  ) {
    return "requires_confirmation";
  }
  if (
    actionName === "draft_shopping_list" ||
    actionName === "draft_meal_plan"
  ) {
    return "draft";
  }
  return "read_only";
}

export const toolCallSchemas: Record<AiToolName, z.ZodTypeAny> = {
  get_family_activity_summary: z.object({ days: z.number().int().min(1).max(30).default(7) }),
  get_calendar_agenda: z.object({ daysAhead: z.number().int().min(1).max(30).default(7) }),
  get_task_recommendations: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
  generate_shopping_list_draft: z.object({ mealCount: z.number().int().min(1).max(14).default(5) }),
  suggest_meal_plan: z.object({ days: z.number().int().min(1).max(7).default(7) }),
  get_expense_summary: z.object({ period: z.enum(["current_month", "last_30_days"]).default("current_month") }),
  get_budget_and_bills_analysis: z.object({ daysAhead: z.number().int().min(1).max(30).default(7) }),
  suggest_reminders: z.object({ horizonDays: z.number().int().min(1).max(14).default(7) }),
  suggest_family_routines: z.object({ focus: z.enum(["morning", "evening", "weekend", "all"]).default("all") }),
};

export function validateAiToolCall(
  toolName: AiToolName,
  args: unknown
): { valid: boolean; parsed?: Record<string, unknown>; error?: string } {
  const schema = toolCallSchemas[toolName];
  if (!schema) return { valid: false, error: "Unknown tool." };
  const result = schema.safeParse(args ?? {});
  if (!result.success) {
    return {
      valid: false,
      error: result.error.issues[0]?.message ?? "Invalid tool arguments.",
    };
  }
  return { valid: true, parsed: result.data as Record<string, unknown> };
}

export function checkAiRateLimit(
  recentRequestsInLastHour: number,
  limitPerHour = AI_RATE_LIMIT_PER_HOUR
): { allowed: boolean; remaining: number } {
  const remaining = Math.max(0, limitPerHour - recentRequestsInLastHour);
  return {
    allowed: recentRequestsInLastHour < limitPerHour,
    remaining,
  };
}

/**
 * Strips any sensitive fields and enforces that child health records or private vault
 * documents are never serialized into external AI prompts.
 */
export function buildSanitizedPromptContext(
  ctx: AuthorizedFamilyContext
): Record<string, unknown> {
  return {
    familyName: ctx.familyName,
    memberName: ctx.memberName,
    calendarEvents: ctx.calendarEvents.slice(0, 10),
    pendingTasks: ctx.pendingTasks.slice(0, 10),
    shoppingItems: ctx.shoppingItems.slice(0, 15),
    recipes: ctx.recipes.slice(0, 10),
    habits: ctx.habits.slice(0, 10),
    recentActivities: ctx.recentActivities.slice(0, 8),
    financeSummary: ctx.financeSummary.authorized
      ? ctx.financeSummary
      : { authorized: false },
  };
}

export const aiPromptInputSchema = z.object({
  familyId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().default(null),
  prompt: z.string().trim().min(1, "Enter a message.").max(2000),
});
