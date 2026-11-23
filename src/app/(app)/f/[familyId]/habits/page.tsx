import { FamilyHabitsView } from "@/features/habits/components/family-habits-view";
import { getHabitsPageData } from "@/features/habits/server";

export default async function FamilyHabitsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const data = await getHabitsPageData(familyId);
  return <FamilyHabitsView familyId={familyId} data={data} />;
}
