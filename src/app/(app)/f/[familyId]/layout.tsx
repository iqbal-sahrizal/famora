import * as React from "react";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/features/auth/server";
import { getWorkspaceShellContext } from "@/features/workspace/server";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n";
import { routes } from "@/lib/routes";

export default async function FamilyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(routes.familyDashboard(familyId));
  const [shellContext, cookieStore] = await Promise.all([
    getWorkspaceShellContext(user, familyId),
    cookies(),
  ]);
  const hasLocaleCookie = Boolean(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <AppShell
      familyId={familyId}
      shellContext={shellContext}
      syncMemberLocale={!hasLocaleCookie ? shellContext.memberLocale : undefined}
    >
      {children}
    </AppShell>
  );
}
