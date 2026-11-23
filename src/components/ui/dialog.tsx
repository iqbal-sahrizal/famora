"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";

function useDialogAccessibility(
  open: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLDivElement | null>
) {
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        panel.focus();
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      prevFocused?.focus?.();
    };
  }, [open, panelRef]);
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useLocale();
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  useDialogAccessibility(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="fixed inset-0 bg-[#161917]/40 backdrop-blur-[3px] transition-opacity"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-float)] focus:outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id={titleId}
              className="font-heading text-[18px] font-semibold text-[var(--text-primary)]"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeDialog")}
            className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2.5">{footer}</div>}
      </div>
    </div>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  useDialogAccessibility(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="fixed inset-0 bg-[#161917]/40 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] sm:rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-float)] focus:outline-none"
        )}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--border-strong)] sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2
            id={titleId}
            className="font-heading text-[18px] font-semibold text-[var(--text-primary)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeSheet")}
            className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
