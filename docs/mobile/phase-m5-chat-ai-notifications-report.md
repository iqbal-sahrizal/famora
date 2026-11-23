# Famora — Phase M5: Mobile Chat, AI & Notifications Report

**Verdict:** `MOBILE_M5_VERIFIED_WITH_BLOCKERS`  
**Scope:** Family Chat, AI Assistant, Notifications & Web Push Audit, Localization (`id`/`en`), Security Hardening (application layer only; zero DB migrations/RLS/RPC changes).

---

## 1. Initial Audit Findings

1. **Family Chat (`src/features/chat/`):**
   - `h-[calc(100dvh-10.5rem)]` + composer `pb-[calc(0.625rem+env(safe-area-inset-bottom))]` collided with `AppShell` sticky header / fixed bottom nav on narrow viewports (`MOB-010`).
   - Deep-linking via `?c=` initialized `mobileShowThread = false` on mobile; `handleSelectConversation` scrolled before `syncLatestMessages` resolved; `setMessagesByConv` ran side effects inside state updater; typing timeouts were uncancelled; `replyPreview` was wiped on realtime `UPDATE`.
   - Single-line `<Input>` composer lacked auto-grow and `min-w-0` wrapping; no date separators; no pending image preview; bubble footer / attachment pills risked clipping at `320px`; inline actions, reactions, back button, and DM rows were `< 44px` (`MOB-008`).
   - `next.config.ts` defaulted Server Actions to 1 MB despite 10 MB chat attachment validation; `deleteChatMessageAction` lacked sender/permission check & attachment cleanup; `togglePinChatMessageAction` silently returned `{ ok: true }` on 0-row RLS rejection; several actions lacked Zod UUID validation.
2. **AI Assistant (`src/features/ai/`, `src/app/api/ai/stream/route.ts`):**
   - `FamilyAiView` rendered the conversation history sidebar above the thread/composer on mobile (`MOB-010`), lacked constrained internal scroll height, and did not clear `?c=` on "New".
   - `submitPrompt` double-executed every prompt (calling `/api/ai/stream` AND `sendAiPromptAction`), burning 2x hourly quota and 2x OpenAI requests.
   - Assistant messages rendered raw unparsed text without `break-words` / `overflow-x-auto` for code blocks and tables on `320px`.
   - `ai_usage_logs` counted `rate_limited` rows toward hourly quota; `sendAiPromptAction` did not verify `conversationId` ownership; `confirmAiProposedAction` inserted shopping items before updating `action_status`.
