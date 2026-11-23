import { expect, test } from "@playwright/test";

test.describe("Modal & BottomSheet Form Input Focus Regression", () => {
  for (const locale of ["id", "en"] as const) {
    test(`preserves input and textarea focus while typing in Dialog and BottomSheet (${locale})`, async ({
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

      await page.goto("/design-system");

      // 1. Standard Form Dialog
      await page.getByRole("button", { name: "Add Family Event" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const titleInput = dialog.getByLabel("Event title");
      await titleInput.click();
      await page.keyboard.type("Sunday Botanical Walk", { delay: 10 });
      await expect(titleInput).toHaveValue("Sunday Botanical Walk");
      await expect(titleInput).toBeFocused();

      const eventNotes = dialog.getByLabel("Event notes");
      await eventNotes.click();
      await page.keyboard.type("Bring snacks and water", { delay: 10 });
      await expect(eventNotes).toHaveValue("Bring snacks and water");
      await expect(eventNotes).toBeFocused();

      await dialog.getByRole("button", { name: "Save Event" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("Event added to family calendar")).toBeVisible();

      // 2. BottomSheet Form
      await page.getByRole("button", { name: "Bottom Sheet" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();

      const itemInput = sheet.getByLabel("Item name");
      await itemInput.click();
      await page.keyboard.type("Organic Oat Milk", { delay: 10 });
      await expect(itemInput).toHaveValue("Organic Oat Milk");
      await expect(itemInput).toBeFocused();

      const itemNotes = sheet.getByLabel("Shopping notes");
      await itemNotes.click();
      await page.keyboard.type("Unsweetened carton", { delay: 10 });
      await expect(itemNotes).toHaveValue("Unsweetened carton");
      await expect(itemNotes).toBeFocused();

      await sheet.getByRole("button", { name: "Add Item" }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByText("Added to shared shopping list")).toBeVisible();
    });
  }
});
