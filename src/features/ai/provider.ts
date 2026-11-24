import type { PermissionKey } from "@/types/domain";
import {
  buildSanitizedPromptContext,
  canExecuteAiTool,
  validateAiToolCall,
} from "./policy";
import type {
  AiProposedAction,
  AiToolCallRecord,
  AiToolName,
  AuthorizedFamilyContext,
} from "./types";

export interface AiGenerationResult {
  content: string;
  providerName: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  toolCalls: AiToolCallRecord[];
  proposedAction: AiProposedAction | null;
}

function detectIntentTools(prompt: string): AiToolName[] {
  const lower = prompt.toLowerCase();
  const tools: AiToolName[] = [];

  if (/(agenda|jadwal|calendar|event|minggu ini|weekend|akhir pekan)/.test(lower)) {
    tools.push("get_calendar_agenda");
  }
  if (/(shopping|belanja|grocer|beli)/.test(lower)) {
    tools.push("generate_shopping_list_draft");
  }
  if (/(meal|makan|resep|recipe|menu)/.test(lower)) {
    tools.push("suggest_meal_plan");
  }
  if (/(expense|pengeluaran|spending|uang|bulan ini)/.test(lower)) {
    tools.push("get_expense_summary");
  }
  if (/(bill|tagihan|budget|anggaran|bayar)/.test(lower)) {
    tools.push("get_budget_and_bills_analysis");
  }
  if (/(task|tugas|chore|todo)/.test(lower)) {
    tools.push("get_task_recommendations");
  }
  if (/(routine|habit|kebiasaan|rutin)/.test(lower)) {
    tools.push("suggest_family_routines");
  }
  if (/(remind|ingat|pengingat)/.test(lower)) {
    tools.push("suggest_reminders");
  }
  if (tools.length === 0) {
    tools.push("get_family_activity_summary", "get_calendar_agenda");
  }
  return tools;
}

