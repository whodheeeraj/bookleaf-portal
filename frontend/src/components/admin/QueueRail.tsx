import { Inbox, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";

import { Avatar } from "@/components/ui/Avatar";
import { Input, Select } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { PriorityBadge, StatusBadge } from "@/components/tickets/TicketBadges";
import { useTickets } from "@/hooks/queries";
import { STATUSES } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import type { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function QueueRail({ activeId }: { activeId: string }) {
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);

  const query = useTickets({
    status: status || undefined,
    q: deferred.trim() || undefined,
    page_size: 40,
  });
  const tickets = query.data?.items ?? [];

  return (
    <aside className="hidden w-[288px] shrink-0 flex-col border-r border-stone-200 bg-paper 2xl:flex">
      <div className="space-y-2 border-b border-stone-200/80 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">Queue</p>
          <span className="text-[10px] text-stone-400">
            {query.isFetching ? <Spinner className="h-3 w-3" /> : `${query.data?.total ?? 0} in view`}
          </span>
        </div>
        <div className="relative">
          <Search
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a ticket…"
            className="h-8 pl-7 text-[11px]"
            aria-label="Filter queue"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as TicketStatus | "")}
          className="h-8 !py-0 text-[11px]"
          aria-label="Queue status filter"
        >
          <option value="">All statuses</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isLoading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="skeleton h-16 rounded-lg" />
            ))}
          </div>
        ) : tickets.length ? (
          <div className="divide-y divide-stone-100">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/admin/tickets/${ticket.id}`}
                className={cn(
                  "focus-ring block px-3 py-3 transition",
                  ticket.id === activeId
                    ? "border-l-2 border-forest-700 bg-white"
                    : "border-l-2 border-transparent hover:bg-white/70",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
                    {ticket.ticket_number}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge status={ticket.status} />
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-ink">
                  {ticket.subject}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Avatar name={ticket.author.name} seed={ticket.author.id} size="xs" />
                  <span className="truncate text-[9px] text-stone-500">
                    {ticket.author.name.split(" ")[0]}
                  </span>
                  {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : null}
                  <span className="ml-auto whitespace-nowrap text-[9px] text-stone-400">
                    {relativeTime(ticket.updated_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Inbox size={18} className="text-stone-300" />
            <p className="text-[10px] leading-relaxed text-stone-400">
              No tickets match this queue filter.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
