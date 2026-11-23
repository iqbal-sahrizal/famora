import { FamilyChatView } from "@/features/chat/components/family-chat-view";
import { getChatPageData } from "@/features/chat/server";

export default async function FamilyChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ familyId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { familyId } = await params;
  const { c } = await searchParams;
  const data = await getChatPageData(familyId, c ?? null);
  return <FamilyChatView familyId={familyId} data={data} />;
}
