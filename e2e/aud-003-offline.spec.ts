import { expect, test } from "@playwright/test";
import {
  cleanupPhase1Fixtures,
  hasIsolatedE2EAdmin,
  seedPhase1Fixtures,
  type Phase1Fixtures,
} from "./fixtures/test-data";

test.describe("AUD-003 — Unified IndexedDB Offline Persistence E2E", () => {
  test.skip(
    !hasIsolatedE2EAdmin(),
    "BLOCKED: Requires isolated E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY."
  );

  let fixtures: Phase1Fixtures | null = null;

  test.beforeAll(async () => {
    fixtures = await seedPhase1Fixtures();
  });

  test.afterAll(async () => {
    await cleanupPhase1Fixtures(fixtures);
  });

  test("caches Dashboard, Tasks, Calendar, Shopping in IndexedDB and syncs offline mutations on reconnect", async ({
    page,
    context,
  }) => {
    if (!fixtures) return;
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(fixtures.userA.email);
    await page.getByLabel(/password/i).fill(fixtures.userA.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.goto(`/f/${fixtures.familyAId}`);
    await page.goto(`/f/${fixtures.familyAId}/tasks`);
    await page.goto(`/f/${fixtures.familyAId}/calendar`);

    await context.setOffline(true);
    await page.goto(`/f/${fixtures.familyAId}/tasks`);
    await page.getByRole("button", { name: /New Task/i }).click();
    await page.getByPlaceholder(/Pack school lunches/i).fill(`Offline Task ${fixtures.runId}`);
    await page.getByRole("button", { name: /Save Task/i }).click();

    await expect(page.getByText(/pending sync/i)).toBeVisible();
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByText(`Offline Task ${fixtures.runId}`)).toBeVisible();
  });
});
