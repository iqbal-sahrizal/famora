"use client";

import * as React from "react";
import { Toaster } from "sonner";
import type { Locale } from "@/lib/i18n";
import { LocaleProvider } from "./locale-provider";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

/**
 * Composes all client-side application providers at the root layout boundary.
 */
export function AppProviders({
  initialLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <LocaleProvider initialLocale={initialLocale}>
        <QueryProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                boxShadow: "var(--shadow-float)",
              },
            }}
          />
        </QueryProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
