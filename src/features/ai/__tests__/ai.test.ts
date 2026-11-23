import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@/types/domain";
import {
  buildSanitizedPromptContext,
  canExecuteAiTool,
  checkAiRateLimit,
  classifyAiActionTier,
  validateAiToolCall,
} from "../policy";
import type { AuthorizedFamilyContext } from "../types";

describe("Famora AI Assistant — Permissions, Action Safety & Tool Validation", () => {
  it("enforces RBAC permissions on AI tool calls (blocking unauthorized finance access)", () => {
    const childPerms = new Set<PermissionKey>([
      "ai.assistant.use",
      "calendar.family.manage",
    ]);
    const parentPerms = new Set<PermissionKey>([
      "ai.assistant.use",
      "calendar.family.manage",
      "tasks.manage_all",
      "finance.transactions.manage",
      "shopping.manage",
    ]);

    expect(canExecuteAiTool("get_calendar_agenda", childPerms)).toBe(true);
    expect(canExecuteAiTool("get_expense_summary", childPerms)).toBe(false);
    expect(canExecuteAiTool("get_budget_and_bills_analysis", childPerms)).toBe(
      false
    );
    expect(canExecuteAiTool("generate_shopping_list_draft", childPerms)).toBe(
      false
    );

    expect(canExecuteAiTool("get_expense_summary", parentPerms)).toBe(true);
    expect(canExecuteAiTool("generate_shopping_list_draft", parentPerms)).toBe(
      true
    );
  });

  it("classifies restricted actions and consequential actions separately", () => {
    expect(classifyAiActionTier("transfer_money")).toBe("restricted");
    expect(classifyAiActionTier("delete_document")).toBe("restricted");
    expect(classifyAiActionTier("change_permissions")).toBe("restricted");
    expect(classifyAiActionTier("invite_member")).toBe("restricted");
    expect(classifyAiActionTier("modify_child_health_record")).toBe(
      "restricted"
    );

    expect(classifyAiActionTier("create_shopping_items")).toBe(
      "requires_confirmation"
    );
    expect(classifyAiActionTier("draft_meal_plan")).toBe("draft");
    expect(classifyAiActionTier("get_calendar_agenda")).toBe("read_only");
  });

  it("validates AI tool-call arguments with Zod", () => {
    expect(
      validateAiToolCall("get_calendar_agenda", { daysAhead: 7 }).valid
    ).toBe(true);
    expect(
      validateAiToolCall("get_calendar_agenda", { daysAhead: 999 }).valid
    ).toBe(false);
    expect(
      validateAiToolCall("get_expense_summary", { period: "invalid_period" })
        .valid
    ).toBe(false);
  });

  it("strips unauthorized finance and never includes child health or private documents in prompt context", () => {
    const ctx: AuthorizedFamilyContext = {
      familyName: "Sahrizal Family",
      memberName: "Child",
      calendarEvents: [{ title: "Soccer", startsAt: "2026-11-24T10:00:00Z" }],
      pendingTasks: [],
      shoppingItems: [],
      recipes: [],
      habits: [],
      recentActivities: [],
      financeSummary: {
        authorized: false,
        monthlyExpenseCents: 999999,
        monthlyIncomeCents: 888888,
        unpaidBills: [{ title: "Secret Bill", dueOn: "2026-11-25", amountCents: 50000 }],
      },
    };

    const sanitized = buildSanitizedPromptContext(ctx);
    expect(sanitized.financeSummary).toEqual({ authorized: false });
    expect(JSON.stringify(sanitized)).not.toContain("Secret Bill");
    expect(JSON.stringify(sanitized)).not.toContain("999999");
  });

  it("enforces per-member hourly rate limits", () => {
    expect(checkAiRateLimit(5, 30)).toEqual({ allowed: true, remaining: 25 });
    expect(checkAiRateLimit(30, 30)).toEqual({ allowed: false, remaining: 0 });
  });
});
