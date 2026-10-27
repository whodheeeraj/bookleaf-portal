import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageSquare,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/Avatar";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import {
  CategoryBadge,
  PriorityBadge,
  SourceBadge,
  StatusBadge,
} from "@/components/tickets/TicketBadges";
import { useTickets } from "@/hooks/queries";
import { STATUSES } from "@/lib/constants";
import { pluralize, relativeTime } from "@/lib/format";
import type { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = TicketStatus | "all";

export function AuthorTicketsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  const query = useTickets({
    status: status === "all" ? undefined : status,
    q: deferredSearch.trim() || undefined,
    page,
    page_size: 20,
  });

  const tickets = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = query.data?.pages ?? 0;

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...STATUSES.map((item) => ({ key: item as StatusFilter, label: item })),
  ];

  function changeStatus(next: StatusFilter) {
    setStatus(next);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Your requests"
        description="Every conversation with the BookLeaf support desk, with its current status and triage."
        actions={
          <Link to="/app/tickets/new" className={buttonStyles({})}>
            <Plus size={15} />
            New request
          </Link>
        }
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-cream p-3 shadow-card sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
          <SlidersHorizontal size={14} className="ml-1 hidden shrink-0 text-stone-400 sm:block" />
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => changeStatus(tab.key)}
              className={cn(
                "focus-ring shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
                status === tab.key
                  ? "bg-forest-600 text-cream shadow-sm"
                  : "text-stone-500 hover:bg-stone-100 hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search requests…"
            className="h-9 pl-9 text-xs"
            aria-label="Search your requests"
          />
        </div>
      </div>

      {query.isFetching && !query.isLoading ? (
        <p className="flex items-center justify-end gap-1.5 text-[10px] text-stone-400">
          <Spinner className="h-3 w-3" /> Refreshing
        </p>
      ) : null}

      {query.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          Your requests could not be loaded. Please refresh the page.
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="rounded-2xl border border-stone-200 bg-cream p-5">
              <div className="skeleton h-2.5 w-20 rounded" />
              <div className="skeleton mt-3 h-4 w-2/3 rounded" />
              <div className="skeleton mt-2 h-2.5 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : tickets.length ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-stone-500">
              {total} {pluralize(total, "request")}
              {status !== "all" ? ` · ${status}` : ""}
            </p>
            <p className="text-[10px] text-stone-400">Newest first</p>
          </div>

          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/app/tickets/${ticket.id}`}
                className="focus-ring group block rounded-2xl border border-stone-200/80 bg-cream p-5 shadow-card transition hover:border-stone-300 hover:shadow-lift"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">
                    {ticket.ticket_number}
                  </span>
                  <StatusBadge status={ticket.status} />
                  {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : null}
                  <span className="ml-auto hidden sm:block">
                    <SourceBadge source={ticket.classification_source} />
                  </span>
                </div>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold leading-relaxed text-ink transition group-hover:text-forest-800">
                    {ticket.subject}
                  </h2>
                  <ChevronRight
                    size={16}
                    className="mt-0.5 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-forest-500"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {ticket.category ? <CategoryBadge category={ticket.category} /> : null}
                  {ticket.book ? (
                    <span className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-inset ring-stone-200">
                      {ticket.book.title}
                    </span>
                  ) : (
                    <span className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-stone-500 ring-1 ring-inset ring-stone-200">
                      General inquiry
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-3 text-[10px] text-stone-400">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={10} />
                      {ticket.message_count} {pluralize(ticket.message_count, "message")}
                    </span>
                    <span>updated {relativeTime(ticket.updated_at)}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {pages > 1 ? (
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-cream px-4 py-3">
              <p className="text-[11px] text-stone-500">
                Page {page} of {pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  icon={<ChevronLeft size={13} />}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                  <ChevronRight size={13} />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={search ? <Search size={22} /> : <Inbox size={22} />}
          title={search ? "No matching requests" : "No requests here yet"}
          description={
            search
              ? "Try a different phrase, or clear the search to see every request."
              : status === "all"
                ? "When something needs attention, open a request and the support team will take it from there."
                : `You have no ${status.toLowerCase()} requests right now.`
          }
          action={
            status === "all" && !search ? (
              <Link to="/app/tickets/new" className={buttonStyles({ size: "sm" })}>
                <Sparkles size={13} /> Start a request
              </Link>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  changeStatus("all");
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
