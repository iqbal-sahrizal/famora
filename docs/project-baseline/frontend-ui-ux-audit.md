# Famora — Frontend & UI/UX Audit

---

## 1. Route & Component Inventory

- **App Router:** **34** `page.tsx` routes, **3** `route.ts` handlers (`/api/health`, `/api/ai/stream`, `/auth/callback`), **8** layout/error/loading/manifest files.
  - Public/System: `/`, `/design-system`, `/invite/[token]`
  - `(auth)`: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`
  - `(app)`: `/onboarding`, `/account`, `/f/[familyId]` (Dashboard + `more` + `[domain]` catch-all + `21` dedicated domain routes)
- **Feature Views:** **32** client view/form components across **21** `src/features/*` folders.
- **Shared Components:** **15** UI primitives (`src/components/ui/`), **2** layout components (`AppShell`, `primitives.tsx`), `PwaStatusBar`, and `DesignShowcase`.

---

## 2. Modals, Forms & Navigation Consistency

- **Modals & Sheets:** `Dialog` and `BottomSheet` (`src/components/ui/dialog.tsx`) share `useDialogAccessibility` (focus trap, Escape close, scroll lock, focus restoration). Fixed P0 focus-loss bug (`onCloseRef` pattern, `[open, panelRef]` deps).
- **Custom Overlay Exception:** `src/features/memories/components/family-memories-view.tsx:717` uses a custom `fixed inset-0` overlay for its fullscreen media lightbox instead of `Dialog`.
- **Form Patterns:** Auth/Account forms use `react-hook-form` + `zodResolver`; domain views use controlled `useState` + Server Actions with server-side Zod validation.
- **Navigation (`src/components/layout/app-shell.tsx` & `src/config/navigation.ts`):** Collapsible desktop sidebar (4 groups, all 22 domains), family switcher, `PwaStatusBar`, mobile bottom tab bar (4 primary domains + `More`).
- **Consistency Note:** 6 domain `page.tsx` files (`ai`, `chat`, `habits`, `memories`, `notifications`, `safety`) rely on `f/[familyId]/layout.tsx` for `requireAuthenticatedUser()` rather than calling it in `page.tsx` like the other 15 domain pages.
- **Settings UI Bug:** `src/features/settings/components/family-settings-view.tsx:652–656` wires the WhatsApp placeholder checkbox to `inAppEnabled` (`setInAppEnabled`).

---

## 3. Accessibility Findings

1. `src/components/ui/select.tsx`: Lacks `error` prop, `aria-invalid`, and `aria-describedby`.
2. `src/components/ui/dropdown.tsx`: Trigger wrapper uses `<div onClick={...}>` without `aria-expanded`, `aria-haspopup`, or arrow-key menu navigation.
3. `src/components/ui/tabs.tsx`: Implements `role="tablist"`/`role="tab"`/`aria-selected`, but lacks `ArrowLeft`/`ArrowRight` keyboard navigation.

---

## 4. Localization (`id` / `en`) Audit

- `LocaleProvider` (`famora_locale` cookie + `member_preferences.locale`), `Intl` formatters (`format.ts`), `translateError` (`errors.ts`), and `messages.ts` (`3,419` lines, strict 1:1 `id`/`en` parity).
- **Hardcoded English Strings Outside `i18n.test.ts` Scope:**
  - `src/app/page.tsx:107,114,149,153,160`: `"Create Family Workspace"`, `"Sign In to Workspace"`, `"Row-Level Security Enforced"`, `"Realtime & Offline PWA"`, `"View Design System →"`.
  - `src/components/layout/app-shell.tsx:114`: `"Skip to content"`.
  - `src/components/ui/navigation.tsx:34,40,45` (`ThemeToggle`): `"Light"`, `"Dark"`, `aria-label="Switch to ... mode"`.
  - `src/components/ui/feedback.tsx:47–48` (`ErrorState`): Default English `title` and `description` props.
  - `src/features/auth/components/password-field.tsx:21`: `aria-label={visible ? "Hide password" : "Show password"}`.
