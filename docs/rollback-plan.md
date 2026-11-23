# Famora Production Rollback Plan

## 1. Application Rollback (Zero-Downtime)
1. **Hosting Platform**: Immediately promote the previous known-good deployment in Vercel / your container orchestrator.
2. **Service Worker Cache Recovery**: If a bad client bundle was cached by `/sw.js`, deploy a hotfix bumping `CACHE_VERSION` in `public/sw.js` (`Cache-Control: no-cache` is enforced in `next.config.ts` so browsers pick up `/sw.js` immediately).

## 2. Database Rollback Safety
- **Rule**: Never run `DROP TABLE` or destructive `TRUNCATE` on production user data during an incident.
- **Forward-Fix Migrations**: Prefer additive/corrective migrations (`0030_...`) or disabling a broken feature flag / RLS policy rather than rolling back schema history that holds live user rows.
- **Point-in-Time Recovery (PITR)**: If data corruption occurs, restore the Supabase database to a PITR timestamp immediately preceding the incident into a staging clone first, verify integrity, and then promote/reconcile.
