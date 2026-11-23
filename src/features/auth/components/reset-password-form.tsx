"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";
import { resetPasswordAction } from "../actions";
import { resetPasswordSchema, type ResetPasswordInput } from "../schemas";
import { PasswordField } from "./password-field";

export function ResetPasswordForm() {
  const router = useRouter();
  const { t, te } = useLocale();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ResetPasswordInput) => {
    setServerError(null);
    const result = await resetPasswordAction(values);
    if (!result.ok) {
      setServerError(te(result.error ?? "Unable to update password."));
      return;
    }
    toast.success(t("auth.reset.successToast"));
    router.push(result.redirectTo ?? routes.onboarding);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl bg-[var(--status-danger-bg)] px-4 py-3 text-[13.5px] text-[var(--status-danger-fg)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <PasswordField
        label={t("auth.reset.newPasswordLabel")}
        autoComplete="new-password"
        placeholder={t("auth.reset.newPasswordPlaceholder")}
        error={errors.password?.message ? te(errors.password.message) : undefined}
        {...register("password")}
      />

      <PasswordField
        label={t("auth.reset.confirmPasswordLabel")}
        autoComplete="new-password"
        placeholder={t("auth.reset.confirmPasswordPlaceholder")}
        error={
          errors.confirmPassword?.message
            ? te(errors.confirmPassword.message)
            : undefined
        }
        {...register("confirmPassword")}
      />

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        {t("auth.reset.submit")}
      </Button>
    </form>
  );
}
