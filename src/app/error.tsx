"use client";

import * as React from "react";
import { ErrorState } from "@/components/ui/feedback";
import { normalizeError } from "@/lib/errors";
import { useLocale } from "@/providers/locale-provider";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, te } = useLocale();
  const normalized = normalizeError(error);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6">
      <ErrorState
        title={t("error.appTitle")}
        description={te(normalized.message, "error.unexpected")}
        onRetry={reset}
      />
    </div>
  );
}
