import { Loader2, Sprout } from "lucide-react";

import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />;
}

export function FullPageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-900 text-gold-300 shadow-lift">
        <Sprout className="h-6 w-6" />
      </div>
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
