import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilySettingsView } from "@/features/settings/components/family-settings-view";
import { getFamilySettingsData } from "@/features/settings/server";
import { routes } from "@/lib/routes";

export default async function FamilySettingsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(
    routes.familyDomain(familyId, "settings")
  );
  const data = await getFamilySettingsData(familyId, user.id);

  return (
    <FamilySettingsView
      familyId={familyId}
      currentUserId={user.id}
      data={data}
    />
  );
}
