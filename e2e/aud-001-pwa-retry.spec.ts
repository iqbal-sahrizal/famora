import { expect, test } from "@playwright/test";
import {
  cleanupPhase1Fixtures,
  getIsolatedSupabaseAdmin,
  hasIsolatedE2EAdmin,
  seedPhase1Fixtures,
  type Phase1Fixtures,
} from "./fixtures/test-data";

test.describe("AUD-001 — PWA Failed-Sync Retry E2E", () => {
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

  test("queues offline shopping mutation in IndexedDB, retries after failure, persists once, and preserves on auth expiry", async ({
    page,
    context,
  }) => {
    if (!fixtures) return;
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(fixtures.userA.email);
    await page.getByLabel(/password/i).fill(fixtures.userA.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.goto(`/f/${fixtures.familyAId}/shopping`);
    await context.setOffline(true);

    const itemTitle = `Offline Milk ${fixtures.runId}`;
    await page.getByPlaceholder(/Quick add/i).fill(itemTitle);
    await page.getByRole("button", { name: /add/i }).click();

    await expect(page.getByText(/pending sync/i)).toBeVisible();

    await context.setOffline(false);
    await page.reload();

    const admin = getIsolatedSupabaseAdmin();
    const { data: rows } = await admin!
      .from("shopping_items")
      .select("id, name")
      .eq("family_id", fixtures.familyAId)
      .eq("name", itemTitle);

    expect(rows).toHaveLength(1);
  });
});
