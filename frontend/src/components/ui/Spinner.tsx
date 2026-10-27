import { Loader2 } from "lucide-react";

import { BrandMark } from "@/components/ui/BrandMark";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />;
}

export function FullPageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
      <BrandMark className="h-12 w-12 shadow-lift" />
      <div className="flex items-center gap-2 text-sm font-medium text-stone-500">
        <Spinner />
        {label}…
      </div>
    </div>
  );
}

export function InlineLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
      <Spinner />
      {label}…
    </div>
  );
}
