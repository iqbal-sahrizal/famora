import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "320x720", width: 320, height: 720 },
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;

test.describe("Phase M1 — Mobile Foundation, Safe Area, Touch Targets & PWA", () => {
  for (const vp of VIEWPORTS) {
    test(`has zero horizontal overflow on /, /login, /signup, and /design-system at ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ["/", "/login", "/signup", "/design-system"]) {
        await page.goto(route);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          overflow.scrollWidth,
          `${route} at ${vp.name} overflowed: ${overflow.scrollWidth} > ${overflow.clientWidth}`
        ).toBeLessThanOrEqual(overflow.clientWidth);
      }
    });
  }

  test("enforces >=16px mobile input fonts and >=44px touch targets on 375x812", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");

    const loginMetrics = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const minFont = Math.min(
        ...inputs.map((i) => parseFloat(getComputedStyle(i).fontSize))
      );
      const pwToggle = document.querySelector('button[aria-label*="password" i]');
      const langToggle = document.querySelector('button[aria-label*="Bahasa" i], button[aria-label*="Language" i]');
      return {
        minFont,
        pwRect: pwToggle?.getBoundingClientRect(),
        langRect: langToggle?.getBoundingClientRect(),
      };
    });

    expect(loginMetrics.minFont).toBeGreaterThanOrEqual(16);
    expect(loginMetrics.pwRect?.width).toBeGreaterThanOrEqual(44);
    expect(loginMetrics.pwRect?.height).toBeGreaterThanOrEqual(44);
    expect(loginMetrics.langRect?.width).toBeGreaterThanOrEqual(44);
    expect(loginMetrics.langRect?.height).toBeGreaterThanOrEqual(44);

    await page.goto("/design-system");
    await page.getByRole("button", { name: "Open Dialog" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const closeBtnRect = await dialog
      .getByRole("button", { name: /Tutup dialog|Close dialog/i })
      .boundingBox();
    expect(closeBtnRect?.width).toBeGreaterThanOrEqual(44);
    expect(closeBtnRect?.height).toBeGreaterThanOrEqual(44);

    const modalInputFont = await dialog
      .getByLabel("Event title")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(modalInputFont).toBeGreaterThanOrEqual(16);
  });

  test("serves valid PNG PWA icons and Famora manifest theme tokens", async ({
    request,
  }) => {
    const manifestRes = await request.get("/manifest.webmanifest");
    expect(manifestRes.status()).toBe(200);
    const manifestJson = (await manifestRes.json()) as {
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };

    expect(manifestJson.theme_color).toBe("#315C49");
    expect(manifestJson.background_color).toBe("#F7F5EF");

    for (const iconPath of [
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
      "/icons/apple-touch-icon.png",
    ]) {
      const res = await request.get(iconPath);
      expect(res.status(), `${iconPath} should return 200`).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
    }
  });
});
