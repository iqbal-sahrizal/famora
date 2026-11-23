import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export default async function ForgotPasswordPage() {
  const locale = await getRequestLocale();

  return (
    <AuthShell
      title={translate(locale, "auth.forgot.title")}
      subtitle={translate(locale, "auth.forgot.subtitle")}
      footer={
        <p className="text-center text-[13.5px] text-[var(--text-secondary)]">
          {translate(locale, "auth.forgot.rememberedPrompt")}{" "}
          <Link
            href={routes.login}
            className="font-semibold text-[var(--accent-primary)] hover:underline"
          >
            {translate(locale, "auth.forgot.backLink")}
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
