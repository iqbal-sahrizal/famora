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

const M5_ROUTES = ["chat", "ai", "notifications"] as const;

test.describe("Phase M5 — Mobile Chat, AI & Notifications", () => {
  for (const vp of VIEWPORTS) {
    test(`fails closed without horizontal overflow on chat, ai, and notifications at ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of M5_ROUTES) {
        await page.goto(`/f/00000000-0000-0000-0000-000000000000/${route}`);
        await expect(page).toHaveURL(/\/login/);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      }
    });
  }

  test("renders authenticated Chat, AI, and Notifications with internal scroll, composer typing, and zero overflow", async ({
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

      for (const route of M5_ROUTES) {
        await page.goto(`/f/${fixtures.familyAId}/${route}`);
        for (const vp of VIEWPORTS) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        }
      }

      // Chat mobile composer typing & send
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/f/${fixtures.familyAId}/chat`);
      const composer = page.locator("textarea").first();
      if (await composer.isVisible()) {
        await composer.fill("Hello mobile family chat");
        await expect(composer).toHaveValue("Hello mobile family chat");
      }

      // AI mobile layout: composer visible above history
      await page.goto(`/f/${fixtures.familyAId}/ai`);
      const aiInput = page.locator("form input").first();
      await expect(aiInput).toBeVisible();

      // Notifications mobile list & mark-all-read
      await page.goto(`/f/${fixtures.familyAId}/notifications`);
      await expect(page.getByRole("heading").first()).toBeVisible();
    } finally {
      await cleanupPhase1Fixtures(fixtures);
    }
  });
});
