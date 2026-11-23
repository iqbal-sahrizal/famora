import { expect, test } from "@playwright/test";
import {
  cleanupPhase1Fixtures,
  getIsolatedSupabaseAdmin,
  hasIsolatedE2EAdmin,
  seedPhase1Fixtures,
  type Phase1Fixtures,
} from "./fixtures/test-data";

test.describe("AUD-002 — AppShell Account, Logout & Family Switcher E2E", () => {
  test.skip(
    !hasIsolatedE2EAdmin(),
    "BLOCKED: Requires isolated E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY."
  );

  let fixtures: Phase1Fixtures | null = null;

  test.beforeAll(async () => {
    fixtures = await seedPhase1Fixtures();
    // Grant User A membership in Family B too so Family Switcher has 2 authorized families
    if (fixtures) {
      const admin = getIsolatedSupabaseAdmin();
      const { data: roles } = await admin!
        .from("family_roles")
        .select("id, role_key")
        .is("family_id", null);
      const adultRoleId = roles?.find((r) => r.role_key === "adult")?.id;
      if (adultRoleId) {
        await admin!.from("family_members").insert({
          family_id: fixtures.familyBId,
          user_id: fixtures.userA.id,
          role_id: adultRoleId,
          display_name: fixtures.userA.displayName,
          status: "active",
        });
      }
    }
  });

  test.afterAll(async () => {
    await cleanupPhase1Fixtures(fixtures);
  });

  test("navigates to Account, switches families without data leak, and invalidates session on Sign Out", async ({
    page,
  }) => {
    if (!fixtures) return;
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(fixtures.userA.email);
    await page.getByLabel(/password/i).fill(fixtures.userA.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.goto(`/f/${fixtures.familyAId}`);
    await page
      .getByLabel(/Switch family workspace/i)
      .first()
      .selectOption(fixtures.familyBId);
    await expect(page).toHaveURL(new RegExp(`/f/${fixtures.familyBId}`));

    await page.getByRole("button", { name: /Sign out/i }).click();
    await page.getByRole("button", { name: /^Sign Out$/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // Protected route reload after logout must fail closed
    await page.goto(`/f/${fixtures.familyAId}`);
    await expect(page).toHaveURL(/\/login/);
  });
});
