# Famora — Product Requirements Document (PRD)

## 1. Executive Summary

**Famora** is a premium, privacy-first **Family Management Platform** engineered as a Progressive Web App (PWA) with native-grade responsiveness, offline resilience, and multi-family tenancy. It unifies daily household coordination, financial clarity, child development, home operations, safety, and AI-assisted planning into a single cohesive platform.

---

## 2. Product Vision & Principles

1. **Multi-Family Native**: Users can belong to multiple family spaces (e.g., nuclear household, extended family, co-parenting circle, caregiver group) with instant context switching and strict data isolation.
2. **Role & Consent Driven**: Granular Role-Based Access Control (RBAC) with per-member overrides ensures parents, teens, children, grandparents, and caregivers see only what they should.
3. **Offline-Resilient PWA**: Core daily workflows (shopping lists, chores, habits, calendar viewing) work seamlessly offline and sync reliably when connectivity returns.
4. **Privacy & Safety by Design**: Private-by-default media/document storage, zero cross-family leakage, and emergency Family Safety tools.
5. **Calm, Premium UX**: Warm, approachable, uncluttered interface designed for both quick mobile check-ins and shared tablet/desktop planning.

---

## 3. Target Personas

| Persona | Typical Role | Primary Needs |
| :--- | :--- | :--- |
| **Household Organizer (Parent/Admin)** | `Owner` / `Admin` | Full visibility across calendar, finances, tasks, documents, safety, and member permissions. |
| **Co-Parent / Partner** | `Admin` / `Adult` | Shared planning, finance tracking, meal planning, child development tracking, and chat. |
| **Teenager** | `Teen` | Personal tasks/chores, allowance/budget view, calendar, habits, family chat, limited shopping. |
| **Young Child** | `Child` (Managed or Account) | Gamified chore & habit checklists, reward points, simple routine view on shared or supervised device. |
| **Grandparent / Relative** | `Extended` / `Guest` | Family memories, shared calendar events, chat, emergency contacts, zero access to private finances/vault. |
| **Babysitter / Caregiver** | `Caregiver` (Time-bound) | Child routines, allergies/medical notes, emergency contacts, safety check-ins, specific tasks. |

---

## 4. Product Domains Overview (19 Domains)

| # | Domain | Core Purpose | Primary Dependencies |
| :--- | :--- | :--- | :--- |
| 1 | **Authentication** | Sign-up, login, MFA, Passkeys, OAuth, managed child PIN/QR, session security | Core Identity |
| 2 | **Family Management** | Multi-family creation, invites, switching, roles, member profiles, lifecycle | Authentication |
| 3 | **Family Dashboard** | Unified daily briefing: agenda, due chores, budget pulse, alerts, quick actions | All read domains |
| 4 | **Calendar** | Shared & personal events, recurrence, reminders, external iCal sync, conflict detection | Family Management, Notifications |
| 5 | **Tasks & Chores** | Assignable tasks, recurring chores, points/rewards, verification workflow | Family Management, Child Dev, Notifications |
| 6 | **Family Finance** | Budgets, expense tracking, shared goals, recurring bills, child allowances | Family Management, Tasks (allowance), Documents |
| 7 | **Child Development** | Milestones, school/activities, health/growth logs, reward redemption | Family Management, Tasks, Calendar |
| 8 | **Shopping** | Real-time collaborative lists, categories, aisle grouping, inventory/meal integration | Meal Planning, Inventory, Notifications |
| 9 | **Inventory** | Pantry, household supplies, warranties, expiry tracking, low-stock triggers | Shopping, Home Management, Documents |
| 10 | **Documents** | Encrypted family vault (IDs, medical, insurance, warranties), expiry alerts | Family Management, Notifications |
| 11 | **Family Chat** | Real-time family channels, threads, polls, media sharing, reactions | Family Management, Notifications, Storage |
| 12 | **Meal Planning** | Weekly meal calendar, recipe library, dietary tags, auto-generated shopping lists | Shopping, Inventory, Calendar |
| 13 | **Home Management** | Maintenance schedules, contractor directory, utility/appliance logs, home projects | Inventory, Documents, Calendar, Finance |
| 14 | **Family Memories** | Private photo/video albums, milestone journals, timeline, reactions | Family Management, Child Dev, Storage |
| 15 | **Habits & Routines** | Morning/bedtime routines, streaks, habit tracking for adults & children | Family Management, Tasks, Notifications |
| 16 | **Family Safety** | Emergency SOS, check-ins, medical/allergy cards, emergency contacts, safe zones | Family Management, Notifications, Documents |
| 17 | **Notifications** | Push (Web Push), in-app inbox, email/SMS fallback, quiet hours, digest preferences | Authentication, Family Management |
| 18 | **AI Assistant** | Permission-aware family copilot: planning, meal ideas, summaries, task drafting | All permitted domains, Notifications |
| 19 | **Settings** | User profile, theme, PWA install/offline controls, family settings, audit log, export | Authentication, Family Management |

---

## 5. Domain Dependency Graph

```
                    [Authentication]
                           |
                           v
                  [Family Management] <---> [Settings]
                   /       |        \
                  /        |         \
    +------------+---------+----------+------------+
    |            |         |          |            |
    v            v         v          v            v
[Calendar]  [Tasks]   [Finance]  [Documents]  [Safety]
    |          |         |            |            |
    +----+-----+----+----+            |            |
         |          |                 |            |
         v          v                 v            |
   [Meal Plan]  [Child Dev]    [Home Mgmt]         |
         |          |                 |            |
         v          v                 v            |
    [Shopping] <---> [Inventory]                   |
                                                   |
    [Family Chat]   [Memories]   [Habits]          |
         |               |           |             |
         +---------------+-----------+-------------+
                         |
                         v
                  [Notifications]
                         |
                         v
                  [AI Assistant] (Reads/Acts via User-Scoped Permissions)
                         |
                         v
                 [Family Dashboard] (Aggregates User-Permitted Views)
```

---

## 6. Functional & Non-Functional Requirements

### Functional Highlights
- **Multi-Family Switching**: Seamless header/drawer switcher with zero cross-family state bleed.
- **Invitations & Onboarding**: Invite via secure expiring token link or email; role pre-assigned on invite; optional approval gate.
- **Real-Time Collaboration**: Instant updates on Shopping lists, Family Chat, Tasks, and Calendar via WebSockets.
- **Granular Privacy**: Private personal calendars/tasks/notes optional within a family; Sensitive Vault documents require explicit `documents.view_sensitive` permission (and optional re-auth).

### Non-Functional Requirements
- **Performance**: LCP < 2.0s on 4G mobile; INP < 150ms; family switch < 300ms.
- **Availability**: 99.9% uptime target for core API/Auth; graceful offline degradation for Tier 1 & Tier 2 features.
- **Security**: Strict tenant isolation via PostgreSQL RLS; TLS 1.3; encrypted sensitive fields; OWASP ASVS Level 2 alignment.
- **Accessibility**: WCAG 2.1 AA compliance across all core flows.
- **Localization & Timezones**: Per-family default timezone + per-user display timezone; i18n-ready string architecture.
