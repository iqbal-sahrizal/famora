import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyDashboardView } from "@/features/dashboard/components/family-dashboard-view";
import { getFamilyDashboardData } from "@/features/dashboard/server";
import { routes } from "@/lib/routes";

export default async function FamilyDashboardPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(routes.familyDashboard(familyId));
  const data = await getFamilyDashboardData(familyId, user.id);

  return <FamilyDashboardView familyId={familyId} data={data} />;
}
