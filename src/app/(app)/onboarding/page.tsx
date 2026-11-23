import Link from "next/link";
import { Settings } from "lucide-react";
import { Container } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import {
  ensureProfileInitialized,
  requireAuthenticatedUser,
} from "@/features/auth/server";
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard";
import { getOnboardingStateForUser } from "@/features/onboarding/server";
import { routes } from "@/lib/routes";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function OnboardingPage() {
  const locale = await getRequestLocale();
  const user = await requireAuthenticatedUser(routes.onboarding);
  const profile = await ensureProfileInitialized(user);
  const { families, incompleteFamily } = await getOnboardingStateForUser(user.id);

  return (
    <Container className="py-8">
      <div className="mb-4 flex justify-end">
        <Link href={routes.account}>
          <Button variant="ghost" size="sm">
            <Settings className="h-4 w-4" />
            {translate(locale, "onboarding.accountSettings")}
          </Button>
        </Link>
      </div>

      <OnboardingWizard
        userId={user.id}
        userName={profile?.full_name ?? user.email?.split("@")[0] ?? "there"}
        existingFamilies={families}
        incompleteFamily={incompleteFamily}
      />
    </Container>
  );
}
