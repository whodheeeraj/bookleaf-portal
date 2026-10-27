import {
  ArrowUpRight,
  BookOpenCheck,
  ChevronRight,
  Clock3,
  Inbox,
  Leaf,
  LibraryBig,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

import { BookMini, RoyaltyRollover } from "@/components/books/BookCard";
import { PriorityBadge, SourceBadge, StatusBadge } from "@/components/tickets/TicketBadges";
import { buttonStyles } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Avatar";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { useAuth } from "@/auth/AuthContext";
import { useBooks, useHealth, useTickets } from "@/hooks/queries";
import { formatCurrency, formatDate, pluralize, relativeTime } from "@/lib/format";
import type { TicketSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  label,
  value,
  caption,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  tone?: "default" | "gold" | "forest" | "sky";
}) {
  const tones = {
    default: "bg-white text-stone-500",
    gold: "bg-gold-50 text-gold-600",
    forest: "bg-forest-50 text-forest-700",
    sky: "bg-sky-50 text-sky-600",
  };
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-cream p-4 shadow-card">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tones[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">{caption}</p>
    </div>
  );
}

function RecentTicket({ ticket }: { ticket: TicketSummary }) {
  return (
    <Link
      to={`/app/tickets/${ticket.id}`}
      className="focus-ring group flex items-center gap-3 rounded-xl border border-transparent px-2 py-3 transition hover:border-stone-200 hover:bg-white"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            {ticket.ticket_number}
          </span>
          <StatusBadge status={ticket.status} />
          {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : null}
        </div>
        <p className="mt-1.5 truncate text-[13px] font-semibold text-ink group-hover:text-forest-800">
          {ticket.subject}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-500">
          <MessageSquare size={10} />
          {ticket.message_count} {pluralize(ticket.message_count, "message")}
          <span className="text-stone-300">·</span>
          updated {relativeTime(ticket.updated_at)}
        </p>
      </div>
      <ChevronRight
        size={15}
        className="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-forest-500"
      />
    </Link>
  );
}