3. **Notifications & Web Push (`src/features/notifications/`, `public/sw.js`):**
   - `FamilyNotificationsView` ignored `data.canView === false`, lacked optimistic rollback + loading/error handling, had hardcoded English strings, `< 44px` checkboxes/pills/revoke buttons, and computed `deviceFingerprint` using `btoa(endpoint).slice(0, 32)` (colliding across devices on the same push vendor).
   - `getNotificationsPageData` omitted `.lte("scheduled_for", now)`, exposing future scheduled reminders prematurely.
   - `sanitizePushPayload` and `public/sw.js` `notificationclick` did not guard against protocol-relative `//` URLs or `client.url.includes("/")` mismatches.
   - **Architectural/External Push Blockers (Not Modified):** `enqueueFamilyNotification` has 0 callers in domain actions; `outbox.ts` uses user-scoped `createSupabaseServerClient()` instead of a service-role client (blocked by RLS when dispatching to another member's `user_devices`); no worker/cron exists to drain `"pending"` outbox items; real push delivery requires VAPID credentials (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

---

## 2. Changes by Module & Modified Files

### A. Family Chat
- [next.config.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/next.config.ts): Configured `experimental.serverActions.bodySizeLimit: "10mb"`.
- [actions.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/chat/actions.ts): Added Zod UUID validation across `deleteChatMessageAction`, `toggleChatReactionAction`, `togglePinChatMessageAction`, `markConversationReadAction`, `loadConversationMessagesAction`, `getChatAttachmentSignedUrlAction`; verified `replyToMessageId` belongs to the conversation; cleaned up duplicate attachment uploads on `23505` retry; enforced sender/`chat.adults_only.participate` check + attachment removal on delete; added `.select("id")` check on pin toggle so RLS 0-row rejections fail explicitly.
- [family-chat-view.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/chat/components/family-chat-view.tsx):
  - Adjusted container height to `h-[calc(100dvh-8.75rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-5.5rem)]` with internal `overflow-y-auto overscroll-y-contain`.
  - Opened thread directly on mobile when `initialConversationId` is present; scrolled to bottom after `syncLatestMessages`; moved side effects out of `setMessagesByConv` state updater; preserved `replyPreview` on realtime `UPDATE`; cancelled per-member typing timers cleanly on unmount/switch.
  - Replaced `<Input>` composer with auto-growing `16px` `<textarea>` (`Enter` send, `Shift+Enter` newline), added image thumbnail preview, date dividers, `flex-wrap` bubble footers, and `>= 44px` mobile touch targets.

### B. AI Assistant
- [route.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/api/ai/stream/route.ts), [server.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/ai/server.ts), [actions.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/ai/actions.ts): Filtered `ai_usage_logs` by `.eq("status", "ok")`; verified `conversationId` belongs to `(familyId, actor.id)` before inserting `ai_messages`; added Zod UUID validation to `confirmAiProposedAction` & `cancelAiProposedAction`; claimed `pending_confirmation` -> `confirmed` atomically before inserting `shopping_items`.
- [ai-markdown.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/ai/components/ai-markdown.tsx) & [family-ai-view.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/ai/components/family-ai-view.tsx): Eliminated double-execution in `submitPrompt`, added generating state, optimistic rollback & retry, `order-1 lg:order-2` thread-first mobile layout, constrained internal scroll with near-bottom auto-scroll, `?c=` URL reset on "New", quota lockout, `AiMarkdown` (`overflow-x-auto` for code blocks & tables), and `>= 44px` mobile touch targets.

### C. Notifications, Push & Localization
- [server.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/notifications/server.ts), [actions.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/notifications/actions.ts), [logic.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/notifications/logic.ts): Added `.lte("scheduled_for", now)` filter; added Zod UUID validation + `family_id` / `getMemberActor` scoping; blocked protocol-relative `//` URLs in `sanitizePushPayload`.
- [family-notifications-view.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/notifications/components/family-notifications-view.tsx) & [sw.js](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/public/sw.js): Added `canView` restriction gate, SHA-256 `deviceFingerprint`, `navigator.serviceWorker.ready` + `getSubscription()` reuse, optimistic rollback + `toast.error`, safe deep-link validation, full `id`/`en` localization, `>= 44px` mobile touch targets, and strict same-origin `notificationclick` navigation.
- [messages.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/lib/i18n/messages.ts) & [errors.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/lib/i18n/errors.ts): Added M5 `notifications.*` keys (`id`/`en`) and Chat/AI/Notifications error translations.

---

## 3. DB/RLS Recommendations (Requires Approval — Not Modified)

1. **`supabase/migrations/0024_family_chat.sql`**:
   - `famora.is_chat_participant` should check `f.deleted_at IS NULL`, `fm.access_expires_at`, and `famora.has_permission(cc.family_id, 'chat.family.participate')`.
   - `chat_messages_update_participant` should scope `UPDATE` to `sender_member_id = famora.current_member_id(family_id)` or explicit moderator/pin permissions, and `chat_attachments_delete` storage policy should restrict deletion to the uploader/moderator and validate folder `[1] = family_id`.
2. **`supabase/migrations/0028_ai_assistant.sql`**:
   - Add composite foreign key `(family_id, conversation_id) REFERENCES ai_conversations(family_id, id)` on `ai_messages`.
3. **Push Outbox (`src/features/notifications/outbox.ts`)**:
   - Automatic multi-member push dispatch requires a service-role Supabase client (bypassing recipient-only RLS on `user_devices` / `member_preferences`), domain integration with `enqueueFamilyNotification`, a background worker/API route, and configured VAPID credentials.

---

## 4. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| Typecheck | `npm --prefix famora run typecheck` | **PASSED** (0 errors) |
| Lint | `npm --prefix famora run lint` | **PASSED** (0 errors, 0 warnings) |
| Unit Tests | `npm --prefix famora test` | **PASSED** (`33` files, `149/149` tests) |
| Production Build | `npm --prefix famora run build` | **PASSED** |
| Playwright E2E | `npm --prefix famora run test:e2e` | **38 passed, 6 skipped** |

- **Viewports Tested:** `320x720`, `360x800`, `375x812`, `390x844`, `430x932`, `1280x800`.
- **Verification Debt / Blockers:**
  1. **Authenticated E2E (6 skipped tests, including 1 in `e2e/mobile-m5-comms.spec.ts`):** Requires isolated `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY`.
  2. **Live Web Push Delivery:** Requires VAPID environment variables and outbox service-role dispatch worker (not simulated or mocked).
