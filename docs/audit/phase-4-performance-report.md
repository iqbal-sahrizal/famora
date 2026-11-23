# Famora — Phase 4 Performance Report

**Date:** 2026-11-23
**Build Tool:** Next.js 15.5.29 (`next build` in isolated `/tmp/famora-phase4-build`)
**Lighthouse CLI:** Not installed in environment (`which lighthouse` -> `lighthouse not found`)

---

## 1. Observed Production Bundle Measurements

- **Shared First Load JS across all routes:** `103 kB` (`chunks/542d3de4-6a54f38266e636f8.js` `54.2 kB`, `chunks/8537-eefd7a1c80e9cb72.js` `46.8 kB`, other `1.93 kB`)
- **Middleware:** `109 kB`
- **Static Pages Prerendered:** `16/16`
- **Representative Route First Load JS:**
  - `/`: `119 kB` (`3.25 kB` page)
  - `/login`, `/signup`: `149 kB`
  - `/f/[familyId]` (Dashboard): `137 kB`
  - `/f/[familyId]/more`: `107 kB` (`166 B` page)
  - `/f/[familyId]/settings`: `136 kB`
  - `/f/[familyId]/child-dev`: `137 kB`
  - `/f/[familyId]/shopping`: `218 kB` (includes Supabase Realtime client)
  - `/f/[familyId]/chat`: `220 kB` (includes Supabase Realtime client)

---

## 2. Architecture & Query Efficiency Notes

- **Server-First Data Fetching:** Domain pages fetch initial snapshots in parallel (`Promise.all`) inside `server.ts` loaders before hydrating client views.
- **Image Optimization:** `next.config.ts` enables `image/avif` and `image/webp`; Memory uploads optimize client images and generate 480px thumbnails.
- **Remaining Measurement Blocker:** Live Lighthouse Performance / Core Web Vitals scores could not be measured locally because `lighthouse` CLI is not installed and authenticated routes require a running Supabase instance.
