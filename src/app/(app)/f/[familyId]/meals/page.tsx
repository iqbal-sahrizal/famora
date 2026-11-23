import { requireAuthenticatedUser } from "@/features/auth/server";
import { MealsView } from "@/features/household/components/meals-view";
import { getMealsPageData } from "@/features/household/server";
import { routes } from "@/lib/routes";

export default async function FamilyMealsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "meals"));
  const data = await getMealsPageData(familyId);
  return <MealsView familyId={familyId} data={data} />;
}
