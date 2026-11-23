"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  HeartHandshake,
  ImagePlus,
  MailPlus,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";
import {
  acceptInvitationOnboardingAction,
  completeOnboardingAction,
  createFamilyOnboardingAction,
  sendOnboardingInvitesAction,
} from "../actions";
import type { InviteMemberItem } from "../schemas";
import type { OnboardingFamilyContext } from "../server";

type WizardStep = "choice" | "identity" | "preferences" | "invites" | "join";

const DRAFT_STORAGE_PREFIX = "famora:onboarding-draft:";

export function OnboardingWizard({
  userId,
  userName,
  existingFamilies,
  incompleteFamily,
}: {
  userId: string;
  userName: string;
  existingFamilies: OnboardingFamilyContext[];
  incompleteFamily: OnboardingFamilyContext | null;
}) {
  const router = useRouter();
  const { t, te } = useLocale();
  const [step, setStep] = React.useState<WizardStep>(
    incompleteFamily ? "invites" : "choice"
  );
  const [createdFamilyId, setCreatedFamilyId] = React.useState<string | null>(
    incompleteFamily?.familyId ?? null
  );

  // Step 1: Identity
  const [familyName, setFamilyName] = React.useState(incompleteFamily?.name ?? "");
  const [description, setDescription] = React.useState(
    incompleteFamily?.description ?? ""
  );
  const [avatarDataUrl, setAvatarDataUrl] = React.useState<string | null>(null);

  // Step 2: Preferences
  const [timezone, setTimezone] = React.useState(
    incompleteFamily?.timezone ?? "America/Los_Angeles"
  );
  const [currencyCode, setCurrencyCode] = React.useState(
    incompleteFamily?.currencyCode ?? "USD"
  );
  const [themeMode, setThemeMode] = React.useState<"light" | "dark" | "system">(
    "system"
  );

  // Step 3: Invites
  const [invites, setInvites] = React.useState<InviteMemberItem[]>([
    { email: "", roleKey: "adult" },
  ]);

  // Join with token
  const [inviteToken, setInviteToken] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);

  // Restore interrupted local draft if no server-side incomplete family exists yet
  React.useEffect(() => {
    if (incompleteFamily) return;
    try {
      const raw = window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${userId}`);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        familyName?: string;
        description?: string;
        timezone?: string;
        currencyCode?: string;
        step?: WizardStep;
      };
      if (draft.familyName) setFamilyName(draft.familyName);
      if (draft.description) setDescription(draft.description);
      if (draft.timezone) setTimezone(draft.timezone);
      if (draft.currencyCode) setCurrencyCode(draft.currencyCode);
      if (draft.step === "identity" || draft.step === "preferences") {
        setStep(draft.step);
      }
    } catch {
      // Ignore malformed draft
    }
  }, [incompleteFamily, userId]);

  // Persist local draft during Steps 1-2
  React.useEffect(() => {
    if (createdFamilyId) return;
    try {
      window.localStorage.setItem(
        `${DRAFT_STORAGE_PREFIX}${userId}`,
        JSON.stringify({ familyName, description, timezone, currencyCode, step })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [createdFamilyId, currencyCode, description, familyName, step, timezone, userId]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400_000) {
      toast.error(t("onboarding.photoTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatarDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateFamily = async () => {
    setIsBusy(true);
    const res = await createFamilyOnboardingAction({
      identity: { name: familyName, description, avatarDataUrl },
      preferences: { timezone, currencyCode, themeMode },
    });
    setIsBusy(false);

    if (!res.ok || !res.data) {
      toast.error(te(res.error));
      return;
    }

    window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${userId}`);
    setCreatedFamilyId(res.data.familyId);
    setStep("invites");
    toast.success(t("onboarding.createdToast", { name: familyName }));
  };

  const handleFinishOnboarding = async (sendInvites: boolean) => {
    if (!createdFamilyId) return;
    setIsBusy(true);

    const validInvites = invites.filter((i) => i.email.trim().length > 0);
    if (sendInvites && validInvites.length > 0) {
      const invRes = await sendOnboardingInvitesAction({
        familyId: createdFamilyId,
        invites: validInvites,
      });
      if (!invRes.ok) {
        setIsBusy(false);
        toast.error(te(invRes.error));
        return;
      }
      toast.success(
        t("onboarding.preparedInvitesToast", { count: invRes.data?.sentCount ?? 0 })
      );
    }

    const doneRes = await completeOnboardingAction(createdFamilyId);
    setIsBusy(false);

    if (!doneRes.ok || !doneRes.data) {
      toast.error(te(doneRes.error));
      return;
    }

    router.push(doneRes.data.redirectTo);
    router.refresh();
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    const res = await acceptInvitationOnboardingAction({ token: inviteToken });
    setIsBusy(false);

    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }

    toast.success(t("onboarding.joinedToast"));
    router.refresh();
    setStep("choice");
  };

  const stepIndex =
    step === "identity" ? 1 : step === "preferences" ? 2 : step === "invites" ? 3 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      {/* Progress Bar for Wizard Steps */}
      {stepIndex > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12.5px] font-medium text-[var(--text-secondary)]">
            <span>{t("onboarding.stepOf", { step: stepIndex })}</span>
            <span>
              {stepIndex === 1 && t("onboarding.step1Title")}
              {stepIndex === 2 && t("onboarding.step2Title")}
              {stepIndex === 3 && t("onboarding.step3Title")}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{ width: `${(stepIndex / 3) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Resumed Banner */}
      {incompleteFamily && step === "invites" && (
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--tint-lavender)] px-5 py-3.5 text-[13.5px] text-[var(--tint-lavender-fg)]">
          <span>
            {t("onboarding.resumingBanner", { name: incompleteFamily.name })}
          </span>
        </div>
      )}

      {/* Step 0: Choice */}
      {step === "choice" && (
        <div className="space-y-8">
          <div className="space-y-2">
            <Badge variant="sage">
              <Sparkles className="h-3.5 w-3.5" />
              {t("onboarding.welcomeBadge", { name: userName })}
            </Badge>
            <h1 className="font-heading text-[30px] font-bold tracking-tight">
              {t("onboarding.heroTitle")}
            </h1>
            <p className="text-[15px] text-[var(--text-secondary)]">
              {t("onboarding.heroDesc")}
            </p>
          </div>

          {existingFamilies.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-heading text-[16px] font-semibold">
                {t("onboarding.existingSpaces")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {existingFamilies.map((fam) => (
                  <Link key={fam.familyId} href={routes.familyDashboard(fam.familyId)}>
                    <Card className="hover:border-[var(--accent-primary)] cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-heading text-[16px] font-semibold">
                            {fam.name}
                          </p>
                          <p className="text-[12.5px] text-[var(--text-secondary)]">
                            {t("onboarding.rolePrefix", { role: fam.roleKey })}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-[var(--accent-primary)]" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Card variant="sage" className="flex flex-col justify-between gap-6">
              <div className="space-y-2">
                <HeartHandshake className="h-6 w-6" />
                <CardTitle>{t("onboarding.createCardTitle")}</CardTitle>
                <CardDescription className="text-[var(--tint-sage-fg)]">
                  {t("onboarding.createCardDesc")}
                </CardDescription>
              </div>
              <Button onClick={() => setStep("identity")}>
                {t("onboarding.startSetup")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>

            <Card className="flex flex-col justify-between gap-6">
              <div className="space-y-2">
                <Users className="h-6 w-6 text-[var(--accent-primary)]" />
                <CardTitle>{t("onboarding.joinCardTitle")}</CardTitle>
                <CardDescription>
                  {t("onboarding.joinCardDesc")}
                </CardDescription>
              </div>
              <Button variant="secondary" onClick={() => setStep("join")}>
                {t("onboarding.enterToken")}
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* Step 1: Family Identity */}
      {step === "identity" && (
        <Card className="space-y-6 p-7">
          <div>
            <h2 className="font-heading text-[22px] font-semibold">
              {t("onboarding.identityHeading")}
            </h2>
            <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
              {t("onboarding.identitySub")}
            </p>
          </div>

          <div className="space-y-4">
            <Input
              label={t("onboarding.familyNameLabel")}
              placeholder={t("onboarding.familyNamePlaceholder")}
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="family-desc"
                className="text-[13.5px] font-medium text-[var(--text-primary)]"
              >
                {t("onboarding.descLabel")}
              </label>
              <textarea
                id="family-desc"
                rows={3}
                placeholder={t("onboarding.descPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl bg-[var(--bg-subtle)] p-3.5 text-[14.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--bg-subtle)] px-4 py-2.5 text-[13.5px] font-medium hover:bg-[var(--bg-hover)]">
                <ImagePlus className="h-4 w-4" />
                <span>
                  {avatarDataUrl
                    ? t("onboarding.changePhoto")
                    : t("onboarding.uploadPhoto")}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoUpload}
                  className="sr-only"
                />
              </label>
              {avatarDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarDataUrl}
                  alt={t("onboarding.photoPreviewAlt")}
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-[var(--accent-primary)]"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("choice")}>
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
            <Button
              disabled={familyName.trim().length < 2}
              onClick={() => setStep("preferences")}
            >
              {t("common.continue")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Preferences */}
      {step === "preferences" && (
        <Card className="space-y-6 p-7">
          <div>
            <h2 className="font-heading text-[22px] font-semibold">
              {t("onboarding.prefsHeading")}
            </h2>
            <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
              {t("onboarding.prefsSub")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("onboarding.timezoneLabel")}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={[
                { value: "America/Los_Angeles", label: "Pacific Time (US)" },
                { value: "America/New_York", label: "Eastern Time (US)" },
                { value: "Asia/Jakarta", label: "WIB (Asia/Jakarta)" },
                { value: "Europe/London", label: "London (GMT/BST)" },
                { value: "UTC", label: "UTC" },
              ]}
            />
            <Select
              label={t("onboarding.currencyLabel")}
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              options={[
                { value: "USD", label: "USD ($)" },
                { value: "IDR", label: "IDR (Rp)" },
                { value: "EUR", label: "EUR (€)" },
                { value: "GBP", label: "GBP (£)" },
                { value: "SGD", label: "SGD (S$)" },
              ]}
            />
            <div className="sm:col-span-2">
              <Select
                label={t("onboarding.appearanceLabel")}
                value={themeMode}
                onChange={(e) =>
                  setThemeMode(e.target.value as "light" | "dark" | "system")
                }
                options={[
                  { value: "system", label: t("onboarding.themeSystem") },
                  { value: "light", label: t("onboarding.themeLight") },
                  { value: "dark", label: t("onboarding.themeDark") },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep("identity")}>
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Button>
            <Button isLoading={isBusy} onClick={handleCreateFamily}>
              {t("onboarding.createFamilyBtn", {
                name: familyName.trim() || t("onboarding.defaultFamilyWord"),
              })}
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Invite Members */}
      {step === "invites" && (
        <Card className="space-y-6 p-7">
          <div>
            <h2 className="font-heading text-[22px] font-semibold">
              {t("onboarding.invitesHeading")}
            </h2>
            <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
              {t("onboarding.invitesSub")}
            </p>
          </div>

          <div className="space-y-3">
            {invites.map((invite, idx) => (
              <div
                key={idx}
                className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end"
              >
                <Input
                  label={idx === 0 ? t("onboarding.emailLabel") : undefined}
                  type="email"
                  placeholder={t("onboarding.emailPlaceholder")}
                  value={invite.email}
                  onChange={(e) => {
                    const next = [...invites];
                    next[idx] = { ...invite, email: e.target.value };
                    setInvites(next);
                  }}
                />
                <Select
                  label={idx === 0 ? t("onboarding.roleLabel") : undefined}
                  value={invite.roleKey}
                  onChange={(e) => {
                    const next = [...invites];
                    next[idx] = {
                      ...invite,
                      roleKey: e.target.value as InviteMemberItem["roleKey"],
                    };
                    setInvites(next);
                  }}
                  options={[
                    { value: "admin", label: t("onboarding.role.admin") },
                    { value: "adult", label: t("onboarding.role.adult") },
                    { value: "teen", label: t("onboarding.role.teen") },
                    { value: "child", label: t("onboarding.role.child") },
                    { value: "extended", label: t("onboarding.role.extended") },
                    { value: "caregiver", label: t("onboarding.role.caregiver") },
                  ]}
                />
                {invites.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("onboarding.removeInviteAria")}
                    onClick={() =>
                      setInvites(invites.filter((_, i) => i !== idx))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}

            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setInvites([...invites, { email: "", roleKey: "adult" }])
              }
            >
              <Plus className="h-4 w-4" />
              {t("onboarding.addAnother")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              variant="ghost"
              disabled={isBusy}
              onClick={() => handleFinishOnboarding(false)}
            >
              {t("onboarding.skipNow")}
            </Button>
            <Button
              isLoading={isBusy}
              onClick={() => handleFinishOnboarding(true)}
            >
              <MailPlus className="h-4 w-4" />
              {t("onboarding.sendAndOpen")}
            </Button>
          </div>
        </Card>
      )}

      {/* Join Existing Family */}
      {step === "join" && (
        <Card className="space-y-6 p-7">
          <div>
            <h2 className="font-heading text-[22px] font-semibold">
              {t("onboarding.joinHeading")}
            </h2>
            <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
              {t("onboarding.joinSub")}
            </p>
          </div>

          <form onSubmit={handleAcceptInvite} className="space-y-4">
            <Input
              label={t("onboarding.tokenLabel")}
              placeholder={t("onboarding.tokenPlaceholder")}
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("choice")}
              >
                <ArrowLeft className="h-4 w-4" />
                {t("common.back")}
              </Button>
              <Button type="submit" isLoading={isBusy}>
                {t("onboarding.joinBtn")}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