function buildLocalContextResponse(params: {
  prompt: string;
  context: AuthorizedFamilyContext;
  permissions: Set<PermissionKey>;
}): {
  content: string;
  toolCalls: AiToolCallRecord[];
  proposedAction: AiProposedAction | null;
} {
  const requestedTools = detectIntentTools(params.prompt);
  const toolCalls: AiToolCallRecord[] = [];
  const sections: string[] = [];
  let proposedAction: AiProposedAction | null = null;

  for (const tool of requestedTools) {
    const check = validateAiToolCall(tool, {});
    const allowed = check.valid && canExecuteAiTool(tool, params.permissions);
    toolCalls.push({
      tool,
      args: check.parsed ?? {},
      status: allowed ? "executed" : "denied",
    });

    if (!allowed) {
      if (
        tool === "get_expense_summary" ||
        tool === "get_budget_and_bills_analysis"
      ) {
        sections.push(
          "• **Finance access restricted**: You don't have permission (`finance.family.view`) to view family expenses or bills."
        );
      }
      continue;
    }

    switch (tool) {
      case "get_calendar_agenda": {
        if (params.context.calendarEvents.length === 0) {
          sections.push("• **Agenda (7 days)**: No upcoming events scheduled yet.");
        } else {
          const list = params.context.calendarEvents
            .slice(0, 5)
            .map(
              (e) =>
                `  - ${e.title} (${new Date(e.startsAt).toLocaleDateString()})`
            )
            .join("\n");
          sections.push(`• **Upcoming Calendar Agenda**:\n${list}`);
        }
        break;
      }
      case "get_task_recommendations": {
        if (params.context.pendingTasks.length === 0) {
          sections.push("• **Tasks**: All current family tasks are clear!");
        } else {
          const list = params.context.pendingTasks
            .slice(0, 5)
            .map((t) => `  - [${t.priority}] ${t.title}`)
            .join("\n");
          sections.push(`• **Recommended Tasks to Tackle Next**:\n${list}`);
        }
        break;
      }
      case "generate_shopping_list_draft": {
        const draftItems = [
          { name: "Fresh Milk", category: "Dairy", quantity: "2" },
          { name: "Eggs", category: "Dairy", quantity: "12" },
          { name: "Seasonal Vegetables", category: "Produce", quantity: "1" },
          { name: "Wholegrain Bread", category: "Bakery", quantity: "1" },
        ];
        sections.push(
          `• **Suggested Shopping List Draft** (existing unchecked items: ${params.context.shoppingItems.length}):\n` +
            draftItems
              .map((i) => `  - ${i.name} (${i.quantity}) [${i.category}]`)
              .join("\n")
        );
        proposedAction = {
          actionType: "create_shopping_items",
          tier: "requires_confirmation",
          summary: `Add ${draftItems.length} suggested staples to your Family Shopping List`,
          payload: { items: draftItems },
        };
        break;
      }
      case "get_expense_summary": {
        const total = (params.context.financeSummary.monthlyExpenseCents / 100).toFixed(2);
        const income = (params.context.financeSummary.monthlyIncomeCents / 100).toFixed(2);
        sections.push(
          `• **This Month's Cash Flow**: Expenses ${total} · Income ${income} (computed from persisted transactions).`
        );
        break;
      }
      case "get_budget_and_bills_analysis": {
        const bills = params.context.financeSummary.unpaidBills;
        if (bills.length === 0) {
          sections.push("• **Bills**: No unpaid household bills pending.");
        } else {
          const list = bills
            .slice(0, 5)
            .map(
              (b) =>
                `  - ${b.title} (due ${b.dueOn}, ${(b.amountCents / 100).toFixed(2)})`
            )
            .join("\n");
          sections.push(`• **Upcoming Unpaid Bills**:\n${list}`);
        }
        break;
      }
      case "suggest_meal_plan": {
        const recipeTitles = params.context.recipes.map((r) => r.title);
        sections.push(
          recipeTitles.length > 0
            ? `• **Meal Suggestions from Your Recipes**: ${recipeTitles.join(", ")}`
            : "• **Meal Planning Idea**: Try pairing a quick breakfast (oatmeal/eggs), packed lunch, and a one-pan family dinner."
        );
        break;
      }
      case "suggest_family_routines": {
        sections.push(
          params.context.habits.length > 0
            ? `• **Active Routines**: ${params.context.habits.map((h) => `${h.title} (${h.cadence})`).join(", ")}`
            : "• **Routine Suggestion**: Start with a 15-minute evening tidy-up and 20-page family reading window."
        );
        break;
      }
      case "suggest_reminders":
      case "get_family_activity_summary": {
        sections.push(
          `• **Family Snapshot (${params.context.familyName})**: ${params.context.calendarEvents.length} upcoming events, ${params.context.pendingTasks.length} open tasks, ${params.context.shoppingItems.length} shopping items.`
        );
        break;
      }
    }
  }

  return {
    content: sections.join("\n\n"),
    toolCalls,
    proposedAction,
  };
}

export async function generateAiAssistantResponse(params: {
  prompt: string;
  context: AuthorizedFamilyContext;
  permissions: Set<PermissionKey>;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AiGenerationResult> {
  const local = buildLocalContextResponse(params);

  // Server-only OpenAI-compatible provider if configured
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
      const sanitizedContext = buildSanitizedPromptContext(params.context);
      const priorMessages = (params.history ?? []).slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                `You are Senvamily AI, a warm, concise family assistant. Answer using ONLY the authorized JSON context provided. Never invent numbers or expose restricted data. Reply in the same language as the user (Indonesian or English).\n\nAuthorized Context:\n${JSON.stringify(sanitizedContext)}`,
            },
            ...priorMessages,
            {
              role: "user",
              content: params.prompt,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) {
          return {
            content: text,
            providerName: "openai",
            modelName: model,
            promptTokens: json.usage?.prompt_tokens ?? 0,
            completionTokens: json.usage?.completion_tokens ?? 0,
            toolCalls: local.toolCalls,
            proposedAction: local.proposedAction,
          };
        }
      }
    } catch {
      // Fall back gracefully to local context engine
    }
  }

  return {
    content: local.content,
    providerName: "famora_local",
    modelName: "context_engine_v1",
    promptTokens: Math.ceil(params.prompt.length / 4),
    completionTokens: Math.ceil(local.content.length / 4),
    toolCalls: local.toolCalls,
    proposedAction: local.proposedAction,
  };
}
