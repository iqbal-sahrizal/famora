import * as React from "react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-12 w-12 text-[15px]",
  xl: "h-16 w-16 text-[18px]",
};

const toneMap = {
  sage: "bg-[var(--tint-sage)] text-[var(--tint-sage-fg)]",
  peach: "bg-[var(--tint-peach)] text-[var(--tint-peach-fg)]",
  lavender: "bg-[var(--tint-lavender)] text-[var(--tint-lavender-fg)]",
  blush: "bg-[var(--tint-blush)] text-[var(--tint-blush-fg)]",
  forest: "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]",
};

export interface AvatarProps {
  name: string;
  src?: string;
  size?: keyof typeof sizeMap;
  tone?: keyof typeof toneMap;
  status?: "online" | "away" | "offline";
  className?: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  src,
  size = "md",
  tone = "sage",
  status,
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-heading font-semibold ring-2 ring-[var(--bg-surface)]",
        sizeMap[size],
        toneMap[tone],
        className
      )}
      title={name}
      aria-label={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-surface)]",
            status === "online" && "bg-[#315C49] dark:bg-[#528C72]",
            status === "away" && "bg-[#E9B98B]",
            status === "offline" && "bg-[var(--text-muted)]"
          )}
        />
      )}
    </div>
  );
}

export function AvatarStack({
  members,
  size = "sm",
}: {
  members: Array<{ name: string; tone?: keyof typeof toneMap }>;
  size?: keyof typeof sizeMap;
}) {
  return (
    <div className="flex items-center -space-x-2">
      {members.map((m) => (
        <Avatar key={m.name} name={m.name} tone={m.tone} size={size} />
      ))}
    </div>
  );
}
