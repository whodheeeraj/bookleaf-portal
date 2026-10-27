import { LockKeyhole, MessageSquare, Send, Sparkles } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TicketThread({
  messages,
  viewerRole,
  viewerId,
  emptyLabel = "No messages yet. The conversation will appear here.",
}: {
  messages: Message[];
  viewerRole: "AUTHOR" | "ADMIN";
  viewerId: string;
  emptyLabel?: string;
}) {
  if (!messages.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-200 bg-stone-50/50 px-4 py-8 text-center">
        <MessageSquare size={18} className="text-stone-300" />
        <p className="text-[11px] leading-relaxed text-stone-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const isOwn = message.sender.id === viewerId;
        const isInternal = message.is_internal_note;
        return (
          <article
            key={message.id}
            className={cn(
              "rounded-xl border p-4",
              isInternal
                ? "border-dashed border-gold-300 bg-gold-50/70"
                : isOwn
                  ? "border-forest-100 bg-forest-50/40"
                  : "border-stone-200 bg-white",
            )}
          >
            <header className="flex flex-wrap items-center gap-2">
              <Avatar name={message.sender.name} seed={message.sender.id} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">
                  {message.sender.name}
                  {isOwn ? (
                    <span className="ml-1.5 text-[10px] font-medium text-stone-400">(you)</span>
                  ) : null}
                </p>
                <p className="text-[10px] text-stone-400">
                  {isInternal ? "Internal note" : message.sender.role === "ADMIN" ? "BookLeaf support" : "Author"}
                  {" · "}
                  <span title={formatDateTime(message.created_at)}>
                    {relativeTime(message.created_at)}
                  </span>
                </p>
              </div>
              {isInternal ? (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold-800">
                  <LockKeyhole size={9} />
                  Only admins
                </span>
              ) : null}
              {!isInternal && message.sender.role === "ADMIN" ? (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-forest-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-forest-600">
                  <Sparkles size={9} />
                  Support
                </span>
              ) : null}
            </header>
            <p className="message-body mt-3 text-[13px] leading-relaxed text-stone-700">
              {message.content}
            </p>
          </article>
        );
      })}
    </div>
  );
}

export function ReplyComposer({
  value,
  onChange,
  onSubmit,
  pending,
  allowInternal = false,
  internal = false,
  onInternalChange,
  disabled,
  placeholder = "Write a clear, helpful reply…",
  submitLabel = "Send reply",
  helper,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending?: boolean;
  allowInternal?: boolean;
  internal?: boolean;
  onInternalChange?: (internal: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  submitLabel?: string;
  helper?: string;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (value.trim() && !pending && !disabled) onSubmit();
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
      {allowInternal ? (
        <div className="flex items-center gap-1 border-b border-stone-100 px-3 pt-2">
          <button
            type="button"
            onClick={() => onInternalChange?.(false)}
            className={cn(
              "rounded-t-lg px-3 py-2 text-[11px] font-semibold transition",
              !internal
                ? "border-b-2 border-forest-600 text-forest-700"
                : "text-stone-400 hover:text-stone-600",
            )}
          >
            Public reply
          </button>
          <button
            type="button"
            onClick={() => onInternalChange?.(true)}
            className={cn(
              "inline-flex items-center gap-1 rounded-t-lg px-3 py-2 text-[11px] font-semibold transition",
              internal
                ? "border-b-2 border-gold-500 text-gold-700"
                : "text-stone-400 hover:text-stone-600",
            )}
          >
            <LockKeyhole size={11} />
            Internal note
          </button>
          {internal ? (
            <span className="ml-auto hidden text-[10px] font-medium text-gold-600 sm:block">
              Never shown to the author
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={cn("p-3", allowInternal && internal && "bg-gold-50/40")}>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pending}
          rows={4}
          placeholder={internal ? "Add context for the support team only…" : placeholder}
          className="focus-ring w-full resize-y rounded-lg border-0 bg-transparent p-2 text-[13px] leading-relaxed text-ink placeholder:text-stone-400 focus:ring-0 disabled:cursor-not-allowed"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-1 pt-2">
          <p className="text-[10px] leading-relaxed text-stone-400">
            {internal ? (
              <span className="inline-flex items-center gap-1 text-gold-700">
                <LockKeyhole size={10} /> Internal only — authors cannot see this.
              </span>
            ) : (
              helper || "Ctrl/⌘ + Enter to send. Be specific and kind."
            )}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-stone-300">{value.length}/5000</span>
            <Button
              type="button"
              size="sm"
              onClick={onSubmit}
              disabled={!value.trim() || disabled}
              loading={pending}
              icon={pending ? undefined : <Send size={13} />}
              variant={internal ? "gold" : "primary"}
            >
              {internal ? "Save note" : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((index) => (
        <div key={index} className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="space-y-1.5">
              <div className="skeleton h-2.5 w-28 rounded" />
              <div className="skeleton h-2 w-16 rounded" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="skeleton h-2.5 w-full rounded" />
            <div className="skeleton h-2.5 w-5/6 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ComposerSending() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-4 text-xs text-stone-500">
      <Spinner />
      Sending…
    </div>
  );
}
