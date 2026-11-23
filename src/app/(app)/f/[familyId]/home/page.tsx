import { requireAuthenticatedUser } from "@/features/auth/server";
import { HomeManagementView } from "@/features/household/components/home-view";
import { getHomePageData } from "@/features/household/server";
import { routes } from "@/lib/routes";

export default async function FamilyHomePage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "home"));
  const data = await getHomePageData(familyId);
  return <HomeManagementView familyId={familyId} data={data} />;
}
