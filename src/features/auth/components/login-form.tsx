"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";
import { loginAction } from "../actions";
import { loginSchema, type LoginInput } from "../schemas";
import { PasswordField } from "./password-field";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const { t, te } = useLocale();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", redirectTo },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    const result = await loginAction({ ...values, redirectTo });
    if (!result.ok) {
      setServerError(te(result.error ?? "Unable to sign in."));
      return;
    }
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

      <Input
        label={t("auth.login.emailLabel")}
        type="email"
        autoComplete="email"
        placeholder={t("auth.login.emailPlaceholder")}
        error={errors.email?.message ? te(errors.email.message) : undefined}
        {...register("email")}
      />

      <div className="space-y-1.5">
        <PasswordField
          label={t("auth.login.passwordLabel")}
          autoComplete="current-password"
          placeholder={t("auth.login.passwordPlaceholder")}
          error={errors.password?.message ? te(errors.password.message) : undefined}
          {...register("password")}
        />
        <div className="flex justify-end">
          <Link
            href={routes.forgotPassword}
            className="text-[12.5px] font-medium text-[var(--accent-primary)] hover:underline"
          >
            {t("auth.login.forgotLink")}
          </Link>
        </div>
      </div>

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        {t("auth.login.submit")}
      </Button>
    </form>
  );
}
