"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Container, PageHeader, Section } from "@/components/layout/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";
import { logoutAction, updateProfileAction } from "../actions";
import { profileUpdateSchema, type ProfileUpdateInput } from "../schemas";

export function AccountSettingsView({
  email,
  initialProfile,
}: {
  email: string;
  initialProfile: {
    fullName: string;
    defaultTimezone: string;
    locale: string;
  };
}) {
  const router = useRouter();
  const { t, te, setLocale } = useLocale();
  const [signingOut, setSigningOut] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: initialProfile,
  });

  const onSubmit = async (values: ProfileUpdateInput) => {
    const result = await updateProfileAction(values);
    if (!result.ok) {
      toast.error(te(result.error, "account.saveError"));
      return;
    }
    setLocale(values.locale.startsWith("en") ? "en" : "id");
    toast.success(t("account.savedToast"));
    router.refresh();
  };

  const handleLogout = async () => {
    setSigningOut(true);
    const result = await logoutAction();
    setSigningOut(false);
    if (result.ok) {
      router.push(routes.login);
      router.refresh();
    }
  };

  return (
    <Container className="py-10">
      <Section>
        <PageHeader
          title={t("account.title")}
          description={t("account.description")}
          badge={<Badge variant="sage">{t("account.badge")}</Badge>}
          actions={
            <Button
              variant="secondary"
              onClick={handleLogout}
              isLoading={signingOut}
            >
              <LogOut className="h-4 w-4" />
              {t("account.signOut")}
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("account.profileTitle")}</CardTitle>
                <CardDescription>
                  {t("account.profileDesc")}
                </CardDescription>
              </div>
            </CardHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label={t("account.emailLabel")}
                value={email}
                disabled
                hint={t("account.emailHint")}
              />

              <Input
                label={t("account.fullNameLabel")}
                error={errors.fullName?.message ? te(errors.fullName.message) : undefined}
                {...register("fullName")}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label={t("account.timezoneLabel")}
                  options={[
                    { value: "UTC", label: "UTC" },
                    { value: "America/Los_Angeles", label: "Pacific Time (US)" },
                    { value: "America/New_York", label: "Eastern Time (US)" },
                    { value: "Asia/Jakarta", label: "WIB (Asia/Jakarta)" },
                    { value: "Europe/London", label: "London (GMT/BST)" },
                  ]}
                  {...register("defaultTimezone")}
                />
                <Select
                  label={t("account.localeLabel")}
                  options={[
                    { value: "id-ID", label: "Bahasa Indonesia" },
                    { value: "en-US", label: "English (US)" },
                  ]}
                  {...register("locale")}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" isLoading={isSubmitting}>
                  {t("account.saveButton")}
                </Button>
              </div>
            </form>
          </Card>

          <Card variant="sage" className="h-fit space-y-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="font-heading text-[16px] font-semibold">
                {t("account.securityTitle")}
              </h3>
            </div>
            <p className="text-[13.5px] leading-relaxed opacity-90">
              {t("account.securityBody")}
            </p>
          </Card>
        </div>
      </Section>
    </Container>
  );
}
