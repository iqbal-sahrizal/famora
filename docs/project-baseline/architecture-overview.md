# Famora — Architecture Overview

---

## 1. Tech Stack & Tooling

- **Framework:** Next.js `^15.2.0` (App Router, React `^19.0.0`, `reactStrictMode: true`)
- **Language:** TypeScript `^5.7.3` (`strict: true`, `@/* -> ./src/*`)
- **Styling:** Tailwind CSS `^4.0.9` (`@tailwindcss/postcss`), `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`
- **Backend / Auth / DB:** `@supabase/ssr` (`^0.12.7`), `@supabase/supabase-js` (`^2.109.0`)
- **State / Forms / Validation:** `@tanstack/react-query` (`^5.66.0`), `zustand` (`^5.0.3`), `react-hook-form` (`^7.54.2`), `@hookform/resolvers` (`^4.1.3`), `zod` (`^3.24.2`)
- **UX / Theme / Toasts:** `next-themes` (`^0.4.6`), `sonner` (`^2.0.1`)
- **Testing:** `vitest` (`^4.1.12`, `environment: "node"`), `@playwright/test` (`^1.65.1`, Chromium)

---

## 2. Repository Structure

```text
famora/
├── e2e/                     # 5 Playwright specs + 1 test-data fixture
├── public/                  # sw.js, offline.html, icons/
├── scripts/                 # validate-migrations.mjs, run-rls-tests.mjs
├── supabase/
│   ├── migrations/          # 0001_ through 0034_
│   └── combined_all_migrations.sql
└── src/
    ├── middleware.ts         # Session & route guard entry point
    ├── app/                  # App Router pages, layouts, API routes, manifest.ts
    ├── components/           # Shared UI primitives, AppShell, PwaStatusBar, DesignShowcase
    ├── config/               # navigation.ts, site.ts
    ├── features/             # 21 domain modules (actions, server, schemas/validation, components, __tests__)
    ├── hooks/                # use-active-family.ts, use-online-status.ts, use-pwa-sync.ts
    ├── lib/                  # env.ts, errors.ts, routes.ts, i18n/, pwa/, security/, supabase/
    ├── providers/            # app-providers.tsx, locale-provider.tsx, query-provider.tsx, theme-provider.tsx
    ├── stores/               # ui-store.ts
    └── types/                # database.ts, domain.ts
```

---

## 3. Request Lifecycle, Middleware & Layouts

1. **`src/middleware.ts` -> `src/lib/supabase/middleware.ts` (`updateSession`):**
   - Excludes static assets, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, `/api/health`, and `/design-system`.
   - Protects `["/f/", "/onboarding", "/account"]` and redirects authenticated users away from `["/login", "/signup", "/forgot-password"]` to `/onboarding`.
   - Fails closed on protected routes if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing.
2. **`src/app/layout.tsx` (`RootLayout`):**
   - Reads `famora_locale` cookie via `normalizeLocale()`, sets `<html lang={initialLocale}>`, loads `Inter` & `Plus_Jakarta_Sans`, wraps app in `<AppProviders>`.
3. **`src/providers/app-providers.tsx`:**
   - Composes `ThemeProvider` (`next-themes`) -> `LocaleProvider` -> `QueryProvider` -> `<Toaster position="bottom-right" />`.
4. **`src/app/(app)/f/[familyId]/layout.tsx` (`FamilyWorkspaceLayout`):**
   - Note: `src/app/(app)/layout.tsx` does **not** exist; auth is enforced per-page and in `f/[familyId]/layout.tsx`.
   - Calls `requireAuthenticatedUser()`, loads `getWorkspaceShellContext(user, familyId)`, and mounts `<AppShell>` (sidebar, family switcher, `PwaStatusBar`, mobile bottom bar).

---

## 4. Security Headers (`next.config.ts`)

- Applied on `/(.*)`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`.
- Applied on `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`, `Service-Worker-Allowed: /`.

---

## 5. Environment Configuration Drift

| Source | Variable Names |
| :--- | :--- |
| `.env.example` | `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `OPENAI_API_KEY`, `OPENAI_MODEL` |
| `.env.local` (present in workspace) | `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY` |
| `src/lib/env.ts` (`serverEnvSchema`) | `NODE_ENV`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AI_PROVIDER_API_KEY`, `APP_ENCRYPTION_KEY` |

**Finding:** `src/lib/env.ts` defines `AI_PROVIDER_API_KEY`, `UPSTASH_REDIS_*`, and `APP_ENCRYPTION_KEY` (unused/unreferenced in `.env.example`), whereas `src/features/ai/provider.ts:208–212` and `src/features/notifications/vapid.ts:155` read `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, and `VAPID_SUBJECT` directly from `process.env`.
