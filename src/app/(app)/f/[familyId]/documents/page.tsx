import { requireAuthenticatedUser } from "@/features/auth/server";
import { FamilyVaultView } from "@/features/documents/components/family-vault-view";
import { getDocumentsPageData } from "@/features/documents/server";
import { routes } from "@/lib/routes";

export default async function FamilyDocumentsPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  await requireAuthenticatedUser(routes.familyDomain(familyId, "documents"));
  const data = await getDocumentsPageData(familyId);

  return <FamilyVaultView familyId={familyId} data={data} />;
}
