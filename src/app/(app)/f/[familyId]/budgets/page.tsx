import { requireAuthenticatedUser } from "@/features/auth/server";
import { getBudgetsBillsPageData } from "@/features/finance/budget-server";
import { FamilyBudgetsBillsView } from "@/features/finance/components/family-budgets-bills-view";
import { routes } from "@/lib/routes";

export default async function FamilyBudgetsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "budgets"));
  const data = await getBudgetsBillsPageData(familyId);

  return <FamilyBudgetsBillsView familyId={familyId} data={data} />;
}
