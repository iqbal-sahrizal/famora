import { HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: { box: "h-9 w-9 rounded-xl", icon: "h-4 w-4", text: "text-[17px]" },
  md: { box: "h-10 w-10 rounded-xl", icon: "h-5 w-5", text: "text-[19px]" },
  lg: { box: "h-16 w-16 rounded-[20px]", icon: "h-8 w-8", text: "text-[24px]" },
} as const;

/**
 * Single source of truth for the Senvamily brand mark across web, auth, and splash UI.
 */
export function SenvamilyLogo({
  size = "md",
  showWordmark = true,
  className,
}: {
  size?: keyof typeof SIZE_CLASSES;
  showWordmark?: boolean;
  className?: string;
}) {
  const s = SIZE_CLASSES[size];
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] shadow-[var(--shadow-soft)]",
          s.box
        )}
      >
        <HeartHandshake className={s.icon} strokeWidth={1.85} aria-hidden="true" />
      </div>
      {showWordmark && (
        <span
          className={cn(
            "font-heading font-bold tracking-tight text-[var(--text-primary)]",
            s.text
          )}
        >
          Senvamily
        </span>
      )}
    </div>
  );
}
