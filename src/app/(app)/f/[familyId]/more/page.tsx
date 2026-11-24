import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronRight, PlusCircle, UserCircle } from "lucide-react";
import { PageHeader, Section } from "@/components/layout/primitives";
import { PwaInstallCard } from "@/components/pwa/pwa-install-card";
import { Card } from "@/components/ui/card";
import {
  DOMAIN_NAV_ITEMS,
  type NavItemConfig,
} from "@/config/navigation";
import {
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  translate,
  translateDomainLabel,
  translateNavGroup,
} from "@/lib/i18n";
import { routes } from "@/lib/routes";

const GROUPS: NavItemConfig["group"][] = [
  "daily",
  "household",
  "family",
  "system",
];

export default async function FamilyMorePage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <div className="space-y-6">
      <PageHeader
        title={translate(locale, "nav.allFeatures")}
        description={translate(locale, "nav.allFeaturesDesc")}
      />

      <PwaInstallCard familyId={familyId} />

      <Section title={translate(locale, "shell.accountProfile")}>
        <Card className="divide-y divide-[var(--border-subtle)] overflow-hidden p-0">
          <Link
            href={routes.account}
            className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--accent-primary)]">
                <UserCircle className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <span className="text-[14.5px] font-medium text-[var(--text-primary)]">
                {translate(locale, "shell.accountProfile")} &amp; {translate(locale, "shell.signOut")}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          </Link>
          <Link
            href={routes.onboarding}
            className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--accent-primary)]">
                <PlusCircle className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <span className="text-[14.5px] font-medium text-[var(--text-primary)]">
                {translate(locale, "shell.createOrJoinFamily")}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          </Link>
        </Card>
      </Section>

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const items = DOMAIN_NAV_ITEMS.filter((item) => item.group === group);
          return (
            <Section key={group} title={translateNavGroup(group, locale)}>
              <Card className="divide-y divide-[var(--border-subtle)] overflow-hidden p-0">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={routes.familyDomain(familyId, item.id)}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--accent-primary)]">
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </div>
                        <span className="text-[14.5px] font-medium text-[var(--text-primary)]">
                          {translateDomainLabel(item.id, locale)}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                    </Link>
                  );
                })}
              </Card>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
