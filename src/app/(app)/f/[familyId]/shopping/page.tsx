import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyShoppingView } from "@/features/shopping/components/family-shopping-view";
import { getShoppingPageData } from "@/features/shopping/server";
import { routes } from "@/lib/routes";

export default async function FamilyShoppingPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "shopping"));
  const data = await getShoppingPageData(familyId);

  return <FamilyShoppingView familyId={familyId} data={data} />;
}
