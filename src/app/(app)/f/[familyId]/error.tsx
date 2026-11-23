"use client";

import { ErrorState } from "@/components/ui/feedback";
import { useLocale } from "@/providers/locale-provider";

export default function FamilyDashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { t } = useLocale();
  return (
    <ErrorState
      title={t("errors.dashboardLoadFailed")}
      description={error.message || t("errors.dashboardLoadFailedDesc")}
      onRetry={reset}
    />
  );
}
