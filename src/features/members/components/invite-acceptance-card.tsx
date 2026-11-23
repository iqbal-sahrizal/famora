"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, HeartHandshake, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { formatLocalizedDate } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useLocale } from "@/providers/locale-provider";
import {
  acceptInvitationByTokenAction,
  rejectInvitationByTokenAction,
} from "../actions";
import type { InvitationPreview } from "../server";

export function InviteAcceptanceCard({
  token,
  preview,
}: {
  token: string;
  preview: InvitationPreview | null;
}) {
  const router = useRouter();
  const { locale, t, te } = useLocale();
  const [busy, setBusy] = React.useState(false);

  if (!preview || preview.status !== "pending" || new Date(preview.expiresAt) <= new Date()) {
    return (
      <Card className="mx-auto max-w-md space-y-4 p-7 text-center">
        <CardTitle>{t("invite.unavailableTitle")}</CardTitle>
        <CardDescription>
          {t("invite.unavailableDesc")}
        </CardDescription>
        <Button variant="secondary" onClick={() => router.push(routes.onboarding)}>
          {t("invite.goToFamora")}
        </Button>
      </Card>
    );
  }

  const handleAccept = async () => {
    setBusy(true);
    const res = await acceptInvitationByTokenAction(token);
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.success(t("invite.joinedToast", { name: preview.familyName }));
    router.push(routes.familyDashboard(preview.familyId));
    router.refresh();
  };

  const handleReject = async () => {
    setBusy(true);
    const res = await rejectInvitationByTokenAction(token);
    setBusy(false);
    if (!res.ok) {
      toast.error(te(res.error));
      return;
    }
    toast.info(t("invite.declinedToast"));
    router.push(routes.onboarding);
  };

  return (
    <Card className="mx-auto max-w-md space-y-6 p-7">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <div>
          <Badge variant="sage">{preview.roleDisplayName}</Badge>
          <CardTitle className="mt-1">
            {t("invite.joinTitle", { name: preview.familyName })}
          </CardTitle>
        </div>
      </div>

      <CardDescription>
        {t("invite.issuedFor", {
          email: preview.invitedEmail,
          date: formatLocalizedDate(preview.expiresAt, locale),
        })}
      </CardDescription>

      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={handleReject}
        >
          <X className="h-4 w-4" />
          {t("invite.decline")}
        </Button>
        <Button className="flex-1" isLoading={busy} onClick={handleAccept}>
          <Check className="h-4 w-4" />
          {t("invite.accept")}
        </Button>
      </div>
    </Card>
  );
}
