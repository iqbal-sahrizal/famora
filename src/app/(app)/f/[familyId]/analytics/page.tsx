import { requireAuthenticatedUser } from "@/features/auth/server";
import { getAnalyticsPageData } from "@/features/finance/analytics-server";
import { FamilyAnalyticsView } from "@/features/finance/components/family-analytics-view";
import { routes } from "@/lib/routes";

export default async function FamilyAnalyticsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "analytics"));
  const data = await getAnalyticsPageData(familyId);

  return <FamilyAnalyticsView familyId={familyId} data={data} />;
}
