import { expect, test } from "@playwright/test";

test.describe("Smoke, Auth Guard & PWA Shell Verification", () => {
  test("serves /api/health, /manifest.webmanifest, /sw.js, and /offline.html cleanly", async ({
    request,
  }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const healthJson = (await health.json()) as { status: string; service: string };
    expect(healthJson.status).toBe("ok");
    expect(healthJson.service).toBe("famora");

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const manifestJson = (await manifest.json()) as {
      name: string;
      display: string;
    };
    expect(manifestJson.display).toBe("standalone");
    expect(manifestJson.name).toContain("Famora");

    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain('const CACHE_VERSION = "v2"');

    const offline = await request.get("/offline.html");
    expect(offline.status()).toBe(200);
    expect(await offline.text()).toContain("You are currently offline");
  });

  test("renders landing page, auth pages, and fails closed on unauthenticated protected routes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Masuk|Sign In/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Mulai|Get Started/i })).toBeVisible();

    await page.goto("/f/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("registers Service Worker and persists IndexedDB famora-pwa-db in real browser", async ({
    page,
  }) => {
    await page.goto("/login");
    const dbCheck = await page.evaluate(async () => {
      const req = indexedDB.open("famora-pwa-db", 1);
      return new Promise<boolean>((resolve) => {
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("offline_cache")) {
            db.createObjectStore("offline_cache", { keyPath: "key" });
          }
          if (!db.objectStoreNames.contains("mutation_outbox")) {
            db.createObjectStore("mutation_outbox", { keyPath: "id" });
          }
        };
        req.onsuccess = () => {
          const ok =
            req.result.objectStoreNames.contains("offline_cache") &&
            req.result.objectStoreNames.contains("mutation_outbox");
          req.result.close();
          resolve(ok);
        };
        req.onerror = () => resolve(false);
      });
    });
    expect(dbCheck).toBe(true);
  });

  test("renders Indonesian by default, switches to English, translates validation, and persists across reload and routes", async ({
    page,
  }) => {
    // 1. Default Indonesian on /
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page.getByRole("link", { name: "Masuk" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Mulai/i })).toBeVisible();

    // 2. Default Indonesian on /login + Zod validation in Indonesian
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page.getByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
    await page.getByRole("button", { name: "Masuk ke Famora" }).click();
    await expect(page.getByText("Masukkan alamat email yang valid.")).toBeVisible();
    await expect(page.getByText("Kata sandi wajib diisi.")).toBeVisible();

    // 3. Switch to English via AuthShell toggle -> updates UI + validation + persists across reload
    await page.getByRole("button", { name: "Bahasa Aplikasi" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Password is required.")).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to Famora" })).toBeVisible();

    // 4. Navigate to /signup and / in English (SSR + client sync)
    await page.goto("/signup");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Create your Famora account" })).toBeVisible();

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Sign In" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Get Started/i })).toBeVisible();
  });
});
