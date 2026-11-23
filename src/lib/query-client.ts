import { QueryClient } from "@tanstack/react-query";
import type { DomainId } from "@/types/domain";

/**
 * Creates a TanStack QueryClient configured for Famora's offline-resilient UX.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/**
 * Enforces family-namespaced cache keys to prevent cross-family data bleed.
 */
export const familyQueryKeys = {
  all: (familyId: string) => ["family", familyId] as const,
  domain: (familyId: string, domain: DomainId) =>
    ["family", familyId, domain] as const,
  detail: (familyId: string, domain: DomainId, entityId: string) =>
    ["family", familyId, domain, entityId] as const,
};
