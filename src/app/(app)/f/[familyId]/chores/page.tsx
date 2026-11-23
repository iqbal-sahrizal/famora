import { requireAuthenticatedUser } from "@/features/auth/server";
import { ChoresRewardsView } from "@/features/chores/components/chores-rewards-view";
import { getChoresPageData } from "@/features/chores/server";
import { routes } from "@/lib/routes";

export default async function FamilyChoresPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(
    routes.familyDomain(familyId, "chores")
  );
  const data = await getChoresPageData(familyId, user.id);

  return <ChoresRewardsView familyId={familyId} data={data} />;
}
