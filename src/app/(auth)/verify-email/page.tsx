import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();

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
          <Button variant="secondary" className="w-full">
            {translate(locale, "auth.verify.returnSignIn")}
          </Button>
        </Link>
      </div>
    </AuthShell>
  );
}
