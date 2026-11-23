import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();

  return (
    <AuthShell
      title={translate(locale, "auth.login.title")}
      subtitle={translate(locale, "auth.login.subtitle")}
      footer={
        <p className="text-center text-[13.5px] text-[var(--text-secondary)]">
          {translate(locale, "auth.login.newPrompt")}{" "}
          <Link
            href={routes.signup}
            className="font-semibold text-[var(--accent-primary)] hover:underline"
          >
            {translate(locale, "auth.login.createLink")}
          </Link>
        </p>
      }
    >
      {params.error === "verification_failed" && (
        <div
          role="alert"
          className="mb-4 rounded-2xl bg-[var(--status-danger-bg)] px-4 py-3 text-[13.5px] text-[var(--status-danger-fg)]"
        >
          {translate(locale, "auth.login.verificationFailed")}
        </div>
      )}
      <LoginForm redirectTo={params.redirectTo} />
    </AuthShell>
  );
}
