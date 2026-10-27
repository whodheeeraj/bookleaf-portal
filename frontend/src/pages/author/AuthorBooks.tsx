import { BookOpen, LibraryBig, PackageOpen, Wallet } from "lucide-react";
import { useState } from "react";

import { BookCard } from "@/components/books/BookCard";
import { EmptyState } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { useBooks } from "@/hooks/queries";
import { formatCurrency, formatNumber, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "published" | "in-production";

export function AuthorBooks() {
  const { data, isLoading, isError } = useBooks();
  const [filter, setFilter] = useState<Filter>("all");

  const books = data ?? [];
  const published = books.filter((book) => !book.is_in_production);
  const inProduction = books.filter((book) => book.is_in_production);
  const visible =
    filter === "published" ? published : filter === "in-production" ? inProduction : books;
  const pending = books.reduce((sum, book) => sum + (book.royalty_pending || 0), 0);
  const paid = books.reduce((sum, book) => sum + (book.royalty_paid || 0), 0);
  const sold = books.reduce((sum, book) => sum + (book.total_copies_sold || 0), 0);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All titles", count: books.length },
    { key: "published", label: "Published", count: published.length },
    { key: "in-production", label: "In production", count: inProduction.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="My books"
        description="Commercial details, production progress and royalty balances for every title on your account."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Pending royalty",
            value: formatCurrency(pending),
            caption: "Across published titles",
            icon: <Wallet size={15} />,
            tone: "text-gold-700",
          },
          {
            label: "Paid to date",
            value: formatCurrency(paid),
            caption: "Lifetime payouts",
            icon: <BookOpen size={15} />,
            tone: "text-forest-700",
          },
          {
            label: "Copies sold",
            value: formatNumber(sold),
            caption: `${published.length} ${pluralize(published.length, "published title")}`,
            icon: <LibraryBig size={15} />,
            tone: "text-sky-700",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-stone-200/80 bg-cream p-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                {stat.label}
              </p>
              <span className={stat.tone}>{stat.icon}</span>
            </div>
            <p className="mt-2.5 font-display text-2xl font-semibold text-ink">{stat.value}</p>
            <p className="mt-1 text-[10px] text-stone-400">{stat.caption}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition",
              filter === item.key
                ? "bg-forest-900 text-cream shadow-sm"
                : "bg-white text-stone-600 ring-1 ring-inset ring-stone-200 hover:bg-stone-50",
            )}
          >
            {item.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] tabular-nums",
                filter === item.key ? "bg-cream/15 text-cream" : "bg-stone-100 text-stone-500",
              )}
            >
              {item.count}
            </span>
          </button>
        ))}
        <p className="ml-auto text-[10px] text-stone-400">
          In-production books show stages instead of commercial figures.
        </p>
      </div>

      {isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          Your catalogue could not be loaded. Please refresh the page.
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="rounded-2xl border border-stone-200 bg-cream p-5">
              <div className="flex gap-4">
                <div className="skeleton h-28 w-20 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-2/3 rounded" />
                  <div className="skeleton h-2.5 w-1/3 rounded" />
                  <div className="skeleton h-2.5 w-1/2 rounded" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((cell) => (
                  <div key={cell} className="skeleton h-12 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : visible.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<PackageOpen size={22} />}
          title={filter === "in-production" ? "No books in production" : "No titles here yet"}
          description={
            filter === "in-production"
              ? "When a manuscript enters production, you will see its stage and next step here."
              : "Books linked to your author account will appear here with their royalty details."
          }
        />
      )}
    </div>
  );
}
