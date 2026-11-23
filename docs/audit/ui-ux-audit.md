# Famora — UI/UX Audit

## Strengths Observed
- **Design Consistency & Domain Personality**: Warm Clarity palette (`#F8F6F1` canvas, `#2F6B4E` forest accent), dark mode support, `Plus Jakarta Sans` + `Inter` typography, and tailored layouts per domain (editorial Noticeboard & Memories, fintech Finance, independent-scrolling Chat).
- **Mobile Navigation**: Mobile bottom tab bar + dedicated `/f/[familyId]/more` page (no conflicting hamburger drawer).
- **Modals & Chat Scroll**: `Dialog` and `BottomSheet` lock body scroll (`max-h-[88dvh]`, safe-area bottom padding); Chat uses `100dvh`, `overscroll-y-contain`, synchronous scroll restoration, and smart auto-scroll.

## UX Gaps Identified
1. **No Account / Logout / Family Switcher in `AppShell` (`AUD-002`, P1)**: Users inside `/f/[familyId]/*` lack a visible link to `/account`, Logout, or Switch Family.
2. **Missing Edit/Delete Controls (`AUD-004`–`AUD-009`, P2)**: Missing in-app edit/delete flows for Family deletion, Shopping lists, Announcements, Finance accounts, Notifications, Habits, and Memory descriptions.
3. **No Language Switcher (`AUD-010`, P3)**: English-only UI labels (aside from bilingual AI assistant replies).
4. **Live Accessibility & Lighthouse (`BLOCKED`)**: Automated Lighthouse and axe-core browser audits were not executed in this CLI sandbox.
