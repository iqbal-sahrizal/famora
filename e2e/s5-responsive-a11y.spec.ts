import { expect, test } from "@playwright/test";

const S5_VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

test.describe("Famora S5 — Responsive, Accessibility & Runtime Stability", () => {
  for (const vp of S5_VIEWPORTS) {
    test(`renders public & showcase routes cleanly without horizontal overflow or console errors at ${vp.width}px`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const path of ["/", "/login", "/signup", "/design-system"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow, `Horizontal overflow detected on ${path} at ${vp.width}px`).toBe(false);
      }

      expect(errors).toEqual([]);
    });
  }

  test("supports keyboard Tab trap, Escape close, and focus restoration on Dialog", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/design-system");

    const trigger = page.getByRole("button", { name: "Add Family Event" });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Focus should stay inside dialog across multiple Tab and Shift+Tab presses
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return Boolean(d && d.contains(document.activeElement));
      });
      expect(inside).toBe(true);
    }

    await page.keyboard.press("Shift+Tab");
    const stillInside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return Boolean(d && d.contains(document.activeElement));
    });
    expect(stillInside).toBe(true);

    // Escape closes dialog and restores focus to trigger
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("respects prefers-reduced-motion and exposes accessible form labels on /login", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");

    const reduced = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    expect(reduced).toBe(true);

    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /masuk|sign in|log in/i })).toBeVisible();
  });
});
