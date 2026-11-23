# Famora — Feature Specifications (All 19 Domains)

## 1. Authentication
- Email/password, Google/Apple OAuth, Magic Link, WebAuthn Passkeys, and TOTP MFA.
- **Managed Child Kiosk/PIN**: Parents can launch a supervised child session or bind a tablet with 4–6 digit child PINs.

## 2. Family Management
- Create multiple families; switch active family cleanly via `/f/[familyId]/...`.
- Invite members via expiring email/link tokens with pre-assigned role.
- Manage member roles, time-bound caregiver access, and per-member permission overrides.

## 3. Family Dashboard
- Role-tailored daily command center: Today's Calendar, Due Tasks & Chores, Meal for Tonight, Low-Stock/Shopping count, Budget Pulse (adults), and Active Safety/Expiry Alerts.

## 4. Calendar
- Month/Week/Day/Agenda views; recurring events (`RRULE`); member color-coding; RSVP tracking.
- Visibility levels: `family`, `adults_only`, `private`.
- External iCal feed import (read-only sync) & export.

## 5. Tasks & Chores
- Shared task lists + Chore Board with point values and recurring schedules.
- **Approval Workflow**: Child marks chore `pending_approval` -> Parent approves -> automatically credits `child_reward_points_ledger`.

## 6. Family Finance
- Multi-account tracking (checking, cash, savings, child allowance wallets).
- Monthly category budgets, expense/income logging, receipt attachment (linked to `documents`), recurring bills, and shared savings goals.

## 7. Child Development
- Child profiles (school, grade, allergies, pediatrician).
- Milestone journal (academic, physical, social) optionally linked to Family Memories.
- Reward Catalog & Points Ledger for positive reinforcement.

## 8. Shopping
- Real-time collaborative lists grouped by store aisle/category.
- Offline-first check-off; one-tap "Add from Meal Plan" or "Restock from Inventory".

## 9. Inventory
- Track pantry, fridge, freezer, medicine cabinet, and household supplies.
- Quantity thresholds (`min_threshold`) auto-suggest or auto-add to Shopping; expiration date alerts.

## 10. Documents
- Organized folders with `standard` and `sensitive_vault` tiers.
- Expiration tracking (passports, insurance, driver's licenses) with 30/7/1-day reminders.
- Optional client-side passphrase encryption for `sensitive_vault`.

## 11. Family Chat
- Real-time channels (`#general`, `#adults-only`, topic channels, DMs).
- Replies, emoji reactions, image/file sharing (private signed URLs), and quick polls ("Where should we eat?").

## 12. Meal Planning
- Weekly meal calendar (Breakfast/Lunch/Dinner/Snack) + family Recipe Box.
- One-click "Generate Shopping List" for the week's planned recipes, subtracting items already in Inventory.

## 13. Home Management
- Home asset registry (appliances, HVAC, vehicles) with serial numbers & warranty links.
- Recurring maintenance schedules (filter changes, car service) + Contractor directory.

## 14. Family Memories
- Private family timeline & photo/video albums; member tagging; reactions; milestone linking.
- Zero public indexing; strictly private signed URLs.

## 15. Habits & Routines
- Morning/Bedtime step-by-step routines (great for kids & caregivers) and daily/weekly habit streaks.

## 16. Family Safety
- **Emergency SOS**: One-tap alert notifying all adults with optional GPS location and `tel:` fallback if offline.
- **Safety Check-ins**: "Arrived safely" / "Need help" updates.
- **Medical & Emergency Cards**: Accessible offline for caregivers & family members (allergies, blood type, emergency contacts).

## 17. Notifications
- Unified in-app inbox + Web Push (VAPID) + email digest fallback.
- Per-user quiet hours and per-domain notification toggles.

## 18. AI Assistant
- Natural-language family copilot scoped strictly to the user's RLS permissions:
  - *"What's on our calendar this weekend and what groceries do we need for Saturday's dinner?"*
  - *"Draft a morning routine for Leo"* (requires user confirmation before saving).
  - Summarizes unread chat or upcoming expiring documents.

## 19. Settings
- User profile, theme (Light/Dark/System), timezone, PWA install/offline cache management, MFA & active sessions, family settings, audit log viewer, and full JSON/ZIP data export.
