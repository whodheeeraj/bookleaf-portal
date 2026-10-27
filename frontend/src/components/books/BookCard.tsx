import { BookOpen, ChevronRight, Info, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { InfoHint, Tooltip } from "@/components/ui/Tooltip";
import { ProductionBadge } from "@/components/tickets/TicketBadges";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { ROLLOVER_THRESHOLD_INR } from "@/lib/constants";
import type { Book } from "@/lib/types";
import { cn } from "@/lib/utils";

const COVER_TONES = [
  "from-forest-900 via-forest-800 to-forest-500",
  "from-stone-900 via-stone-800 to-stone-600",
  "from-slate-900 via-slate-700 to-teal-700",
  "from-rose-900 via-rose-800 to-orange-600",
  "from-indigo-950 via-indigo-800 to-sky-600",
  "from-stone-900 via-stone-700 to-amber-600",
];

function toneFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 997;
  }
  return COVER_TONES[hash % COVER_TONES.length];
}

export function BookCover({
  book,
  size = "md",
  className,
}: {
  book: Pick<Book, "id" | "title">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "sm"
      ? "h-16 w-11 text-[7px]"
      : size === "lg"
        ? "h-44 w-30 text-[11px]"
        : "h-28 w-20 text-[9px]";
  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col justify-between overflow-hidden rounded-r-md rounded-l-sm bg-gradient-to-br p-2 text-cream shadow-[0_10px_24px_-12px_rgba(11,33,26,0.7)] ring-1 ring-black/10",
        toneFor(book.id),
        sizeClass,
        className,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-black/20" />
      <BookOpen size={10} className="text-cream/50" />
      <p className="font-display font-semibold leading-tight drop-shadow-sm">{book.title}</p>
    </div>
  );
}

export function RoyaltyRollover({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Badge className="bg-gold-50 text-gold-700 ring-gold-200">Rollover</Badge>
      <InfoHint>
        {formatCurrency(amount)} is below the {formatCurrency(ROLLOVER_THRESHOLD_INR)} payout floor,
        so it rolls over and is released with the next qualifying payout cycle.
      </InfoHint>
    </span>
  );
}

export function ProductionProgress({ book }: { book: Book }) {
  const stage = book.production_stage ?? "In production";
  const current = book.production_stage_number ?? 1;
  const total = book.production_stage_count || 9;
  const percent = Math.round((current / total) * 100);
  return (
    <div className="mt-4 rounded-xl bg-sky-50/70 p-3 ring-1 ring-inset ring-sky-100">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-800">
          <Sparkles size={11} />
          Stage {current} of {total}
        </span>
        <span className="text-[10px] font-medium text-sky-700">{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-forest-500"
          style={{ width: `${Math.max(6, percent)}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-3 text-[11px]">
        <div>
          <p className="font-semibold text-sky-900">{stage}</p>
          {book.next_production_stage ? (
            <p className="mt-0.5 text-sky-700/80">Next: {book.next_production_stage}</p>
          ) : null}
        </div>
        <Link
          to={`/app/tickets/new?book=${book.id}`}
          className="focus-ring shrink-0 rounded-md text-[10px] font-semibold text-forest-700 hover:text-forest-900"
        >
          Ask about this →
        </Link>
      </div>
    </div>
  );
}

export function BookCard({ book }: { book: Book }) {
  const inProduction = book.is_in_production;
  return (
    <div className="group rounded-2xl border border-stone-200/80 bg-cream p-5 shadow-card transition hover:border-stone-300 hover:shadow-lift">
      <div className="flex gap-4">
        <BookCover book={book} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg font-semibold leading-tight text-ink">
                {book.title}
              </h3>
              <p className="mt-1 truncate text-[11px] text-stone-500">
                {book.genre ?? "Genre not set"}
              </p>
            </div>
            <ProductionBadge status={book.status} />
          </div>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-400">
            ISBN {book.isbn}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
            <span>{book.has_published ? formatDate(book.publication_date) : "Publication TBC"}</span>
            {book.print_partner ? <span>{book.print_partner}</span> : null}
            {!inProduction ? <span>{formatNumber(book.total_copies_sold)} copies sold</span> : null}
          </div>
        </div>
      </div>

      {inProduction ? (
        <ProductionProgress book={book} />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-inset ring-stone-100">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-400">MRP</p>
              <p className="mt-0.5 text-xs font-semibold text-ink">{formatCurrency(book.mrp)}</p>
            </div>
            <div className="rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-inset ring-stone-100">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-400">
                Per copy
              </p>
              <p className="mt-0.5 text-xs font-semibold text-ink">
                {formatCurrency(book.author_royalty_per_copy)}
              </p>
            </div>
            <div className="rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-inset ring-stone-100">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-400">
                Earned
              </p>
              <p className="mt-0.5 text-xs font-semibold text-ink">
                {formatCurrency(book.total_royalty_earned)}
              </p>
            </div>
            <div
              className={cn(
                "rounded-lg px-2.5 py-2 ring-1 ring-inset",
                book.royalty_pending > 0
                  ? "bg-gold-50/80 ring-gold-200/70"
                  : "bg-forest-50/70 ring-forest-100",
              )}
            >
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                Pending
                {book.is_royalty_rollover ? (
                  <Tooltip
                    content={`Below ${formatCurrency(ROLLOVER_THRESHOLD_INR)} — rolls over to the next payout cycle.`}
                  >
                    <Info size={10} className="text-gold-600" />
                  </Tooltip>
                ) : null}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs font-semibold",
                  book.royalty_pending > 0 ? "text-gold-800" : "text-forest-700",
                )}
              >
                {formatCurrency(book.royalty_pending)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {book.available_on.length ? (
                book.available_on.map((platform) => (
                  <span
                    key={platform}
                    className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500"
                  >
                    {platform}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-stone-400">Sales channels pending</span>
              )}
            </div>
            <span className="text-[10px] text-stone-400">
              Last payout {formatDate(book.last_royalty_payout_date)}
            </span>
          </div>
          {book.is_royalty_rollover ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold-200/70 bg-gold-50/60 px-3 py-2">
              <Info size={12} className="mt-0.5 shrink-0 text-gold-600" />
              <p className="text-[10px] leading-relaxed text-gold-800">
                {formatCurrency(book.royalty_pending)} is under the{" "}
                {formatCurrency(ROLLOVER_THRESHOLD_INR)} payout floor and will roll into the next
                payout cycle.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function BookMini({ book, href }: { book: Book; href?: string }) {
  const inner = (
    <div className="group flex items-center gap-3 rounded-xl border border-stone-200/70 bg-white/70 p-3 transition hover:border-stone-300 hover:bg-white">
      <BookCover book={book} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-ink">{book.title}</p>
        <p className="mt-0.5 truncate text-[10px] text-stone-500">{book.status}</p>
        <p className="mt-1 text-[10px] text-stone-400">
          {book.is_in_production
            ? `${book.production_stage ?? "In production"} · stage ${book.production_stage_number ?? "—"}`
            : `${formatCurrency(book.royalty_pending)} pending`}
        </p>
      </div>
      {href ? (
        <ChevronRight size={14} className="text-stone-300 transition group-hover:text-stone-500" />
      ) : null}
    </div>
  );
  if (!href) return inner;
  return (
    <Link to={href} className="focus-ring block rounded-xl">
      {inner}
    </Link>
  );
}
