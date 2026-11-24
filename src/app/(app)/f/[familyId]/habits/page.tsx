import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyHabitsView } from "@/features/habits/components/family-habits-view";
import { getHabitsPageData } from "@/features/habits/server";
import { routes } from "@/lib/routes";

export default async function FamilyHabitsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "habits"));
  const data = await getHabitsPageData(familyId);
  return <FamilyHabitsView familyId={familyId} data={data} />;
}
