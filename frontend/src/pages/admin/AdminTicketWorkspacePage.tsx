import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Inbox,
  LockKeyhole,
  Mail,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { AiDraftPanel } from "@/components/admin/AiDraftPanel";
import { ContextPanel } from "@/components/admin/ContextPanel";
import { QueueRail } from "@/components/admin/QueueRail";
import { Avatar, EmptyState } from "@/components/ui/Avatar";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import {
  CategoryBadge,
  PriorityBadge,
  SourceBadge,
  StatusBadge,
} from "@/components/tickets/TicketBadges";
import { ReplyComposer, TicketThread } from "@/components/tickets/TicketThread";
import { useAddMessage, useTicket, useUpdateTicket } from "@/hooks/queries";
import { ApiError } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";

export function AdminTicketWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { notify } = useToast();
  const query = useTicket(id);
  const updateMutation = useUpdateTicket(id ?? "");
  const messageMutation = useAddMessage(id ?? "");
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);

  if (query.isLoading) return <WorkspaceSkeleton />;

  if (query.isError || !query.data || !user) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <EmptyState
          icon={<Inbox size={22} />}
          title={notFound ? "Ticket not found" : "Could not load this workspace"}
          description={
            notFound
              ? "This ticket may have been removed, or the link is incorrect."
              : "Refresh the page or return to the queue and try again."
          }
          action={
            <Link to="/admin" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <ArrowLeft size={13} /> Back to the queue
            </Link>
          }
        />
      </div>
    );
  }

  const ticket = query.data;

  async function patch(payload: {
    status?: TicketStatus;
    category?: TicketCategory;
    priority?: TicketPriority;
    assigned_admin_id?: string | null;
  }) {
    setPatchError(null);
    try {
      await updateMutation.mutateAsync(payload);
      notify({ title: "Ticket updated", description: "The author sees the new status immediately." });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "The update could not be saved. Try again.";
      setPatchError(message);
      notify({ title: "Update failed", description: message, tone: "error" });
    }
  }

  async function sendReply() {
    if (!reply.trim()) return;
    setReplyError(null);
    try {
      await messageMutation.mutateAsync({
        content: reply.trim(),
        is_internal_note: internal,
      });
      setReply("");
      notify({
        title: internal ? "Internal note saved" : "Reply sent to author",
        description: internal
          ? "Only the support team can see this note."
          : "The author has been notified in realtime.",
        tone: "success",
      });
      setInternal(false);
    } catch (error) {
      setReplyError(
        error instanceof ApiError ? error.message : "The reply could not be sent. Please try again.",
      );
    }
  }

  function useDraft(text: string) {
    setReply(text);
    setInternal(false);
    setReplyError(null);
    window.setTimeout(() => {
      document.getElementById("admin-reply")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  const resolved = ticket.status === "Resolved" || ticket.status === "Closed";

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-stone-200/90 bg-cream/95 px-3 py-2.5 sm:px-4">
        <Link
          to="/admin"
          className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink"
          aria-label="Back to queue"
          title="Back to queue"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-stone-400">
              {ticket.ticket_number}
            </span>
            <StatusBadge status={ticket.status} />
            {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : null}
            <span className="hidden sm:block">
              <SourceBadge source={ticket.classification_source} />
            </span>
          </div>
          <h1 className="mt-0.5 truncate text-[13px] font-semibold text-ink sm:text-sm">
            {ticket.subject}
          </h1>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-stone-500">
            <Avatar name={ticket.author.name} seed={ticket.author.id} size="xs" />
            {ticket.author.name}
          </span>
          <span className="h-4 w-px bg-stone-300" />
          <span className="text-[10px] text-stone-400">
            {ticket.assigned_admin ? ticket.assigned_admin.name.split(" ")[0] : "Unassigned"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`mailto:${ticket.author.email}?subject=${encodeURIComponent(
              `Re: ${ticket.ticket_number} — ${ticket.subject}`,
            )}`}
            className="focus-ring hidden h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink sm:inline-flex"
            title={`Email ${ticket.author.email}`}
            aria-label="Email author"
          >
            <Mail size={14} />
          </a>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink"
            title="Refresh ticket"
            aria-label="Refresh ticket"
          >
            {query.isFetching ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <QueueRail activeId={ticket.id} />

        <section className="min-w-0 flex-1 overflow-y-auto bg-paper">
          <div className="mx-auto max-w-3xl space-y-5 p-4 pb-14 sm:p-6">
            {patchError ? (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] font-medium text-rose-700">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                {patchError}
              </div>
            ) : null}

            {resolved ? (
              <div className="flex items-start gap-2 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2.5 text-[11px] text-forest-800">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                This ticket is {ticket.status.toLowerCase()}. A new public reply from the author
                reopens it automatically.
              </div>
            ) : null}

            {!ticket.ai_classified ? (
              <div className="flex items-start gap-2 rounded-xl border border-gold-200 bg-gold-50/70 px-3 py-2.5 text-[11px] text-gold-900">
                <Sparkles size={13} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">AI Offline - Manual Triage Required.</span> Use
                  the draft assistant or triage controls on the right to route it manually.
                </span>
              </div>
            ) : null}

            <Card>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={ticket.author.name} seed={ticket.author.id} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink">{ticket.author.name}</p>
                    <p className="text-[10px] text-stone-400">
                      Opened {formatDateTime(ticket.created_at)} · {relativeTime(ticket.created_at)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-medium text-stone-500">
                    <Clock3 size={9} /> {ticket.message_count} public + internal
                  </span>
                </div>

                <h2 className="mt-4 font-display text-lg font-semibold leading-snug text-ink">
                  {ticket.subject}
                </h2>
                <p className="message-body mt-2 text-[13px] leading-relaxed text-stone-700">
                  {ticket.description}
                </p>

                {ticket.attachment_name ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-600">
                    <Paperclip size={12} className="text-stone-400" />
                    {ticket.attachment_name}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
                  {ticket.category ? <CategoryBadge category={ticket.category} /> : null}
                  <span className="rounded-lg bg-white px-2 py-1 text-[11px] text-stone-500 ring-1 ring-inset ring-stone-200">
                    {ticket.book ? ticket.book.title : "General inquiry"}
                  </span>
                  {ticket.book ? (
                    <span className="rounded-lg bg-white px-2 py-1 text-[11px] text-stone-500 ring-1 ring-inset ring-stone-200">
                      {ticket.book.id}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[10px] text-stone-400">
                    Last activity {relativeTime(ticket.updated_at)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <MessageSquare size={15} className="text-forest-600" />
                  Conversation
                  <span className="rounded-full bg-stone-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                    {ticket.messages.length}
                  </span>
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gold-700">
                  <LockKeyhole size={10} /> Internal notes are admin-only
                </span>
              </div>
              <TicketThread
                messages={ticket.messages}
                viewerRole="ADMIN"
                viewerId={user.id}
                emptyLabel="No messages yet. Send the first public reply or leave an internal note."
              />
            </div>

            <div id="admin-reply">
              <Card>
                <CardContent className="pt-3">
                  {replyError ? (
                    <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
                      {replyError}
                    </div>
                  ) : null}
                  <ReplyComposer
                    value={reply}
                    onChange={setReply}
                    onSubmit={() => void sendReply()}
                    pending={messageMutation.isPending}
                    disabled={!reply.trim()}
                    allowInternal
                    internal={internal}
                    onInternalChange={setInternal}
                    submitLabel="Send to author"
                    helper="Ctrl/⌘ + Enter to send. This reply becomes visible to the author."
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 xl:hidden">
              <h2 className="text-sm font-semibold text-ink">Context & AI assistant</h2>
              <ContextPanel
                ticket={ticket}
                adminId={user.id}
                onPatch={(payload) => void patch(payload)}
                saving={updateMutation.isPending}
              />
              <AiDraftPanel ticket={ticket} onUseDraft={useDraft} />
            </div>
          </div>
        </section>

        <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-stone-200 bg-cream xl:block 2xl:w-[390px]">
          <div className="space-y-4 p-4">
            <ContextPanel
              ticket={ticket}
              adminId={user.id}
              onPatch={(payload) => void patch(payload)}
              saving={updateMutation.isPending}
            />
            <AiDraftPanel ticket={ticket} onUseDraft={useDraft} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-stone-200 bg-cream px-4 py-3">
        <div className="skeleton h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton h-2.5 w-32 rounded" />
          <div className="skeleton h-3.5 w-1/2 rounded" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[288px] space-y-2 border-r border-stone-200 p-3 2xl:block">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="skeleton h-48 rounded-2xl" />
            <div className="skeleton h-28 rounded-2xl" />
            <div className="skeleton h-40 rounded-2xl" />
          </div>
        </div>
        <div className="hidden w-[360px] space-y-4 border-l border-stone-200 p-4 xl:block">
          <div className="skeleton h-44 rounded-2xl" />
          <div className="skeleton h-52 rounded-2xl" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
