"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";
import { registerAction } from "../actions";
import { registerSchema, type RegisterInput } from "../schemas";
import { PasswordField } from "./password-field";

export function RegisterForm() {
  const router = useRouter();
  const { t, te } = useLocale();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = async (values: RegisterInput) => {
    setServerError(null);
    const result = await registerAction(values);
    if (!result.ok) {
      setServerError(te(result.error ?? "Unable to create account."));
      return;
    }
    router.push(result.redirectTo ?? routes.verifyEmail);
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

      <Input
        label={t("auth.signup.fullNameLabel")}
        autoComplete="name"
        placeholder={t("auth.signup.fullNamePlaceholder")}
        error={errors.fullName?.message ? te(errors.fullName.message) : undefined}
        {...register("fullName")}
      />

      <Input
        label={t("auth.login.emailLabel")}
        type="email"
        autoComplete="email"
        placeholder={t("auth.login.emailPlaceholder")}
        error={errors.email?.message ? te(errors.email.message) : undefined}
        {...register("email")}
      />

      <PasswordField
        label={t("auth.login.passwordLabel")}
        autoComplete="new-password"
        placeholder={t("auth.signup.passwordPlaceholder")}
        hint={t("auth.signup.passwordHint")}
        error={errors.password?.message ? te(errors.password.message) : undefined}
        {...register("password")}
      />

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        {t("auth.signup.submit")}
      </Button>
    </form>
  );
}
