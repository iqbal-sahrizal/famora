"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";

export const PasswordField = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, "type" | "trailingElement">
>((props, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <Input
      ref={ref}
      type={visible ? "text" : "password"}
      trailingElement={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] cursor-pointer"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
      {...props}
    />
  );
});
PasswordField.displayName = "PasswordField";
