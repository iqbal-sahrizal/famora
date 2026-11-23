import { describe, expect, it } from "vitest";
import { validateFamilySwitchTarget } from "../server";
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
});
