import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyNoticeboardView } from "@/features/noticeboard/components/family-noticeboard-view";
import { getNoticeboardData } from "@/features/noticeboard/server";
import { routes } from "@/lib/routes";

export default async function FamilyNoticeboardPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(
    routes.familyDomain(familyId, "noticeboard")
  );
  const data = await getNoticeboardData(familyId, user.id);

  return <FamilyNoticeboardView familyId={familyId} data={data} />;
}
