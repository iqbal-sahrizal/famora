import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilySafetyView } from "@/features/safety/components/family-safety-view";
import { getSafetyPageData } from "@/features/safety/server";
import { routes } from "@/lib/routes";

export default async function FamilySafetyPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "safety"));
  const data = await getSafetyPageData(familyId);
  return <FamilySafetyView familyId={familyId} data={data} />;
}
