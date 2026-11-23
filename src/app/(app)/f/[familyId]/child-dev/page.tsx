import { requireAuthenticatedUser } from "@/features/auth/server";
import { ChildDevelopmentView } from "@/features/child-dev/components/child-development-view";
import { getChildDevPageData } from "@/features/child-dev/server";
import { routes } from "@/lib/routes";

export default async function ChildDevelopmentPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "child-dev"));
  const data = await getChildDevPageData(familyId);

  return <ChildDevelopmentView familyId={familyId} data={data} />;
}
