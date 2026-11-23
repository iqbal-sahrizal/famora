import { FamilyAiView } from "@/features/ai/components/family-ai-view";
import { getAiAssistantPageData } from "@/features/ai/server";

export default async function FamilyAiPage({
  params,
  searchParams,
}: {
  params: Promise<{ familyId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { familyId } = await params;
  const { c } = await searchParams;
  const data = await getAiAssistantPageData(familyId, c ?? null);
  return <FamilyAiView familyId={familyId} data={data} />;
}
