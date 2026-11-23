import { requireAuthenticatedUser } from "@/features/auth/server";
import { MembersDirectoryView } from "@/features/members/components/members-directory-view";
import { getFamilyMembersData } from "@/features/members/server";
import { routes } from "@/lib/routes";

export default async function FamilyMembersPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const user = await requireAuthenticatedUser(
    routes.familyDomain(familyId, "family")
  );
  const data = await getFamilyMembersData(familyId, user.id);

  return (
    <MembersDirectoryView
      familyId={familyId}
      members={data.members}
      invitations={data.invitations}
      currentMemberId={data.currentMemberId}
      currentRoleKey={data.currentRoleKey}
    />
  );
}
