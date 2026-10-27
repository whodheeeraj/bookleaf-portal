import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dot)} /> : null}
      {children}
    </span>
  );
}
