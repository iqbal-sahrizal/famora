import { requireAuthenticatedUser } from "@/features/auth/server";
import { InventoryView } from "@/features/household/components/inventory-view";
import { getInventoryPageData } from "@/features/household/server";
import { routes } from "@/lib/routes";

export default async function FamilyInventoryPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "inventory"));
  const data = await getInventoryPageData(familyId);
  return <InventoryView familyId={familyId} data={data} />;
}
