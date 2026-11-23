"use client";

import { Layers } from "lucide-react";
import { PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { DOMAIN_NAV_ITEMS } from "@/config/navigation";
import { translateDomainLabel } from "@/lib/i18n";
import { useLocale } from "@/providers/locale-provider";

export function DomainShellView({
  familyId,
  domainId,
}: {
  familyId: string;
  domainId: string;
}) {
  const { locale, t } = useLocale();
  const domain = DOMAIN_NAV_ITEMS.find((item) => item.id === domainId);
  const Icon = domain?.icon ?? Layers;
  const title = domain
    ? translateDomainLabel(domain.id, locale)
    : t("domainShell.defaultTitle");

  return (
    <Section>
      <PageHeader
        title={title}
        description={t("domainShell.desc", { familyId })}
        badge={<Badge variant="sage">{t("domainShell.badge")}</Badge>}
      />
      <EmptyState
        icon={<Icon className="h-5 w-5" strokeWidth={1.75} />}
        title={t("domainShell.readyTitle", { title })}
        description={t("domainShell.readyDesc")}
      />
    </Section>
  );
}
