export type AiActionTier =
  | "read_only"
  | "draft"
  | "requires_confirmation"
  | "restricted";

export type AiToolName =
  | "get_family_activity_summary"
  | "get_calendar_agenda"
  | "get_task_recommendations"
  | "generate_shopping_list_draft"
  | "suggest_meal_plan"
  | "get_expense_summary"
  | "get_budget_and_bills_analysis"
  | "suggest_reminders"
  | "suggest_family_routines";

export interface AiProposedAction {
  actionType:
    | "create_shopping_items"
    | "create_task"
    | "create_calendar_event";
  tier: "requires_confirmation";
  summary: string;
  payload: Record<string, unknown>;
}

export interface AiToolCallRecord {
  tool: AiToolName;
  args: Record<string, unknown>;
  status: "executed" | "denied";
}

export interface AiMessageItem {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: AiToolCallRecord[];
  proposedAction: AiProposedAction | null;
  actionStatus: "none" | "pending_confirmation" | "confirmed" | "cancelled";
  providerName: string;
  modelName: string;
  createdAt: string;
}

export interface AiConversationItem {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AuthorizedFamilyContext {
  familyName: string;
  memberName: string;
  calendarEvents: Array<{ title: string; startsAt: string }>;
  pendingTasks: Array<{ title: string; priority: string; dueAt: string | null }>;
  shoppingItems: Array<{ name: string; quantity: string; category: string }>;
  recipes: Array<{ title: string; category: string }>;
  habits: Array<{ title: string; cadence: string }>;
  recentActivities: Array<{ action: string; createdAt: string }>;
  financeSummary: {
    authorized: boolean;
    monthlyExpenseCents: number;
    monthlyIncomeCents: number;
    unpaidBills: Array<{ title: string; dueOn: string; amountCents: number }>;
  };
}

export interface AiAssistantPageData {
  canUse: boolean;
  canViewFinance: boolean;
  conversations: AiConversationItem[];
  activeConversationId: string | null;
  messages: AiMessageItem[];
  rateLimitRemaining: number;
}
