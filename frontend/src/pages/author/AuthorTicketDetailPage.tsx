import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  LifeBuoy,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { BookCover } from "@/components/books/BookCard";
import {
  CategoryBadge,
  ConfidenceMeter,
  PriorityBadge,
  ProductionBadge,
  SourceBadge,
  StatusBadge,
} from "@/components/tickets/TicketBadges";
import { ReplyComposer, ThreadSkeleton, TicketThread } from "@/components/tickets/TicketThread";
import { Avatar, EmptyState } from "@/components/ui/Avatar";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useAddMessage, useTicket } from "@/hooks/queries";
import { ApiError } from "@/lib/api";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/format";
import type { TicketDetail } from "@/lib/types";

export function AuthorTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const { notify } = useToast();
  const query = useTicket(id);
  const mutation = useAddMessage(id ?? "");
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const created = Boolean((location.state as { created?: boolean } | null)?.created);

  if (query.isLoading) return <DetailSkeleton />;

  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="space-y-6">
        <Link
          to="/app/tickets"
          className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-stone-500 hover:text-ink"
        >
          <ArrowLeft size={13} /> Back to support tickets
        </Link>
        <EmptyState
          icon={<Inbox size={22} />}
          title={notFound ? "Request not found" : "Could not load this request"}
          description={
            notFound
              ? "This request does not exist, or it belongs to another author account."
              : "Please refresh the page. If the problem persists, contact support."
          }
          action={
            <Link to="/app/tickets" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Back to my requests
            </Link>
          }
        />
      </div>
    );
  }

  const ticket = query.data;
  const reopened = ticket.status === "Resolved" || ticket.status === "Closed";

  async function handleSend() {
    if (!reply.trim()) return;
    setReplyError(null);
    try {
      await mutation.mutateAsync({ content: reply.trim(), is_internal_note: false });
      setReply("");
      notify({ title: "Reply sent", description: "The support team has been notified." });
    } catch (error) {
      setReplyError(
        error instanceof ApiError ? error.message : "Your reply could not be sent. Please try again.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/app/tickets"
        className="focus-ring inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-stone-500 transition hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to support tickets
      </Link>

      {created ? <CreatedBanner ticket={ticket} /> : null}

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
              {ticket.ticket_number}
            </span>
            <StatusBadge status={ticket.status} />
            {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : null}
          </span>
        }
        title={ticket.subject}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={12} /> Opened {formatDateTime(ticket.created_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={12} /> Updated {relativeTime(ticket.updated_at)}
            </span>
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <Avatar name={user?.name ?? ticket.author.name} seed={ticket.author.id} />
                <div>
                  <p className="text-xs font-semibold text-ink">{ticket.author.name}</p>
                  <p className="text-[10px] text-stone-400">
                    {formatDateTime(ticket.created_at)} · You
                  </p>
                </div>
              </div>
              <p className="message-body mt-4 text-[13px] leading-relaxed text-stone-700">
                {ticket.description}
              </p>
              {ticket.attachment_name ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-600">
                  <Paperclip size={12} className="text-stone-400" />
                  {ticket.attachment_name}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                {ticket.category ? <CategoryBadge category={ticket.category} /> : null}
                {ticket.book ? (
                  <span className="rounded-lg bg-white px-2 py-1 text-[11px] text-stone-500 ring-1 ring-inset ring-stone-200">
                    {ticket.book.title}
                  </span>
                ) : (
                  <span className="rounded-lg bg-white px-2 py-1 text-[11px] text-stone-500 ring-1 ring-inset ring-stone-200">
                    Not book-specific
                  </span>
                )}
                <span className="ml-auto">
                  <SourceBadge source={ticket.classification_source} />
                </span>
              </div>
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <MessageSquare size={15} className="text-forest-600" />
                Conversation
                <span className="rounded-full bg-stone-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                  {ticket.messages.length}
                </span>
              </h2>
              <span className="text-[10px] text-stone-400">Live updates enabled</span>
            </div>
            <TicketThread
              messages={ticket.messages}
              viewerRole="AUTHOR"
              viewerId={user?.id ?? ticket.author.id}
              emptyLabel="No replies yet. BookLeaf support has your request and will respond here."
            />
          </div>

          <Card>
            <CardHeader
              title="Add a reply"
              description={
                reopened
                  ? `This request is ${ticket.status.toLowerCase()}. Replying will reopen it for the support team.`
                  : "Your reply is shared with the BookLeaf support team."
              }
              icon={<MessageSquare size={15} />}
            />
            <CardContent className="pt-3">
              {replyError ? (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
                  {replyError}
                </div>
              ) : null}
              <ReplyComposer
                value={reply}
                onChange={setReply}
                onSubmit={() => void handleSend()}
                pending={mutation.isPending}
                disabled={!reply.trim()}
                placeholder={
                  reopened
                    ? "Reply to reopen this request…"
                    : "Add any missing detail or ask a follow-up question…"
                }
                submitLabel={reopened ? "Send & reopen" : "Send reply"}
              />
              <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-stone-400">
                <LockKeyhole size={11} className="mt-0.5 shrink-0" />
                Internal notes and AI drafts are never visible to authors. Only public replies
                appear above.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Request details" icon={<FileText size={15} />} />
            <CardContent className="space-y-3 pt-2">
              <DetailRow label="Reference" value={ticket.ticket_number} mono />
              <DetailRow label="Opened" value={formatDateTime(ticket.created_at)} />
              <DetailRow label="Last update" value={relativeTime(ticket.updated_at)} />
              <DetailRow
                label="Assigned to"
                value={
                  ticket.assigned_admin ? (
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound size={11} className="text-stone-400" />
                      {ticket.assigned_admin.name}
                    </span>
                  ) : (
                    "BookLeaf support desk"
                  )
                }
              />
              <DetailRow label="Category" value={ticket.category ?? "Awaiting triage"} />
              <DetailRow label="Priority" value={ticket.priority ?? "Awaiting triage"} />
            </CardContent>
          </Card>

          {ticket.book ? (
            <Card>
              <CardHeader
                title="Book context"
                description="Attached to this request automatically."
                icon={<Sparkles size={15} />}
              />
              <CardContent className="pt-3">
                <div className="flex gap-3">
                  <BookCover book={ticket.book} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-ink">
                      {ticket.book.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-stone-400">{ticket.book.isbn}</p>
                    <div className="mt-2">
                      <ProductionBadge status={ticket.book.status} />
                    </div>
                  </div>
                </div>
                {ticket.book.is_in_production ? (
                  <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-[10px] leading-relaxed text-sky-800">
                    Stage {ticket.book.production_stage_number} of{" "}
                    {ticket.book.production_stage_count}: {ticket.book.production_stage}
                    {ticket.book.next_production_stage
                      ? ` · next: ${ticket.book.next_production_stage}`
                      : ""}
                  </p>
                ) : (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-stone-100">
                    <span className="text-[10px] font-medium text-stone-500">Pending royalty</span>
                    <span className="text-xs font-semibold text-gold-800">
                      {formatCurrency(ticket.book.royalty_pending)}
                    </span>
                  </div>
                )}
                <Link
                  to="/app/books"
                  className="focus-ring mt-3 inline-flex items-center gap-1 rounded-md text-[10px] font-semibold text-forest-700 hover:text-forest-900"
                >
                  Open My books <ArrowUpRight size={11} />
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="How this was routed"
              description="Every request is checked by a person before a reply is sent."
              icon={<ShieldCheck size={15} />}
            />
            <CardContent className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={ticket.classification_source} />
                <ConfidenceMeter value={ticket.ai_confidence} />
              </div>
              <p className="text-[11px] leading-relaxed text-stone-500">
                {ticket.classification_source === "manual_fallback"
                  ? "Automated triage was unavailable for this request, so a support specialist will categorise it manually. You may see a short delay before the first reply."
                  : ticket.classification_source === "admin_override"
                    ? "A support specialist reviewed and adjusted the automated category or priority to make sure it reaches the right team."
                    : ticket.classification_source === "rules"
                      ? "BookLeaf's deterministic rules engine matched your request to a policy category. A support specialist reviews every reply before it is sent."
                      : "The AI model suggested a category and priority from your request and book context. A support specialist approves or edits the final reply."}
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-forest-50 px-3 py-2 text-[10px] font-medium text-forest-800">
                <CheckCircle2 size={12} className="shrink-0" />
                Authors never receive AI drafts — only approved replies.
              </div>
            </CardContent>
          </Card>

          <div className="rounded-2xl bg-forest-950 p-5 text-cream">
            <div className="flex items-center gap-2 text-forest-400">
              <LifeBuoy size={14} />
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]">Need more help?</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/70">
              Reply above to keep everything in one thread. For a new issue, open a separate
              request so it can be routed independently.
            </p>
            <Link
              to="/app/tickets/new"
              className={buttonStyles({
                variant: "primary",
                size: "sm",
                className: "mt-3 w-full",
              })}
            >
              New request
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-2.5 last:border-0 last:pb-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">{label}</span>
      <span
        className={`text-right text-[11px] font-medium text-stone-700 ${mono ? "font-mono text-[10px]" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function CreatedBanner({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="animate-slide-up overflow-hidden rounded-2xl border border-forest-200 bg-gradient-to-br from-forest-50 to-cream p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-700 text-cream">
          <CheckCircle2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-forest-900">
            Request received — {ticket.ticket_number}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-forest-800/80">
            {ticket.ai_classified && ticket.category
              ? `We routed this to ${ticket.category} with ${ticket.priority ?? "Medium"} priority.`
              : "Our automated triage could not classify this request, so a support specialist will review and route it manually."}{" "}
            {ticket.book ? `${ticket.book.title} is attached to the thread. ` : ""}
            A human will review the context and reply here — you will not see an unreviewed draft.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ticket.category ? <CategoryBadge category={ticket.category} /> : null}
            {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : null}
            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-stone-500 ring-1 ring-inset ring-stone-200">
              <Clock3 size={10} /> First reply within 1 business day
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-3 w-32 rounded" />
      <div className="skeleton h-7 w-2/3 rounded" />
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-cream p-5">
            <div className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 rounded-full" />
              <div className="space-y-1.5">
                <div className="skeleton h-2.5 w-28 rounded" />
                <div className="skeleton h-2 w-32 rounded" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="skeleton h-2.5 w-full rounded" />
              <div className="skeleton h-2.5 w-11/12 rounded" />
              <div className="skeleton h-2.5 w-3/4 rounded" />
            </div>
          </div>
          <ThreadSkeleton />
        </div>
        <div className="space-y-5">
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-56 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
