import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "320x720", width: 320, height: 720 },
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;

test.describe("Phase M3 — Modal, BottomSheet & Form Interaction Regression", () => {
  for (const locale of ["id", "en"] as const) {
    test(`preserves input/textarea focus, middle-cursor editing, scroll lock, and submission (${locale})`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: "famora_locale",
          value: locale,
          domain: "127.0.0.1",
          path: "/",
        },
      ]);

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/design-system");

      // 1. Standard Form Dialog + background scroll lock + middle-cursor editing
      await page.getByRole("button", { name: "Add Family Event" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const bodyOverflowDialog = await page.evaluate(
        () => document.body.style.overflow
      );
      expect(bodyOverflowDialog).toBe("hidden");

      const titleInput = dialog.getByLabel("Event title");
      await titleInput.click();
      await page.keyboard.type("SundayWalk", { delay: 8 });
      await expect(titleInput).toHaveValue("SundayWalk");
      await expect(titleInput).toBeFocused();

      // Move cursor to middle (after "Sunday") and type " Family "
      await titleInput.evaluate((el: HTMLInputElement) => {
        el.setSelectionRange(6, 6);
      });
      await page.keyboard.type(" Family ", { delay: 8 });
      await expect(titleInput).toHaveValue("Sunday Family Walk");
      await expect(titleInput).toBeFocused();

      const eventNotes = dialog.getByLabel("Event notes");
      await eventNotes.click();
      await page.keyboard.type("Bring snacks and water", { delay: 8 });
      await expect(eventNotes).toHaveValue("Bring snacks and water");
      await expect(eventNotes).toBeFocused();

      await dialog.getByRole("button", { name: "Save Event" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("Event added to family calendar")).toBeVisible();

      // Background scroll lock restored on close
      const bodyOverflowRestored = await page.evaluate(
        () => document.body.style.overflow
      );
      expect(bodyOverflowRestored).not.toBe("hidden");

      // 2. BottomSheet Form + internal scrollability + submit
      await page.getByRole("button", { name: "Bottom Sheet" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();

      const itemInput = sheet.getByLabel("Item name");
      await itemInput.click();
      await page.keyboard.type("Organic Oat Milk", { delay: 8 });
      await expect(itemInput).toHaveValue("Organic Oat Milk");
      await expect(itemInput).toBeFocused();

      const itemNotes = sheet.getByLabel("Shopping notes");
      await itemNotes.click();
      await page.keyboard.type("Unsweetened carton", { delay: 8 });
      await expect(itemNotes).toHaveValue("Unsweetened carton");
      await expect(itemNotes).toBeFocused();

      await sheet.getByRole("button", { name: "Add Item" }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByText("Added to shared shopping list")).toBeVisible();
    });
  }

  for (const vp of VIEWPORTS) {
    test(`renders BottomSheet and Dialog cleanly without overflow at ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/design-system");

      await page.getByRole("button", { name: "Bottom Sheet" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      const sheetMetrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyOverflow: document.body.style.overflow,
      }));
      expect(sheetMetrics.scrollWidth).toBeLessThanOrEqual(sheetMetrics.clientWidth);
      expect(sheetMetrics.bodyOverflow).toBe("hidden");

      const itemInput = sheet.getByLabel("Item name");
      await itemInput.click();
      await page.keyboard.type("Bread", { delay: 5 });
      await expect(itemInput).toHaveValue("Bread");
      await expect(itemInput).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });
  }
});
