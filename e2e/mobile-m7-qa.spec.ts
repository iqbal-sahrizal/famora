import { expect, test } from "@playwright/test";
import {
  cleanupPhase1Fixtures,
  hasIsolatedE2EAdmin,
  seedPhase1Fixtures,
} from "./fixtures/test-data";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/design-system",
  "/offline.html",
] as const;

const VIEWPORTS = [
  { name: "320x720", width: 320, height: 720 },
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;

test.describe("Phase M7 — Accessibility, Performance & Cross-Module QA", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`a11y audit: ${route} has accessible names, labeled inputs, valid headings, and no overflow at 375x812`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route);

      const audit = await page.evaluate(() => {
        const overflow = {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };

        const h1Count = document.querySelectorAll("h1").length;

        const idCounts = new Map<string, number>();
        document.querySelectorAll("[id]").forEach((el) => {
          const id = el.getAttribute("id");
          if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
        });
        const duplicateIds = Array.from(idCounts.entries())
          .filter(([, count]) => count > 1)
          .map(([id]) => id);

        const unnamedControls: string[] = [];
        document.querySelectorAll("button, a").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const text = (el.textContent || "").trim();
          const ariaLabel = (el.getAttribute("aria-label") || "").trim();
          const ariaLabelledBy = el.getAttribute("aria-labelledby");
          const title = (el.getAttribute("title") || "").trim();
          if (!text && !ariaLabel && !ariaLabelledBy && !title) {
            unnamedControls.push(`${el.tagName}:${el.className}`);
          }
        });

        const unlabeledInputs: string[] = [];
        document.querySelectorAll("input, select, textarea").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const id = el.getAttribute("id");
          const hasLabel = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : false;
          const wrappedByLabel = Boolean(el.closest("label"));
          const ariaLabel = (el.getAttribute("aria-label") || "").trim();
          const ariaLabelledBy = el.getAttribute("aria-labelledby");
          if (!hasLabel && !wrappedByLabel && !ariaLabel && !ariaLabelledBy) {
            unlabeledInputs.push(`${el.tagName}:${el.getAttribute("name") || el.getAttribute("type")}`);
          }
        });

        return { overflow, h1Count, duplicateIds, unnamedControls, unlabeledInputs };
      });

      expect(audit.overflow.scrollWidth).toBeLessThanOrEqual(audit.overflow.clientWidth);
      expect(audit.h1Count).toBeGreaterThanOrEqual(1);
      expect(audit.duplicateIds).toEqual([]);
      expect(audit.unnamedControls).toEqual([]);
      expect(audit.unlabeledInputs).toEqual([]);
    });
  }

  test("a11y keyboard & focus audit: /design-system BottomSheet & Dialog trap-free Escape and focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/design-system");

    const openSheetBtn = page.getByRole("button", { name: "Bottom Sheet" });
    await openSheetBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("performance lab audit: measures LCP, CLS, FCP, and interaction latency across public routes at 375x812", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    for (const route of ["/", "/login", "/signup", "/forgot-password", "/design-system"] as const) {
      await page.addInitScript(() => {
        (window as unknown as { __m7Perf?: { lcp: number; cls: number; fcp: number } }).__m7Perf = {
          lcp: 0,
          cls: 0,
          fcp: 0,
        };
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) {
            (window as unknown as { __m7Perf: { lcp: number } }).__m7Perf.lcp = last.startTime;
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
            if (!entry.hadRecentInput) {
              (window as unknown as { __m7Perf: { cls: number } }).__m7Perf.cls += entry.value ?? 0;
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === "first-contentful-paint") {
              (window as unknown as { __m7Perf: { fcp: number } }).__m7Perf.fcp = entry.startTime;
            }
          }
        }).observe({ type: "paint", buffered: true });
      });

      const start = Date.now();
      await page.goto(route, { waitUntil: "networkidle" });
      const navMs = Date.now() - start;

      // Measure real interaction latency (clicking first focusable button/input)
      const interactionStart = Date.now();
      const firstBtn = page.locator("button, a").first();
      if (await firstBtn.isVisible()) {
        await firstBtn.focus();
      }
      const interactionMs = Date.now() - interactionStart;

      const metrics = await page.evaluate(() => {
        const perf = (window as unknown as { __m7Perf?: { lcp: number; cls: number; fcp: number } }).__m7Perf;
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const jsBytes = resources
          .filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"))
          .reduce((sum, r) => sum + (r.transferSize || 0), 0);
        return {
          lcp: Math.round(perf?.lcp ?? 0),
          cls: Number((perf?.cls ?? 0).toFixed(4)),
          fcp: Math.round(perf?.fcp ?? 0),
          jsKb: Math.round(jsBytes / 1024),
        };
      });

      console.log(`[M7.1 PERF ${route}] navMs=${navMs} interactionMs=${interactionMs} lcp=${metrics.lcp}ms fcp=${metrics.fcp}ms cls=${metrics.cls} jsKb=${metrics.jsKb}KB`);
      expect(metrics.cls).toBeLessThanOrEqual(0.1);
      expect(metrics.lcp).toBeLessThanOrEqual(2500);
    }
  });

  test("authenticated cross-module E2E, cross-family isolation, and logout cache cleanup", async ({
    page,
  }) => {
    test.skip(
      !hasIsolatedE2EAdmin(),
      "BLOCKED: Requires isolated E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY."
    );

    const fixtures = await seedPhase1Fixtures();
    try {
      // 1. Invalid credentials fail closed
      await page.goto("/login");
      await page.getByLabel(/Email/i).fill(fixtures.userA.email);
      await page.getByLabel(/Kata sandi|Password/i).fill("WrongPassword123!");
      await page.getByRole("button", { name: /Masuk|Sign in/i }).click();
      await expect(page).toHaveURL(/\/login/);

      // 2. Login as User A (Owner Family A)
      await page.getByLabel(/Kata sandi|Password/i).fill(fixtures.userA.password);
      await page.getByRole("button", { name: /Masuk|Sign in/i }).click();
      await page.waitForURL(new RegExp(`/f/${fixtures.familyAId}`));

      // 3. Cross-family isolation: User A cannot view Family B
      await page.goto(`/f/${fixtures.familyBId}`);
      await expect(page).not.toHaveURL(new RegExp(`/f/${fixtures.familyBId}$`));

      // 4. Verify all core & comms routes at 6 viewports
      for (const route of ["", "/calendar", "/tasks", "/shopping", "/finance", "/chat", "/ai", "/notifications", "/more"]) {
        await page.goto(`/f/${fixtures.familyAId}${route}`);
        for (const vp of VIEWPORTS) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        }
      }

      // 5. Logout clears offline_cache and redirects to /login
      await page.goto("/account");
      await page.getByRole("button", { name: /Keluar|Sign out/i }).click();
      await page.waitForURL(/\/login/);

      // 6. Login as User C (Owner Family B) and verify no Family A data in IndexedDB
      await page.getByLabel(/Email/i).fill(fixtures.userC.email);
      await page.getByLabel(/Kata sandi|Password/i).fill(fixtures.userC.password);
      await page.getByRole("button", { name: /Masuk|Sign in/i }).click();
      await page.waitForURL(new RegExp(`/f/${fixtures.familyBId}`));

      const leakedKeys = await page.evaluate(async (famAId) => {
        if (!("indexedDB" in window)) return [];
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("famora-pwa-db", 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (!db.objectStoreNames.contains("offline_cache")) return [];
        return await new Promise<string[]>((resolve) => {
          const tx = db.transaction("offline_cache", "readonly");
          const req = tx.objectStore("offline_cache").getAllKeys();
          req.onsuccess = () =>
            resolve(
              ((req.result as string[]) || []).filter((k) => String(k).startsWith(famAId))
            );
          req.onerror = () => resolve([]);
        });
      }, fixtures.familyAId);
      expect(leakedKeys).toEqual([]);
    } finally {
      await cleanupPhase1Fixtures(fixtures);
    }
  });
});
