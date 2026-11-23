import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyTasksView } from "@/features/tasks/components/family-tasks-view";
import { getTasksPageData } from "@/features/tasks/server";
import { routes } from "@/lib/routes";

export default async function FamilyTasksPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(
    routes.familyDomain(familyId, "tasks")
  );
  const data = await getTasksPageData(familyId, user.id);

  return <FamilyTasksView familyId={familyId} data={data} />;
}
