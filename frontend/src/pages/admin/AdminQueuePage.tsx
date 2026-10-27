import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Inbox,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Avatar, EmptyState } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import {
  CategoryBadge,
  PriorityBadge,
  SourceBadge,
  StatusBadge,
} from "@/components/tickets/TicketBadges";
import { useAdminStats, useAiHealth, useTickets } from "@/hooks/queries";
import { CATEGORIES, PRIORITIES, STATUSES } from "@/lib/constants";
import { formatCurrency, pluralize, relativeTime } from "@/lib/format";
import type { TicketCategory, TicketFilters, TicketPriority, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AdminQueuePage() {
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const deferredSearch = useDeferredValue(searchInput);
  const statsQuery = useAdminStats();
  const aiHealth = useAiHealth();

  const status = (params.get("status") as TicketStatus | null) ?? "";
  const category = (params.get("category") as TicketCategory | null) ?? "";
  const priority = (params.get("priority") as TicketPriority | null) ?? "";
  const unassigned = params.get("unassigned") === "1";
  const mine = params.get("mine") === "1";
  const dateFrom = params.get("from") ?? "";
  const dateTo = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const filters: TicketFilters = useMemo(
    () => ({
      status: status || undefined,
      category: category || undefined,
      priority: priority || undefined,
      unassigned,
      mine,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      q: deferredSearch.trim() || undefined,
      page,
      page_size: 15,
    }),
    [status, category, priority, unassigned, mine, dateFrom, dateTo, deferredSearch, page],
  );

  const ticketsQuery = useTickets(filters);
  const stats = statsQuery.data;
  const tickets = ticketsQuery.data?.items ?? [];
  const total = ticketsQuery.data?.total ?? 0;
  const pages = ticketsQuery.data?.pages ?? 0;

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  }

  function resetFilters() {
    setSearchInput("");
    setParams(new URLSearchParams());
  }

  const activeFilters = [
    status ? { key: "status", label: status } : null,
    category ? { key: "category", label: category } : null,
    priority ? { key: "priority", label: priority } : null,
    unassigned ? { key: "unassigned", label: "Unassigned" } : null,
    mine ? { key: "mine", label: "Assigned to me" } : null,
    dateFrom ? { key: "from", label: `From ${dateFrom}` } : null,
    dateTo ? { key: "to", label: `To ${dateTo}` } : null,
    deferredSearch.trim() ? { key: "q", label: `“${deferredSearch.trim()}”` } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  const unresolved = stats ? stats.open + stats.in_progress : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title={
          <span className="flex flex-wrap items-center gap-2">
            Support queue
            {stats ? (
              <span className="rounded-full bg-forest-600 px-2.5 py-1 text-[11px] font-semibold text-cream">
                {unresolved} unresolved
              </span>
            ) : null}
          </span>
        }
        description={
          stats
            ? `${stats.unassigned} unassigned · ${stats.critical} critical · ${formatCurrency(stats.pending_royalty_total)} in pending royalties across authors.`
            : "Triage, assign and answer every author request with full context."
        }
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-500 ring-1 ring-inset ring-stone-200">
              <Sparkles size={11} className="text-forest-600" />
              {aiHealth.data?.mode === "llm" ? aiHealth.data.model : "Rules engine"}
            </span>
            <Link to="/admin/authors" className={buttonStyles({ variant: "secondary" })}>
              <Users size={15} />
              Authors
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Total"
          value={stats?.total}
          caption="All time"
          icon={<Inbox size={13} />}
          active={!status && !priority && !unassigned && !mine && !category}
          onClick={resetFilters}
        />
        <StatTile
          label="Open"
          value={stats?.open}
          caption="Awaiting first reply"
          icon={<CircleDot size={13} />}
          tone="gold"
          active={status === "Open"}
          onClick={() => patchParams({ status: "Open" })}
        />
        <StatTile
          label="In progress"
          value={stats?.in_progress}
          caption="Being worked"
          icon={<MessageSquare size={13} />}
          tone="sky"
          active={status === "In Progress"}
          onClick={() => patchParams({ status: "In Progress" })}
        />
        <StatTile
          label="Critical"
          value={stats?.critical}
          caption="Escalate first"
          icon={<AlertTriangle size={13} />}
          tone="rose"
          active={priority === "Critical"}
          onClick={() => patchParams({ priority: "Critical" })}
        />
        <StatTile
          label="Unassigned"
          value={stats?.unassigned}
          caption="Needs an owner"
          icon={<Users size={13} />}
          tone="clay"
          active={unassigned}
          onClick={() => patchParams({ unassigned: "1" })}
        />
        <StatTile
          label="AI offline"
          value={stats?.ai_offline}
          caption="Manual triage"
          icon={<Bot size={13} />}
          tone="stone"
        />
      </div>

      <div className="rounded-2xl border border-stone-200/80 bg-cream shadow-card">
        <div className="flex flex-col gap-2.5 border-b border-stone-100 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <Input
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  patchParams({ q: event.target.value.trim() || null });
                }}
                placeholder="Search subject, text or ticket #"
                className="h-9 pl-9 text-xs"
                aria-label="Search the support queue"
              />
            </div>
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
              <div className="flex w-full shrink-0 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 sm:w-auto">
                <CalendarRange size={12} className="text-stone-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => patchParams({ from: event.target.value || null })}
                  className="focus-ring h-8 w-[6.9rem] min-w-0 flex-1 bg-transparent text-[10px] text-stone-600 outline-none sm:flex-none"
                  aria-label="From date"
                />
                <span className="text-[10px] text-stone-300">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => patchParams({ to: event.target.value || null })}
                  className="focus-ring h-8 w-[6.9rem] min-w-0 flex-1 bg-transparent text-[10px] text-stone-600 outline-none sm:flex-none"
                  aria-label="To date"
                />
              </div>
              {activeFilters.length ? (
                <Button variant="ghost" size="sm" onClick={resetFilters} icon={<X size={12} />}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status}
              onChange={(event) => patchParams({ status: event.target.value || null })}
              className="h-9 !w-[8.25rem] !py-0 text-xs"
              aria-label="Filter by status"
            >
              <option value="">Any status</option>
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              value={category}
              onChange={(event) => patchParams({ category: event.target.value || null })}
              className="h-9 !w-[12rem] !py-0 text-xs"
              aria-label="Filter by category"
            >
              <option value="">Any category</option>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              value={priority}
              onChange={(event) => patchParams({ priority: event.target.value || null })}
              className="h-9 !w-[8.25rem] !py-0 text-xs"
              aria-label="Filter by priority"
            >
              <option value="">Any priority</option>
              {PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <span className="mx-1 hidden h-5 w-px bg-stone-200 sm:block" />
            <button
              type="button"
              onClick={() => patchParams({ unassigned: unassigned ? null : "1", mine: null })}
              className={cn(
                "focus-ring h-9 rounded-lg border px-2.5 text-[11px] font-semibold transition",
                unassigned
                  ? "border-forest-300 bg-forest-50 text-forest-800"
                  : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50",
              )}
            >
              Unassigned
            </button>
            <button
              type="button"
              onClick={() => patchParams({ mine: mine ? null : "1", unassigned: null })}
              className={cn(
                "focus-ring h-9 rounded-lg border px-2.5 text-[11px] font-semibold transition",
                mine
                  ? "border-forest-300 bg-forest-50 text-forest-800"
                  : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50",
              )}
            >
              Mine
            </button>
          </div>
        </div>

        {activeFilters.length ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 px-3 py-2">
            <SlidersHorizontal size={11} className="text-stone-400" />
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  if (filter.key === "q") setSearchInput("");
                  patchParams({ [filter.key]: null });
                }}
                className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600 transition hover:bg-stone-200"
              >
                {filter.label}
                <X size={9} />
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[11px] text-stone-500">
            <span className="font-semibold text-ink">{total}</span> {pluralize(total, "ticket")}
            {ticketsQuery.isFetching ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-stone-400">
                <Spinner className="h-2.5 w-2.5" /> syncing
              </span>
            ) : null}
          </p>
          <p className="hidden items-center gap-1 text-[10px] text-stone-400 sm:flex">
            <ArrowUpRight size={10} /> Urgency first, then oldest
          </p>
        </div>

        {ticketsQuery.isError ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
            The queue could not be loaded. Please refresh the page.
          </div>
        ) : null}

        {ticketsQuery.isLoading ? (
          <div className="space-y-2 p-4 pt-0">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center gap-4 rounded-xl border border-stone-100 p-3">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-2.5 w-1/2 rounded" />
                  <div className="skeleton h-2 w-1/3 rounded" />
                </div>
                <div className="skeleton h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        ) : tickets.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-y border-stone-100 bg-stone-50/60 text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400">
                    <th className="px-4 py-2.5">Ticket</th>
                    <th className="px-3 py-2.5">Book</th>
                    <th className="px-3 py-2.5">Triage</th>
                    <th className="px-3 py-2.5">Priority</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Owner</th>
                    <th className="px-3 py-2.5">Updated</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="group transition hover:bg-white">
                      <td className="max-w-[310px] px-4 py-3">
                        <Link to={`/admin/tickets/${ticket.id}`} className="focus-ring block rounded-md">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
                            {ticket.ticket_number}
                          </span>
                          <p className="mt-0.5 truncate text-xs font-semibold text-ink group-hover:text-forest-800">
                            {ticket.subject}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <Avatar name={ticket.author.name} seed={ticket.author.id} size="xs" />
                            <span className="truncate text-[10px] text-stone-500">
                              {ticket.author.name}
                            </span>
                            {ticket.message_count ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-stone-400">
                                <MessageSquare size={8} />
                                {ticket.message_count}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="max-w-[150px] px-3 py-3">
                        <p className="truncate text-[11px] text-stone-600">
                          {ticket.book?.title ?? "General"}
                        </p>
                        <p className="mt-0.5 text-[9px] text-stone-400">
                          {ticket.book?.id ?? "No book"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[170px] flex-col items-start gap-1">
                          {ticket.category ? <CategoryBadge category={ticket.category} /> : null}
                          <SourceBadge source={ticket.classification_source} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="px-3 py-3">
                        {ticket.assigned_admin ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-stone-600">
                            <Avatar
                              name={ticket.assigned_admin.name}
                              seed={ticket.assigned_admin.id}
                              size="xs"
                            />
                            {ticket.assigned_admin.name.split(" ")[0]}
                          </span>
                        ) : (
                          <Badge className="bg-stone-100 text-stone-500 ring-stone-200">Unassigned</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[10px] text-stone-400">
                        {relativeTime(ticket.updated_at)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          to={`/admin/tickets/${ticket.id}`}
                          className="focus-ring inline-flex rounded-lg p-1.5 text-stone-300 transition group-hover:bg-forest-50 group-hover:text-forest-700"
                          aria-label={`Open ${ticket.ticket_number}`}
                        >
                          <ChevronRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-stone-100 lg:hidden">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/admin/tickets/${ticket.id}`}
                  className="focus-ring block p-4 transition hover:bg-white"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
                      {ticket.ticket_number}
                    </span>
                    <StatusBadge status={ticket.status} />
                    {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : null}
                  </div>
                  <p className="mt-1.5 text-xs font-semibold leading-relaxed text-ink">
                    {ticket.subject}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-stone-500">
                      <Avatar name={ticket.author.name} seed={ticket.author.id} size="xs" />
                      {ticket.author.name}
                    </span>
                    {ticket.category ? <CategoryBadge category={ticket.category} /> : null}
                    <span className="ml-auto text-[10px] text-stone-400">
                      {relativeTime(ticket.updated_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {pages > 1 ? (
              <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3">
                <p className="text-[11px] text-stone-500">
                  Page {page} of {pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => patchParams({ page: String(page - 1) })}
                    icon={<ChevronLeft size={13} />}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= pages}
                    onClick={() => patchParams({ page: String(page + 1) })}
                  >
                    Next
                    <ChevronRight size={13} />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="p-4 pt-0">
            <EmptyState
              icon={<Inbox size={22} />}
              title="No tickets match these filters"
              description="Try widening the date range, clearing a filter, or searching for a different phrase."
              action={
                <Button variant="secondary" size="sm" onClick={resetFilters} icon={<RefreshCw size={12} />}>
                  Reset the queue
                </Button>
              }
              className="border-0 bg-transparent"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  caption,
  icon,
  tone = "default",
  active,
  onClick,
}: {
  label: string;
  value: number | undefined;
  caption: string;
  icon: React.ReactNode;
  tone?: "default" | "gold" | "sky" | "rose" | "clay" | "stone";
  active?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    default: "text-stone-500 bg-white",
    gold: "text-gold-700 bg-gold-50",
    sky: "text-sky-700 bg-sky-50",
    rose: "text-rose-700 bg-rose-50",
    clay: "text-orange-700 bg-orange-50",
    stone: "text-stone-600 bg-stone-100",
  };
  const content = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-stone-500">{label}</p>
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", tones[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-xl font-semibold leading-none text-ink">
        {value === undefined ? <span className="skeleton inline-block h-5 w-8 rounded" /> : value}
      </p>
      <p className="mt-1 text-[9px] text-stone-400">{caption}</p>
    </>
  );
  if (!onClick) {
    return (
      <div className="rounded-xl border border-stone-200/80 bg-cream p-3 shadow-card">{content}</div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring rounded-xl border bg-cream p-3 text-left shadow-card transition hover:border-forest-300 hover:shadow-lift",
        active ? "border-forest-400 ring-1 ring-forest-200" : "border-stone-200/80",
      )}
    >
      {content}
    </button>
  );
}
