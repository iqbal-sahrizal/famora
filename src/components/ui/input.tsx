import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: React.ReactNode;
  trailingElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      hint,
      error,
      leadingIcon,
      trailingElement,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13.5px] font-medium text-[var(--text-primary)]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leadingIcon && (
            <span className="pointer-events-none absolute left-3.5 text-[var(--text-muted)]">
              {leadingIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            className={cn(
              "h-11 w-full rounded-xl bg-[var(--bg-subtle)] px-3.5 text-[16px] sm:text-[14.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors duration-150",
              "border border-transparent focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15",
              error && "border-[var(--status-danger)] focus:border-[var(--status-danger)] focus:ring-[var(--status-danger)]/15",
              leadingIcon && "pl-10",
              trailingElement && "pr-11",
              className
            )}
            {...props}
          />
          {trailingElement && (
            <span className="absolute right-3 text-[var(--text-secondary)]">
              {trailingElement}
            </span>
          )}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-[12px] font-medium text-[var(--status-danger)]">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-[12px] text-[var(--text-secondary)]">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
