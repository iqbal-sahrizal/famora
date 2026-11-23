# Famora — Backend Integration Audit

---

## 1. Runtime Schema / Query Mismatches

| File & Function | Broken Query / Bucket | Actual Schema | Impact |
| :--- | :--- | :--- | :--- |
| `src/features/workspace/server.ts:36–40` (`getWorkspaceShellContext`) | `profiles.select("display_name")` | `profiles.full_name` (`0002:4–12`) | Query fails on every workspace load; silently falls back to `fallbackName`. |
| `src/features/ai/context.ts:35–39` (`retrieveAuthorizedFamilyContext`) | `calendar_events` `starts_at` | `start_at` (`0012:11`) | Calendar context query fails. |
| `src/features/ai/context.ts:56` | `recipes.category` | No `category` column (`0022:41–52`) | Recipes context query fails. |
| `src/features/ai/context.ts:84,98–101` | `finance_transactions.tx_type` | `kind` (`0018`, `finance/server.ts:97`) | Finance transactions context query fails. |
| `src/features/ai/context.ts:89,112,117` | `household_bills.amount_cents` | `amount_numeric` (`0019:47–58`) | Household bills context query fails. |
| `src/features/settings/actions.ts:348` (`deleteFamilyAction`) | Storage bucket `"family-chat"` | `"chat-attachments"` (`0024:4–7`) | Chat attachments are orphaned on family deletion. |

---

## 2. Authorization & Validation Gaps in Server Actions

### Actions Relying Solely on RLS (No TS `get_my_family_permissions` / Role Check)
- **Dashboard (`src/features/dashboard/actions.ts`):** `quickAddTaskAction` (`:25–51`, also omits `created_by_member_id`), `quickAddShoppingItemAction` (`:53–78`), `toggleShoppingItemAction` (`:80–108`).
- **Members (`src/features/members/actions.ts`):** `inviteFamilyMemberAction`, `resendInvitationAction`, `revokeInvitationAction`, `updateMemberRoleAction`, `updateMemberStatusAction`, `removeMemberAction` (`:28–322`).
- **Calendar / Tasks / Shopping:** `cancelCalendarEventAction` (`calendar/actions.ts:146–170`), `toggleTaskStatusAction`/`toggleSubtaskAction`/`deleteTaskAction` (`tasks/actions.ts:184–390`), `createShoppingListAction`/`addShoppingItemAction`/`toggleShoppingCheckAction`/`updateShoppingQuantityAction`/`saveShoppingTemplateAction`/`applyShoppingTemplateAction` (`shopping/actions.ts:41–379`).
- **Finance:** `createBudgetAction`, `createBillAction`, `createRecurringScheduleAction` (`budget-actions.ts:49–185`), `createFinanceGoalAction`, `createDebtReceivableAction` (`analytics-actions.ts:39–107`).
- **Documents & Chat:** `deleteDocumentAction` (`documents/actions.ts:227–275`, omits `.eq("status", "active")`), `deleteChatMessageAction` (`chat/actions.ts:302–320`, omits sender/admin check in TS).

### Actions Missing Zod Schema Validation
- `cancelCalendarEventAction`, `deleteTaskAction`, `payBillAction`, `runDueRecurringSchedulesAction`, `applyShoppingTemplateAction`, `toggleAnnouncementArchiveAction`, `markAnnouncementReadAction`, `restockToShoppingAction`, `syncMealIngredientsToShoppingAction`, `completeMaintenanceTaskAction`, `getDocumentSignedUrlAction`, `deleteDocumentAction`, `deleteChatMessageAction`, `toggleChatReactionAction`, `togglePinChatMessageAction`, `markConversationReadAction`, `loadConversationMessagesAction`, `createDirectConversationAction`, `getChatAttachmentSignedUrlAction`, `updateAlbumSharingAction`, `toggleMemoryFavoriteAction`, `deleteMemoryAction`, `getMemorySignedUrlAction`, `logHabitCompletionAction`, `archiveHabitAction`, `deleteSafetyContactAction`, `revokeLocationShareAction`, `markNotificationReadAction`, `markAllNotificationsReadAction`, `revokeDeviceSubscriptionAction`, `retryOutboxDispatchAction`, `confirmAiProposedAction`, `cancelAiProposedAction`.

---

## 3. Non-Transactional Multi-Step Writes & Silent Error Masking

- **Non-transactional writes with ignored secondary errors:** `saveCalendarEventAction`, `saveTaskAction`, `toggleTaskStatusAction`, `createPollAction` (can leave poll with 0 options), `createDirectConversationAction` / `createTopicConversationAction` (can leave conversation without participants), `createInventoryItemAction`, `adjustInventoryAction`, `createMaintenanceTaskAction`, `completeMaintenanceTaskAction`, `toggleShoppingCheckAction`, `createBillAction`, `uploadDocumentAction`, `deleteDocumentAction`, `sendAiPromptAction`.
- **Silent `try { ... } catch { return empty/denied }`:** Nearly all `server.ts` loaders catch all errors without logging, masking SQL/network failures as empty states or access denials.
- **Truncated / Inaccurate Aggregates:**
  - `src/features/chores/server.ts:112–150`: `myPointsBalance` sums only the `.limit(40)` ledger slice.
  - `src/features/finance/server.ts:94–157`: `totalIncomeNumeric` / `totalExpenseNumeric` sum only `.limit(60)` transactions, and `totalBalanceNumeric` includes archived accounts.
- **AI Stream Route (`src/app/api/ai/stream/route.ts`):** Simulates streaming by slicing completed text into 36-char chunks every 12ms and queries `ai_usage_logs` for rate-limiting without inserting a usage log row after streaming.
