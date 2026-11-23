"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/providers/locale-provider";
import { forgotPasswordAction } from "../actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";

export function ForgotPasswordForm() {
  const { t, te } = useLocale();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [sentMessage, setSentMessage] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setServerError(null);
    setSentMessage(null);
    const result = await forgotPasswordAction(values);
    if (!result.ok) {
      setServerError(te(result.error ?? "Unable to send reset email."));
      return;
    }
    setSentMessage(t("auth.forgot.sentDefault"));
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

      {sentMessage && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-2xl bg-[var(--tint-sage)] px-4 py-3 text-[13.5px] text-[var(--tint-sage-fg)]"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sentMessage}</span>
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

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        {t("auth.forgot.submit")}
      </Button>
    </form>
  );
}
