import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "320x720", width: 320, height: 720 },
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;

test.describe("Phase M6 — PWA, Manifest, Service Worker & Offline Security", () => {
  test("serves valid manifest.webmanifest and all declared icon assets with HTTP 200", async ({
    request,
  }) => {
    const manifestRes = await request.get("/manifest.webmanifest");
    expect(manifestRes.status()).toBe(200);
    const manifest = (await manifestRes.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      scope?: string;
      display?: string;
      theme_color?: string;
      background_color?: string;
      icons?: Array<{ src: string; sizes?: string; purpose?: string }>;
    };

    expect(manifest.name).toContain("Famora");
    expect(manifest.short_name).toBe("Famora");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#315C49");
    expect(manifest.background_color).toBe("#F7F5EF");
    expect(manifest.icons?.length).toBeGreaterThanOrEqual(3);

    for (const icon of manifest.icons ?? []) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status()).toBe(200);
    }

    const appleIconRes = await request.get("/icons/apple-touch-icon.png");
    expect(appleIconRes.status()).toBe(200);
  });

  test("registers Service Worker once, caches only public shell/static assets, and excludes private/auth responses", async ({
    page,
  }) => {
    await page.goto("/");
    const swInfo = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const regs = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = await caches.keys();
      const cachedUrls: string[] = [];
      for (const key of cacheKeys) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        cachedUrls.push(...reqs.map((r) => new URL(r.url).pathname));
      }
      return {
        scope: reg.scope,
        regCount: regs.length,
        cacheKeys,
        cachedUrls,
      };
    });

    expect(swInfo).not.toBeNull();
    expect(swInfo?.regCount).toBe(1);
    expect(swInfo?.cacheKeys.some((k) => k.startsWith("famora-shell-v3"))).toBe(true);
    expect(swInfo?.cachedUrls).toContain("/offline.html");
    expect(
      swInfo?.cachedUrls.some(
        (u) =>
          u.startsWith("/f/") ||
          u.startsWith("/api/") ||
          u.startsWith("/auth/") ||
          u.startsWith("/account")
      )
    ).toBe(false);
  });

  for (const vp of VIEWPORTS) {
    test(`renders /offline.html cleanly without horizontal overflow and with >=44px controls at ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/offline.html");
      await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();

      const metrics = await page.evaluate(() => {
        const btn = document.querySelector("button");
        const link = document.querySelector("a");
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          btnHeight: btn?.getBoundingClientRect().height ?? 0,
          linkHeight: link?.getBoundingClientRect().height ?? 0,
        };
      });

      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      expect(metrics.btnHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.linkHeight).toBeGreaterThanOrEqual(44);
    });
  }

  test("serves offline fallback on simulated offline navigation without exposing protected family data", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    // Reload so the active SW controls the page
    await page.reload();

    await context.setOffline(true);
    try {
      await page.goto("/f/00000000-0000-0000-0000-000000000000/finance");
      await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /Sign In/i })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
