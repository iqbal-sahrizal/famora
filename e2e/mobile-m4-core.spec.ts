import { expect, test } from "@playwright/test";
import {
  cleanupPhase1Fixtures,
  hasIsolatedE2EAdmin,
  seedPhase1Fixtures,
} from "./fixtures/test-data";

const VIEWPORTS = [
  { name: "320x720", width: 320, height: 720 },
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;

const CORE_MODULE_PATHS = [
  "calendar",
  "tasks",
  "chores",
  "shopping",
  "finance",
  "budgets",
  "analytics",
] as const;

test.describe("Phase M4 — Mobile Core Modules", () => {
  for (const vp of VIEWPORTS) {
    test(`fails closed without horizontal overflow across core module redirects at ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const modulePath of CORE_MODULE_PATHS) {
        await page.goto(`/f/00000000-0000-0000-0000-000000000000/${modulePath}`);
        await expect(page).toHaveURL(/\/login/);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      }
    });
  }

  test("renders authenticated Calendar, Tasks, Chores, Shopping, and Finance without overflow", async ({
    page,
  }) => {
    test.skip(
      !hasIsolatedE2EAdmin(),
      "BLOCKED: Requires isolated E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY."
    );

    const fixtures = await seedPhase1Fixtures();
    try {
      await page.goto("/login");
      await page.getByLabel(/Email/i).fill(fixtures.userA.email);
      await page.getByLabel(/Kata sandi|Password/i).fill(fixtures.userA.password);
      await page.getByRole("button", { name: /Masuk ke Famora|Sign in to Famora/i }).click();
      await page.waitForURL(new RegExp(`/f/${fixtures.familyAId}`));

      for (const modulePath of CORE_MODULE_PATHS) {
        await page.goto(`/f/${fixtures.familyAId}/${modulePath}`);
        for (const vp of VIEWPORTS) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        }
      }
    } finally {
      await cleanupPhase1Fixtures(fixtures);
    }
  });
});
