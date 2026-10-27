import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Small accessible tooltip. Uses CSS group hover/focus so it also works on
 * keyboard focus without shipping a positioning library.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex", className)} tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 w-56 -translate-x-1/2 rounded-lg bg-forest-950 px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-cream opacity-0 shadow-lift transition group-hover/tt:opacity-100 group-focus/tt:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {content}
      </span>
    </span>
  );
}

export function InfoHint({ children }: { children: ReactNode }) {
  return (
    <Tooltip content={children}>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-stone-400 transition hover:text-forest-600">
        <Info size={13} />
      </span>
    </Tooltip>
  );
}
