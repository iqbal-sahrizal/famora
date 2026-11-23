import { FamilyMemoriesView } from "@/features/memories/components/family-memories-view";
import { getMemoriesPageData } from "@/features/memories/server";

export default async function FamilyMemoriesPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const data = await getMemoriesPageData(familyId);
  return <FamilyMemoriesView familyId={familyId} data={data} />;
}
