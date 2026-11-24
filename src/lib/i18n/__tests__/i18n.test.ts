import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedRelativeTime,
  normalizeLocale,
  toIntlLocale,
  translate,
  translateDomainLabel,
  translateError,
  translateNavGroup,
} from "../index";
import { MESSAGES } from "../messages";

const cookieSetMock = vi.fn();
const upsertedPrefs: Array<Record<string, unknown>> = [];

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookieSetMock,
    get: vi.fn(),
  })),
}));

vi.mock("@/features/auth/server", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "mem-1" } }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "member_preferences") {
        return {
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            upsertedPrefs.push(payload);
            return { error: null };
          }),
        };
      }
      return {};
    }),
  })),
}));

import { updatePersonalPreferencesAction } from "@/features/settings/actions";

describe("AUD-010 Complete Localization & Language Persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertedPrefs.length = 0;
  });

  it("maintains strict 1:1 key parity and non-empty translations between id and en", () => {
    const idKeys = Object.keys(MESSAGES.id).sort();
    const enKeys = Object.keys(MESSAGES.en).sort();
    expect(idKeys).toEqual(enKeys);

    for (const key of idKeys) {
      expect(MESSAGES.id[key as keyof typeof MESSAGES.id].trim().length).toBeGreaterThan(0);
      expect(MESSAGES.en[key as keyof typeof MESSAGES.en].trim().length).toBeGreaterThan(0);
    }
  });

  it("defaults to Indonesian ('id') and supports English ('en') with parameter interpolation", () => {
    expect(DEFAULT_LOCALE).toBe("id");
    expect(normalizeLocale(undefined)).toBe("id");
    expect(normalizeLocale("fr")).toBe("id");
    expect(normalizeLocale("en")).toBe("en");

    expect(translate("id", "shell.signOut")).toBe("Keluar");
    expect(translate("en", "shell.signOut")).toBe("Sign Out");

    expect(translate("id", "pwa.pendingSync", { count: 3 })).toBe("3 menunggu sinkronisasi");
    expect(translate("en", "pwa.pendingSync", { count: 3 })).toBe("3 pending sync");

    expect(translate("id", "shopping.deleteListDescWithItems", { name: "Mingguan", count: 4 })).toContain("Mingguan");
    expect(translate("en", "shopping.deleteListDescWithItems", { name: "Weekly", count: 4 })).toContain("Weekly");

    expect(translateDomainLabel("child-dev", "id")).toBe("Tumbuh Kembang Anak");
    expect(translateDomainLabel("child-dev", "en")).toBe("Child Dev");

    expect(translateNavGroup("daily", "id")).toBe("Ritme Harian");
    expect(translateNavGroup("daily", "en")).toBe("Daily Rhythm");
  });

  it("formats dates, numbers, and relative time according to active locale", () => {
    expect(toIntlLocale("id")).toBe("id-ID");
    expect(toIntlLocale("en")).toBe("en-US");

    const idDate = formatLocalizedDate("2026-11-23T10:00:00Z", "id", { month: "long", year: "numeric", timeZone: "UTC" });
    const enDate = formatLocalizedDate("2026-11-23T10:00:00Z", "en", { month: "long", year: "numeric", timeZone: "UTC" });
    expect(idDate).toContain("2026");
    expect(enDate).toContain("November");

    expect(formatLocalizedNumber(1250000, "id")).toContain("1.250.000");
    expect(formatLocalizedNumber(1250000, "en")).toContain("1,250,000");

    const rel = formatLocalizedRelativeTime("2026-11-23T09:00:00Z", "id", new Date("2026-11-23T10:00:00Z"));
    expect(rel.length).toBeGreaterThan(0);
  });

  it("persists selected locale in member_preferences and sets the famora_locale cookie", async () => {
    const res = await updatePersonalPreferencesAction({
      familyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      themeMode: "system",
      locale: "en",
      digestEnabled: true,
      pushEnabled: true,
      emailEnabled: true,
      inAppEnabled: true,
    });

    expect(res.ok).toBe(true);
    expect(upsertedPrefs).toHaveLength(1);
    expect(upsertedPrefs[0].locale).toBe("en");
    expect(cookieSetMock).toHaveBeenCalledWith(
      LOCALE_COOKIE_NAME,
      "en",
      expect.objectContaining({ path: "/" })
    );
  });

  it("translates Server Action errors and Zod validation messages in both locales", () => {
    // Auth & Server Action errors
    expect(translateError("id", "Invalid email or password.")).toBe(
      "Email atau kata sandi salah."
    );
    expect(translateError("en", "Invalid email or password.")).toBe(
      "Invalid email or password."
    );

    // Dynamic permission errors
    expect(
      translateError("id", "Missing permission: finance.accounts.manage")
    ).toBe("Izin tidak mencukupi: finance.accounts.manage");
    expect(
      translateError("en", "Missing permission: finance.accounts.manage")
    ).toBe("Missing permission: finance.accounts.manage");

    // Zod validation messages
    expect(translateError("id", "Enter a valid email address.")).toBe(
      "Masukkan alamat email yang valid."
    );
    expect(translateError("id", "Password must be at least 8 characters.")).toBe(
      "Kata sandi minimal 8 karakter."
    );
    expect(translateError("en", "Task title is required.")).toBe(
      "Task title is required."
    );

    // MessageKey & fallback
    expect(translateError("id", "validation.unauthorized")).toBe(
      "Anda tidak memiliki izin untuk tindakan ini."
    );
    expect(translateError("id", null)).toBe(
      "Terjadi kesalahan yang tidak terduga."
    );
    expect(translateError("en", null)).toBe("An unexpected error occurred.");
  });

  it("ensures all domain views use useLocale and have no hardcoded toast literals or untranslated server errors", () => {
    const srcRoot = path.resolve(__dirname, "../../..");
    const checkDirs = [
      path.join(srcRoot, "features"),
      path.join(srcRoot, "components/layout"),
      path.join(srcRoot, "components/pwa"),
    ];

    const tsxFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(full);
        } else if (
          entry.name.endsWith(".tsx") &&
          entry.name !== "password-field.tsx" &&
          entry.name !== "primitives.tsx"
        ) {
          tsxFiles.push(full);
        }
      }
    };
    checkDirs.forEach(walk);

    expect(tsxFiles.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const file of tsxFiles) {
      const rel = path.relative(srcRoot, file);
      const content = fs.readFileSync(file, "utf8");
      if (
        !content.includes("useLocale") &&
        !content.includes("translate(") &&
        !content.includes("translateDomainLabel")
      ) {
        violations.push(`${rel}: missing useLocale/translate usage`);
      }

      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (/toast\.(error|success|info|warning)\(\s*["'`][A-Za-z]/.test(line)) {
          violations.push(`${rel}:${idx + 1}: hardcoded toast literal`);
        }
        if (
          /toast\.error\(\s*(res|r|err)\.error/.test(line) &&
          !line.includes("te(")
        ) {
          violations.push(`${rel}:${idx + 1}: untranslated server error toast`);
        }
        const propMatch = line.match(
          /\b(title|description|label|actionLabel|placeholder)="([A-Z][^"{}]+)"/
        );
        if (propMatch && propMatch[2] !== "Senvamily") {
          violations.push(
            `${rel}:${idx + 1}: hardcoded UI prop ${propMatch[1]}="${propMatch[2]}"`
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
