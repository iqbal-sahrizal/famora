import Link from "next/link";
import { AlertTriangle, CheckCircle2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { safeRedirectPath } from "@/features/auth/server";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; status?: string; next?: string }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const nextPath = safeRedirectPath(params.next, routes.onboarding);
  const isVerified = params.status === "verified";
  const isError = params.status === "error";

  if (isVerified) {
    return (
      <AuthShell
        title={translate(locale, "auth.verify.verifiedTitle")}
        subtitle={translate(locale, "auth.verify.verifiedSubtitle")}
      >
        <div className="space-y-6 rounded-[24px] bg-[var(--bg-surface)] p-6 border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-[14.5px] leading-relaxed text-[var(--text-primary)]">
            {translate(locale, "auth.verify.verifiedBody")}
          </p>
          <div className="space-y-2.5">
            <Link href={nextPath} className="block">
              <Button className="w-full min-h-[44px]">
                {translate(locale, "auth.verify.continueApp")}
              </Button>
            </Link>
            <Link href={`${routes.login}?verified=1`} className="block">
              <Button variant="secondary" className="w-full min-h-[44px]">
                {translate(locale, "auth.verify.signInNow")}
              </Button>
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (isError) {
    return (
      <AuthShell
        title={translate(locale, "auth.verify.errorTitle")}
        subtitle={translate(locale, "auth.verify.errorSubtitle")}
      >
        <div className="space-y-6 rounded-[24px] bg-[var(--bg-surface)] p-6 border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <p className="text-[14.5px] leading-relaxed text-[var(--text-primary)]">
            {translate(locale, "auth.verify.errorBody")}
          </p>
          <div className="space-y-2.5">
            <Link href={routes.login} className="block">
              <Button className="w-full min-h-[44px]">
                {translate(locale, "auth.verify.signInNow")}
              </Button>
            </Link>
            <Link href={routes.signup} className="block">
              <Button variant="secondary" className="w-full min-h-[44px]">
                {translate(locale, "auth.login.createLink")}
              </Button>
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={translate(locale, "auth.verify.title")}
      subtitle={translate(locale, "auth.verify.subtitle")}
    >
      <div className="space-y-6 rounded-[24px] bg-[var(--bg-surface)] p-6 border border-[var(--border-subtle)] shadow-[var(--shadow-soft)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]">
          <MailCheck className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <p className="text-[14.5px] leading-relaxed text-[var(--text-primary)]">
            {params.email
              ? translate(locale, "auth.verify.bodyWithEmail", {
                  email: params.email,
                })
              : translate(locale, "auth.verify.bodyNoEmail")}
          </p>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {translate(locale, "auth.verify.autoSignIn")}
          </p>
        </div>
        <Link href={routes.login} className="block">
          <Button variant="secondary" className="w-full min-h-[44px]">
            {translate(locale, "auth.verify.returnSignIn")}
          </Button>
        </Link>
      </div>
    </AuthShell>
  );
}
