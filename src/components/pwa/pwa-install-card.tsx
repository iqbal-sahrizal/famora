"use client";

import * as React from "react";
import { Download, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePwaSync } from "@/hooks/use-pwa-sync";
import { useLocale } from "@/providers/locale-provider";

export function PwaInstallCard({ familyId }: { familyId: string }) {
  const { t } = useLocale();
  const { isInstalled, canInstall, promptInstall } = usePwaSync(familyId);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isInstalled) return null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-heading text-[15px] font-bold text-[var(--text-primary)]">
            {t("pwa.manualInstallTitle")}
          </p>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {t("pwa.manualInstallDesc")}
          </p>
        </div>
      </div>

      {canInstall ? (
        <Button
          type="button"
          className="w-full"
          onClick={async () => {
            const outcome = await promptInstall();
            if (outcome === "accepted") toast.success(t("pwa.installAccepted"));
            else if (outcome === "dismissed") toast.info(t("pwa.installDismissed"));
          }}
        >
          <Download className="h-4 w-4" />
          {t("pwa.installApp")}
        </Button>
      ) : (
        <ul className="space-y-1.5 rounded-xl bg-[var(--bg-subtle)] p-3 text-[12.5px] text-[var(--text-secondary)]">
          <li>• {t("pwa.manualInstallIos")}</li>
          <li>• {t("pwa.manualInstallAndroid")}</li>
        </ul>
      )}
    </Card>
  );
}
