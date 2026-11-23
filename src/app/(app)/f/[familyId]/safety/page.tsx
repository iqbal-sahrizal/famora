import { FamilySafetyView } from "@/features/safety/components/family-safety-view";
import { getSafetyPageData } from "@/features/safety/server";

export default async function FamilySafetyPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const data = await getSafetyPageData(familyId);
  return <FamilySafetyView familyId={familyId} data={data} />;
}
