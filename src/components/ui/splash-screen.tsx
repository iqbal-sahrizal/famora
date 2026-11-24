"use client";

import Link from "next/link";
import { FamoraLogo } from "./brand-logo";
import { Button } from "./button";
import { routes } from "@/lib/routes";

/**
 * Branded Famora splash / bootstrap screen shown while session or workspace data loads.
 */
export function FamoraSplashScreen({
  label = "Famora",
  error,
  onRetry,
}: {
  label?: string;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 py-12 text-center text-[var(--text-primary)]"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="motion-safe:transition-transform motion-safe:duration-300">
          <FamoraLogo size="lg" showWordmark={false} />
        </div>
        <div className="space-y-1.5">
          <p className="font-heading text-[22px] font-bold tracking-tight text-[var(--text-primary)]">
            {label}
          </p>
          {!error && (
            <div className="mx-auto mt-2 h-1 w-16 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div className="h-full w-1/2 rounded-full bg-[var(--accent-primary)] motion-safe:animate-pulse" />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-2 max-w-xs space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-[13.5px] shadow-[var(--shadow-soft)]">
            <p className="text-[var(--status-danger-fg)]">{error}</p>
            <div className="flex flex-col gap-2">
              {onRetry && (
                <Button size="sm" onClick={onRetry}>
                  Retry
                </Button>
              )}
              <Link href={routes.login} className="block">
                <Button size="sm" variant="secondary" className="w-full">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
