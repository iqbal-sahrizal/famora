# Famora — Development Guide

**Famora** is a premium, privacy-first multi-family management platform built with Next.js App Router, TypeScript (strict), Tailwind CSS v4, shadcn/ui conventions, TanStack Query, React Hook Form, Zod, and Zustand.

## Architecture & Documentation

All product, database, security, RLS, PWA, and design system specs live in [`docs/`](./docs).

## Project Structure (`src/`)

```text
src/
├── app/            # Next.js App Router pages, layouts, error/loading boundaries, API routes
├── components/
│   ├── layout/     # Responsive AppShell, Container, Section, PageHeader
│   └── ui/         # Reusable Warm Clarity design system primitives
├── config/         # Site metadata & grouped domain navigation config
├── features/       # Domain feature modules (business logic & feature UI, never inside pages)
├── hooks/          # Shared React hooks (useOnlineStatus, useActiveFamilyId)
├── lib/            # Env validation (Zod), error normalization, routes, query client
├── providers/      # AppProviders (ThemeProvider, QueryProvider, Toaster)
├── stores/         # Zustand client UI stores
└── types/          # Shared domain, role, and permission TypeScript contracts
```

## Getting Started

```bash
npm install
npm run dev
```

## Validation Scripts

```bash
npm run typecheck   # TypeScript strict check (tsc --noEmit)
npm run lint        # ESLint (next/core-web-vitals + next/typescript)
npm run build       # Production Next.js build
npm run start       # Start production server
```

## Key Routes

- `/` & `/design-system` — Famora Design System Showcase
- `/f/[familyId]` — Scoped Family Workspace Shell (supports all 19 domains)
- `/api/health` — Service health endpoint
