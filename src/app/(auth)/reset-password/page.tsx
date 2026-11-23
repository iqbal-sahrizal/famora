import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function ResetPasswordPage() {
  const locale = await getRequestLocale();

  return (
    <AuthShell
      title={translate(locale, "auth.reset.title")}
      subtitle={translate(locale, "auth.reset.subtitle")}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
