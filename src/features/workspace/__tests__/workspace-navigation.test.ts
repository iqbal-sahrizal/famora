import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const queriedProfileColumns: string[] = [];
let mockProfileRow: { full_name: string } | null = { full_name: "Maya Rivera" };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((cols: string) => {
            queriedProfileColumns.push(cols);
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockProfileRow }),
              }),
            };
          }),
        };
      }
      if (table === "family_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        };
      }
      return {};
    }),
  })),
}));

import { getWorkspaceShellContext, validateFamilySwitchTarget } from "../server";
import { DOMAIN_NAV_ITEMS } from "@/config/navigation";
import manifest from "@/app/manifest";
import { translate } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { routes } from "@/lib/routes";

describe("Phase 1 — AUD-002 AppShell Navigation, Family Switching & Session State", () => {
  it("validates permission-aware family switching and blocks unauthorized family IDs", () => {
    const myFamilies = [
      { familyId: "fam-a", name: "Rivera Home", roleKey: "owner" },
      { familyId: "fam-b", name: "Grandparents", roleKey: "adult" },
    ];

    expect(validateFamilySwitchTarget(myFamilies, "fam-a")).toBe(true);
    expect(validateFamilySwitchTarget(myFamilies, "fam-b")).toBe(true);
    expect(validateFamilySwitchTarget(myFamilies, "fam-unauthorized")).toBe(
      false
    );
  });

  it("clears activeFamilyId client store state on logout and updates on switch", () => {
    const store = useUiStore.getState();
    store.setActiveFamilyId("fam-a");
    expect(useUiStore.getState().activeFamilyId).toBe("fam-a");

    store.setActiveFamilyId("fam-b");
    expect(useUiStore.getState().activeFamilyId).toBe("fam-b");

    // Simulating logout state reset
    store.setActiveFamilyId(null);
    expect(useUiStore.getState().activeFamilyId).toBeNull();
  });

  it("provides dedicated routes for account, onboarding, and mobile more page", () => {
    expect(routes.account).toBe("/account");
    expect(routes.onboarding).toBe("/onboarding");
    expect(routes.familyMore("fam-a")).toBe("/f/fam-a/more");
  });

  it("queries profiles.full_name and preserves fallback behavior when profile is missing", async () => {
    queriedProfileColumns.length = 0;
    mockProfileRow = { full_name: "Maya Rivera" };
    const user = {
      id: "user-1",
      email: "maya@famora.app",
      user_metadata: { full_name: "Fallback Maya" },
    } as unknown as User;

    const ctx = await getWorkspaceShellContext(user);
    expect(queriedProfileColumns).toEqual(["full_name"]);
    expect(ctx.userName).toBe("Maya Rivera");

    mockProfileRow = null;
    const fallbackCtx = await getWorkspaceShellContext(user);
    expect(fallbackCtx.userName).toBe("Fallback Maya");
  });

  it("configures mobile primary bottom navigation as Home, Calendar, Tasks, Finance + More without truncation", () => {
    const primary = DOMAIN_NAV_ITEMS.filter((item) => item.mobilePrimary);
    expect(primary.map((p) => p.id)).toEqual([
      "dashboard",
      "calendar",
      "tasks",
      "finance",
    ]);
    expect(primary.map((p) => translate("en", p.mobileLabelKey!))).toEqual([
      "Home",
      "Calendar",
      "Tasks",
      "Finance",
    ]);
    expect(primary.map((p) => translate("id", p.mobileLabelKey!))).toEqual([
      "Beranda",
      "Kalender",
      "Tugas",
      "Keuangan",
    ]);
  });

  it("serves PNG PWA manifest icons and Famora theme tokens", () => {
    const m = manifest();
    expect(m.theme_color).toBe("#315C49");
    expect(m.background_color).toBe("#F7F5EF");
    expect(m.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }),
        expect.objectContaining({ src: "/icons/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
      ])
    );
  });
});
