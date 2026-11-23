import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export default async function SignupPage() {
  const locale = await getRequestLocale();

  return (
    <AuthShell
      title={translate(locale, "auth.signup.title")}
      subtitle={translate(locale, "auth.signup.subtitle")}
      footer={
        <p className="text-center text-[13.5px] text-[var(--text-secondary)]">
          {translate(locale, "auth.signup.existingPrompt")}{" "}
          <Link
            href={routes.login}
            className="font-semibold text-[var(--accent-primary)] hover:underline"
          >
            {translate(locale, "auth.signup.signinLink")}
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
