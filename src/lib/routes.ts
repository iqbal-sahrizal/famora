import type { DomainId } from "@/types/domain";

export const routes = {
  home: "/",
  designSystem: "/design-system",
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  onboarding: "/onboarding",
  account: "/account",
  authCallback: "/auth/callback",
  familyDomain: (familyId: string, domain: DomainId) =>
    `/f/${encodeURIComponent(familyId)}/${domain === "dashboard" ? "" : domain}`.replace(
      /\/$/,
      ""
    ),
  familyDashboard: (familyId: string) => `/f/${encodeURIComponent(familyId)}`,
  familyMore: (familyId: string) => `/f/${encodeURIComponent(familyId)}/more`,
} as const;
