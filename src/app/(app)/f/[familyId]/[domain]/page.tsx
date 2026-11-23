import { notFound } from "next/navigation";
import { DOMAIN_NAV_ITEMS } from "@/config/navigation";
import { DomainShellView } from "@/features/workspace/components/domain-shell-view";

export default async function FamilyDomainPage({
  params,
}: {
  params: Promise<{ familyId: string; domain: string }>;
}) {
  const { familyId, domain } = await params;
  const exists = DOMAIN_NAV_ITEMS.some((item) => item.id === domain);
  if (!exists) {
    notFound();
  }

  return <DomainShellView familyId={familyId} domainId={domain} />;
}
