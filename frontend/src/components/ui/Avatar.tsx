import type { ReactNode } from "react";

import { avatarTone, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

export function Avatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide ring-1 ring-inset ring-black/5",
        avatarTone(seed ?? name),
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people }: { people: { name: string; id?: string }[] }) {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, 4).map((person) => (
        <span key={person.id ?? person.name} className="rounded-full ring-2 ring-cream">
          <Avatar name={person.name} seed={person.id} size="sm" />
        </span>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-cream/60 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-stone-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
