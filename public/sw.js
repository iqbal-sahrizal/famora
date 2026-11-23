const CACHE_VERSION = "v3";
const SHELL_CACHE = `famora-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `famora-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isPrivateOrDynamicRequest(url, request) {
  if (request.headers.has("authorization")) return true;
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/f/") ||
    url.pathname.startsWith("/account") ||
    url.pathname.startsWith("/onboarding") ||
    url.pathname.startsWith("/invite/") ||
    url.pathname.startsWith("/rest/v1/") ||
    url.pathname.startsWith("/storage/v1/") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.searchParams.has("_rsc")
  );
}

function isCacheableStaticResponse(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const cc = response.headers.get("cache-control") || "";
  if (/\b(private|no-store)\b/i.test(cc)) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: always network-only (never cache authenticated HTML), fall back to /offline.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || new Response("Offline", { status: 503 });
      })
    );
    return;
  }

  if (isPrivateOrDynamicRequest(url, request)) return;

  // Never cache-first unhashed Next.js dev chunks on localhost
  const isLocalDev =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";

  // Static build assets & icons: Cache-First in production, Network-First on localhost
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    if (isLocalDev && url.pathname.startsWith("/_next/static/")) {
      return;
    }
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (isCacheableStaticResponse(response)) {
            const copy = response.clone();
            void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});

// Web Push Listeners (Step 25)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "Famora", body: "You have a new family update.", url: "/" };
  try {
    const parsed = event.data.json();
    payload = {
      title: parsed.title || "Famora",
      body: parsed.body || "You have a new family update.",
      url: parsed.url || "/",
    };
  } catch {
    payload.body = event.data.text() || payload.body;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || "/";
  const targetUrl =
    typeof rawUrl === "string" && rawUrl.startsWith("/") && !rawUrl.startsWith("//")
      ? rawUrl
      : "/";
  const resolvedTarget = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === resolvedTarget && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.length > 0 && "navigate" in clients[0] && "focus" in clients[0]) {
        return clients[0].navigate(resolvedTarget).then((navigated) => navigated?.focus());
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(resolvedTarget);
      }
    })
  );
});
