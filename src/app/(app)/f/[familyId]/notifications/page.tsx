import { FamilyNotificationsView } from "@/features/notifications/components/family-notifications-view";
import { getNotificationsPageData } from "@/features/notifications/server";

export default async function FamilyNotificationsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const data = await getNotificationsPageData(familyId);
  return <FamilyNotificationsView familyId={familyId} data={data} />;
}
