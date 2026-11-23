# Famora — PWA Architecture

## 1. PWA Goals & Capabilities

Famora is designed as an **installable, offline-resilient, push-enabled Progressive Web App** across iOS (Safari 16.4+ Home Screen), Android (Chrome/Edge), and Desktop (Chrome/Edge/Safari).

- **Installability**: Custom Web App Manifest (`/manifest.webmanifest`), adaptive icons (`192x192`, `512x512`, `maskable`), app shortcuts ("Add Shopping Item", "Family Calendar", "Emergency SOS").
- **Offline Resilience**: Seamless read/write for daily household workflows with clear sync status indicators.
- **Re-engagement**: Web Push Notifications (VAPID) with deep-linking to `/f/[familyId]/...`.

---

## 2. Caching Strategy (Service Worker via Serwist)

| Asset / Route Type | Strategy | Cache Name | Notes |
| :--- | :--- | :--- | :--- |
| Static JS/CSS/Fonts (`/_next/static/*`) | **Cache-First** | `famora-static-v1` | Content-hashed immutable assets |
| App Shell & Icons | **Stale-While-Revalidate** | `famora-shell-v1` | Fast boot with background refresh |
| Navigation (`GET /f/[familyId]/*`) | **Network-First** (3s timeout -> offline shell) | `famora-pages-v1` | Ensures fresh auth & SSR state when online |
| Standard API / Read Queries | **Network-Only in SW** (handled by TanStack Query + IndexedDB) | N/A | Avoids SW cache bleed across families |
| Sensitive Vault, Finance, Auth (`/api/vault/*`, `/api/auth/*`) | **Network-Only (`no-store`)** | **Never Cached** | Zero sensitive data in SW CacheStorage |

---

## 3. Tiered Offline Sync Model

To prevent data corruption and permission conflicts, domains are split into 3 offline tiers:

### Tier 1: Offline-First (Optimistic + IndexedDB Mutation Queue)
- **Domains**: Shopping Lists (check/uncheck, add item), Tasks & Chores (mark complete), Habits & Routines (daily check-in).
- **Mechanism**:
  1. Mutation updates TanStack Query cache immediately.
  2. Mutation is persisted to IndexedDB `offline_mutations` store with `{ id, familyId, actorMemberId, domain, action, payload, idempotencyKey, createdAt }`.
  3. On `online` event or Background Sync (`sync` tag), mutations replay sequentially in FIFO order.
  4. **Conflict Resolution**: Field-level merge / idempotent server RPCs (e.g., checking off a shopping item is idempotent).

### Tier 2: Offline Read + Queued Write with Conflict Check
- **Domains**: Calendar Events, Inventory, Meal Plans.
- **Mechanism**: Cached in IndexedDB partitioned by `familyId` for offline viewing. Offline edits carry `expected_updated_at`; if the server row changed, the user is prompted to resolve (Keep Mine / Keep Server).

### Tier 3: Online-Only (Fail-Fast with Friendly Banner)
- **Domains**: Family Finance (transfers/balances), Documents (upload/vault), Role & Permission Changes, Family Invites, AI Assistant, Family Safety SOS (uses SMS/tel: fallback when offline!).

---

## 4. Multi-Family Cache Isolation & Purge

- IndexedDB stores (`famora_cache`, `offline_mutations`) always include `familyId` as a compound key prefix.
- Switching families **does not** delete offline queues for Family A; instead, background sync replays Family A's queue with `familyId: A` validated on the server.
- **Sign-Out / Member Removal**: Immediately clears all IndexedDB stores, TanStack Query cache, and SW `famora-pages-v1` cache.

---

## 5. Web Push Architecture

1. User opts in via Settings or contextual prompt (with dedicated iOS "Add to Home Screen" instructions if not in `standalone` mode).
2. Browser generates `PushSubscription` (`endpoint`, `p256dh`, `auth`) -> saved to `push_subscriptions` table.
3. Server triggers push via `web-push` (VAPID) with **privacy-safe generic payload**:
   ```json
   {
     "title": "Famora",
     "body": "You have a new family update",
     "data": { "familyId": "...", "url": "/f/.../chat" }
   }
   ```
4. Service Worker `notificationclick` focuses existing window or opens `data.url`.
