import { ArrowUpRight, LibraryBig, Search, Users, Wallet } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Avatar, EmptyState } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Select } from "@/components/ui/Field";
import { useAuthors } from "@/hooks/queries";
import { formatCurrency, formatDate, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "open" | "royalty" | "name";

export function AdminAuthorsPage() {
  const { data, isLoading, isError } = useAuthors();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("open");
  const deferred = useDeferredValue(search);

  const authors = useMemo(() => {
    const filtered = (data ?? []).filter((author) => {
      const needle = deferred.trim().toLowerCase();
      if (!needle) return true;
      return (
        author.name.toLowerCase().includes(needle) ||
        author.email.toLowerCase().includes(needle) ||
        (author.city ?? "").toLowerCase().includes(needle)
      );
    });
    return [...filtered].sort((a, b) => {
      if (sort === "open") return b.open_tickets - a.open_tickets || a.name.localeCompare(b.name);
      if (sort === "royalty") return b.pending_royalty - a.pending_royalty;
      return a.name.localeCompare(b.name);
    });
  }, [data, deferred, sort]);

  const totals = (data ?? []).reduce(
    (acc, author) => ({
      books: acc.books + author.book_count,
      published: acc.published + author.published_count,
      pending: acc.pending + author.pending_royalty,
      open: acc.open + author.open_tickets,
    }),
    { books: 0, published: 0, pending: 0, open: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="Authors"
        description="Portfolio health, royalty exposure and live support load across the BookLeaf catalogue."
        actions={
          <Link
            to="/admin"
            className="focus-ring inline-flex items-center gap-1 rounded-lg text-[11px] font-semibold text-forest-700 hover:text-forest-900"
          >
            Support queue <ArrowUpRight size={12} />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Authors",
            value: String(data?.length ?? "—"),
            caption: `${totals.published} published · ${totals.books - totals.published} in production`,
            icon: <Users size={14} />,
          },
          {
            label: "Titles",
            value: String(totals.books),
            caption: `${totals.published} live on storefronts`,
            icon: <LibraryBig size={14} />,
          },
          {
            label: "Pending royalty",
            value: formatCurrency(totals.pending),
            caption: "Across all author balances",
            icon: <Wallet size={14} />,
            gold: true,
          },
          {
            label: "Open tickets",
            value: String(totals.open),
            caption: "Open or in progress",
            icon: <Users size={14} />,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-stone-200/80 bg-cream p-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-stone-500">
                {stat.label}
              </p>
              <span className={stat.gold ? "text-gold-600" : "text-stone-400"}>{stat.icon}</span>
            </div>
            <p
              className={cn(
                "mt-2.5 font-display text-2xl font-semibold",
                stat.gold ? "text-gold-800" : "text-ink",
              )}
            >
              {stat.value}
            </p>
            <p className="mt-1 text-[10px] text-stone-400">{stat.caption}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200/80 bg-cream shadow-card">
        <div className="flex flex-col gap-2 border-b border-stone-100 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email or city"
              className="h-9 pl-9 text-xs"
              aria-label="Search authors"
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-[10px] text-stone-400">Sort</span>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-9 !w-auto !py-0 text-xs"
              aria-label="Sort authors"
            >
              <option value="open">Open tickets</option>
              <option value="royalty">Pending royalty</option>
              <option value="name">Name</option>
            </Select>
          </div>
        </div>

        {isError ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            The author directory could not be loaded. Please refresh the page.
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : authors.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/60 text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400">
                    <th className="px-4 py-2.5">Author</th>
                    <th className="px-3 py-2.5">Portfolio</th>
                    <th className="px-3 py-2.5">Pending royalty</th>
                    <th className="px-3 py-2.5">Open tickets</th>
                    <th className="px-3 py-2.5">Joined</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {authors.map((author) => (
                    <tr key={author.id} className="group transition hover:bg-white">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={author.name} seed={author.id} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-ink">{author.name}</p>
                            <p className="truncate text-[10px] text-stone-400">{author.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[11px] font-medium text-stone-700">
                          {author.book_count} {pluralize(author.book_count, "title")}
                        </p>
                        <p className="text-[9px] text-stone-400">
                          {author.published_count} published ·{" "}
                          {author.book_count - author.published_count} in production
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "text-[11px] font-semibold",
                            author.pending_royalty > 0 ? "text-gold-800" : "text-stone-400",
                          )}
                        >
                          {formatCurrency(author.pending_royalty)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {author.open_tickets ? (
                          <Badge className="bg-gold-50 text-gold-700 ring-gold-200">
                            {author.open_tickets} open
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-stone-400">Clear</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[10px] text-stone-400">
                        {formatDate(author.joined_date)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          to={`/admin?q=${encodeURIComponent(author.name)}`}
                          className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-forest-700 opacity-0 transition hover:bg-forest-50 group-hover:opacity-100"
                          title={`Search the queue for ${author.name}`}
                        >
                          Tickets <ArrowUpRight size={10} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-stone-100 md:hidden">
              {authors.map((author) => (
                <div key={author.id} className="p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={author.name} seed={author.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink">{author.name}</p>
                      <p className="truncate text-[10px] text-stone-400">{author.email}</p>
                    </div>
                    {author.open_tickets ? (
                      <Badge className="bg-gold-50 text-gold-700 ring-gold-200">
                        {author.open_tickets} open
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-stone-50 px-2.5 py-1.5">
                      <p className="text-[8px] uppercase tracking-wider text-stone-400">Titles</p>
                      <p className="text-[11px] font-semibold text-ink">{author.book_count}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 px-2.5 py-1.5">
                      <p className="text-[8px] uppercase tracking-wider text-stone-400">Pending</p>
                      <p className="text-[11px] font-semibold text-gold-800">
                        {formatCurrency(author.pending_royalty)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<Search size={20} />}
              title="No authors match"
              description="Try a different name, email or city."
              className="border-0 bg-transparent"
            />
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-1 text-[10px] text-stone-400">
        <Users size={11} /> Royalty totals aggregate the seeded catalogue. Open-ticket counts move
        as the queue is triaged.
      </p>
    </div>
  );
}