export function AuthorDashboard() {
  const { user } = useAuth();
  const booksQuery = useBooks();
  const ticketsQuery = useTickets({ page_size: 100 });
  const healthQuery = useHealth();

  const books = booksQuery.data ?? [];
  const tickets = ticketsQuery.data?.items ?? [];
  const unresolved = tickets.filter(
    (ticket) => ticket.status === "Open" || ticket.status === "In Progress",
  );
  const pendingRoyalty = books.reduce((sum, book) => sum + (book.royalty_pending || 0), 0);
  const paidRoyalty = books.reduce((sum, book) => sum + (book.royalty_paid || 0), 0);
  const published = books.filter((book) => !book.is_in_production);
  const inProduction = books.filter((book) => book.is_in_production);
  const rollover = books.filter((book) => book.is_royalty_rollover);
  const firstName = user?.name.split(" ")[0] ?? "there";
  const isLoading = booksQuery.isLoading || ticketsQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title={`${greeting()}, ${firstName}.`}
        description="Your books, royalties and support conversations in one place."
        actions={
          <>
            <Link to="/app/tickets" className={buttonStyles({ variant: "secondary" })}>
              <Inbox size={15} />
              My requests
            </Link>
            <Link to="/app/tickets/new" className={buttonStyles({})}>
              <Plus size={15} />
              New request
            </Link>
          </>
        }
      />

      {rollover.length ? (
        <div className="flex animate-slide-up items-start gap-3 rounded-xl border border-gold-200 bg-gold-50/70 px-4 py-3">
          <Wallet size={16} className="mt-0.5 shrink-0 text-gold-700" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gold-900">
              {formatCurrency(rollover.reduce((sum, book) => sum + book.royalty_pending, 0))} is
              rolling over
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gold-800/80">
              Payouts under {formatCurrency(1000)} stay in your balance and are released with the
              next qualifying cycle.{" "}
              {rollover.map((book) => (
                <span key={book.id} className="font-medium">
                  {book.title} ({formatCurrency(book.royalty_pending)})
                  {rollover.indexOf(book) < rollover.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
          </div>
          <Link
            to="/app/books"
            className="focus-ring hidden shrink-0 items-center gap-1 rounded-lg text-[11px] font-semibold text-gold-800 hover:text-gold-950 sm:inline-flex"
          >
            View books <ArrowUpRight size={12} />
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open requests"
          value={String(unresolved.length)}
          caption={
            unresolved.length
              ? "Our support team is on it"
              : "You're all caught up — nice!"
          }
          icon={<MessageSquare size={14} />}
          tone={unresolved.length ? "gold" : "forest"}
        />
        <StatCard
          label="Pending royalty"
          value={formatCurrency(pendingRoyalty)}
          caption={`${formatCurrency(paidRoyalty)} paid to date`}
          icon={<Wallet size={14} />}
          tone="gold"
        />
        <StatCard
          label="Published titles"
          value={String(published.length)}
          caption={`${published.reduce((sum, book) => sum + book.total_copies_sold, 0).toLocaleString("en-IN")} copies sold`}
          icon={<BookOpenCheck size={14} />}
          tone="forest"
        />
        <StatCard
          label="In production"
          value={String(inProduction.length)}
          caption={
            inProduction.length
              ? "Track stages under My books"
              : "No titles in production"
          }
          icon={<Leaf size={14} />}
          tone="sky"
        />
      </div>

      {booksQuery.isError || ticketsQuery.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          Some of your data could not be loaded. Please refresh in a moment.
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader
            title="Recent requests"
            description="Updates from the BookLeaf support desk."
            action={
              <Link
                to="/app/tickets"
                className="focus-ring rounded-md text-[11px] font-semibold text-forest-700 hover:text-forest-900"
              >
                View all
              </Link>
            }
          />
          <CardContent className="pt-2">
            {isLoading ? (
              <div className="space-y-3 py-2">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex items-center gap-3 px-2 py-3">
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-2.5 w-24 rounded" />
                      <div className="skeleton h-3 w-3/4 rounded" />
                      <div className="skeleton h-2 w-32 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tickets.length ? (
              <div className="divide-y divide-stone-100">
                {tickets.slice(0, 4).map((ticket) => (
                  <RecentTicket key={ticket.id} ticket={ticket} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Inbox size={20} />}
                title="No requests yet"
                description="When you need help with royalties, printing or production, open a request and our team will pick it up."
                action={
                  <Link to="/app/tickets/new" className={buttonStyles({ size: "sm" })}>
                    <Plus size={13} /> New request
                  </Link>
                }
                className="border-0 bg-transparent py-8"
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Your titles"
              description={`${books.length} ${pluralize(books.length, "book")} on BookLeaf`}
              icon={<LibraryBig size={15} />}
              action={
                <Link
                  to="/app/books"
                  className="focus-ring rounded-md text-[11px] font-semibold text-forest-700 hover:text-forest-900"
                >
                  All books
                </Link>
              }
            />
            <CardContent className="space-y-2 pt-3">
              {isLoading ? (
                [0, 1, 2].map((index) => (
                  <div key={index} className="skeleton h-16 w-full rounded-xl" />
                ))
              ) : books.length ? (
                books.slice(0, 3).map((book) => (
                  <BookMini key={book.id} book={book} href="/app/books" />
                ))
              ) : (
                <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-[11px] text-stone-500">
                  No books linked to your account yet.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="overflow-hidden rounded-2xl bg-forest-950 p-5 text-cream shadow-lift">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-gold-300" />
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-forest-300">
                Support at a glance
              </p>
            </div>
            <p className="mt-3 font-display text-lg font-medium leading-snug">
              Replies in under one business day, with your book context already in hand.
            </p>
            <div className="mt-4 space-y-2.5 border-t border-cream/10 pt-4 text-[11px]">
              <div className="flex items-center gap-2 text-forest-200/90">
                <Clock3 size={12} className="text-gold-300" />
                Monday–Saturday, 10:00–19:00 IST
              </div>
              <div className="flex items-center gap-2 text-forest-200/90">
                <ShieldCheck size={12} className="text-gold-300" />
                {healthQuery.data?.ai.mode === "llm"
                  ? "AI-assisted triage · human approved"
                  : "Deterministic triage · human approved"}
              </div>
              <div className="flex items-center gap-2 text-forest-200/90">
                <MessageSquare size={12} className="text-gold-300" />
                support@bookleaf.com
              </div>
            </div>
          </div>
        </div>
      </div>

      {published.some((book) => book.royalty_pending > 0) ? (
        <div>
          <SectionTitle>Royalty snapshot</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {published
              .filter((book) => book.royalty_pending > 0)
              .slice(0, 3)
              .map((book) => (
                <div
                  key={book.id}
                  className="rounded-xl border border-stone-200/80 bg-cream p-4 shadow-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">{book.title}</p>
                      <p className="mt-0.5 text-[10px] text-stone-400">Next payout cycle</p>
                    </div>
                    {book.is_royalty_rollover ? <RoyaltyRollover amount={book.royalty_pending} /> : null}
                  </div>
                  <p className="mt-3 font-display text-xl font-semibold text-gold-800">
                    {formatCurrency(book.royalty_pending)}
                  </p>
                  <p className="mt-1 text-[10px] text-stone-400">
                    Last paid {formatDate(book.last_royalty_payout_date)}
                  </p>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
