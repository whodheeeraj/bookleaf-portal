import {
  Banknote,
  Barcode,
  BookOpenCheck,
  CircleHelp,
  Factory,
  PackageSearch,
  Sparkles,
  FlaskConical,
  ShieldCheck,
  UserCog,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import {
  PRIORITY_STYLES,
  SOURCE_META,
  STATUS_DOT,
  STATUS_STYLES,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  ClassificationSource,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/lib/types";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge className={STATUS_STYLES[status]} dot={STATUS_DOT[status]}>
      {status}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge className={PRIORITY_STYLES[priority]}>{priority}</Badge>;
}

export const CATEGORY_ICONS: Record<TicketCategory, typeof Banknote> = {
  "Royalty & Payments": Banknote,
  "ISBN & Metadata Issues": Barcode,
  "Printing & Quality": Factory,
  "Distribution & Availability": PackageSearch,
  "Book Status & Production Updates": BookOpenCheck,
  "General Inquiry": CircleHelp,
};

export function CategoryBadge({ category }: { category: TicketCategory }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-inset ring-stone-200">
      <Icon size={12} className="text-stone-400" />
      {category}
    </span>
  );
}

const SOURCE_ICONS: Record<ClassificationSource, typeof Sparkles> = {
  ai: Sparkles,
  rules: FlaskConical,
  admin_override: UserCog,
  manual_fallback: ShieldCheck,
};

export function SourceBadge({
  source,
  className,
  showIcon = true,
}: {
  source: ClassificationSource;
  className?: string;
  showIcon?: boolean;
}) {
  const meta = SOURCE_META[source];
  const Icon = SOURCE_ICONS[source];
  return (
    <Badge className={cn(meta.className, className)}>
      {showIcon ? <Icon size={11} /> : null}
      {meta.label}
    </Badge>
  );
}

export function ProductionBadge({ status }: { status: string }) {
  if (!status.startsWith("In Production")) {
    return (
      <Badge className="bg-forest-50 text-forest-700 ring-forest-200" dot="bg-forest-500">
        Published
      </Badge>
    );
  }
  return (
    <Badge className="bg-sky-50 text-sky-700 ring-sky-200" dot="bg-sky-500">
      {status.replace("In Production - ", "In production · ")}
    </Badge>
  );
}

export function ConfidenceMeter({ value }: { value?: number | null }) {
  if (value === null || value === undefined) return null;
  const percent = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium text-stone-500">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200">
        <span
          className={cn(
            "block h-full rounded-full",
            percent >= 85 ? "bg-forest-500" : percent >= 65 ? "bg-gold-400" : "bg-orange-400",
          )}
          style={{ width: `${Math.min(100, Math.max(4, percent))}%` }}
        />
      </span>
      {percent}% confidence
    </span>
  );
}
