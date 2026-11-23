# Famora — Frontend Interaction Audit

## Static Inspection Findings
- **TODO / FIXME / Empty Handlers**: Zero `TODO`, `FIXME`, `onClick={() => {}}`, or `disabled={true}` stubs found in `src/`.
- **Mock / Hardcoded Data**: Zero production feature views rely on static mock arrays; all 22 domain pages fetch via Server Components and mutate via Server Actions or `/api/ai/stream`.

## Interactive Control Gaps
1. **PwaStatusBar Retry Button (`AUD-001`)**: Visually clickable `"sync issue · Retry"` button calls `refreshSummary()` instead of `flushOfflineOutbox({ forceRetryFailed: true })`.
2. **Account & Logout Reachability (`AUD-002`)**: `AppShell` omits links to `/account` and `/onboarding` (Family Switcher), leaving users without a visible Logout or Switch Family button inside `/f/[familyId]/*`.
3. **Missing Edit/Delete Controls**:
   - Shopping lists: Create works; no Edit/Delete list buttons (`AUD-005`).
   - Announcements: Create/Pin/Archive work; no Edit/Delete announcement buttons (`AUD-006`).
   - Finance accounts: Create works; no Edit/Delete account buttons (`AUD-007`).
   - Notifications: Mark read / Mark all read work; no Delete notification button (`AUD-008`).
   - Habits & Memories: No Edit habit or Edit memory description controls (`AUD-009`).
   - Settings: No Language selector (`AUD-010`) or Delete Family control (`AUD-004`).
4. **Browser E2E Verification**: Interactive browser verification (Playwright) was not executed (`BLOCKED`).
