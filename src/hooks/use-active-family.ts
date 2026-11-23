"use client";

import { useParams } from "next/navigation";
import * as React from "react";
import { useUiStore } from "@/stores/ui-store";

/**
 * Synchronizes the URL-scoped `familyId` parameter with the UI store.
 */
export function useActiveFamilyId(): string | null {
  const params = useParams<{ familyId?: string }>();
  const setActiveFamilyId = useUiStore((s) => s.setActiveFamilyId);
  const familyId = typeof params?.familyId === "string" ? params.familyId : null;

  React.useEffect(() => {
    setActiveFamilyId(familyId);
  }, [familyId, setActiveFamilyId]);

  return familyId;
}
