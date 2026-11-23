import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyFinanceView } from "@/features/finance/components/family-finance-view";
import { getFinancePageData } from "@/features/finance/server";
import { routes } from "@/lib/routes";

export default async function FamilyFinancePage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "finance"));
  const data = await getFinancePageData(familyId);

  return <FamilyFinanceView familyId={familyId} data={data} />;
}
