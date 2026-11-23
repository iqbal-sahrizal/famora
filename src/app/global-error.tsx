"use client";

import * as React from "react";
import { DEFAULT_LOCALE, normalizeLocale, translate, translateError } from "@/lib/i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale =
    typeof document !== "undefined"
      ? normalizeLocale(document.documentElement.lang)
      : DEFAULT_LOCALE;

  return (
    <html lang={locale}>
      <body className="flex min-h-screen items-center justify-center bg-[#F7F5EF] p-6 text-[#282C29]">
        <div className="max-w-md rounded-3xl bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold">
            {translate(locale, "error.globalTitle")}
          </h2>
          <p className="mt-2 text-sm text-[#5E645F]">
            {translateError(locale, error.message, "error.unexpected")}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 rounded-xl bg-[#315C49] px-4 py-2.5 text-sm font-medium text-[#F7F5EF] cursor-pointer"
          >
            {translate(locale, "error.reloadApp")}
          </button>
        </div>
      </body>
    </html>
  );
}
