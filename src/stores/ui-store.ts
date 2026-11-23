"use client";

import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  activeFamilyId: string | null;
  toggleSidebar: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setActiveFamilyId: (familyId: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
  activeFamilyId: null,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
  setActiveFamilyId: (familyId) => set({ activeFamilyId: familyId }),
}));
