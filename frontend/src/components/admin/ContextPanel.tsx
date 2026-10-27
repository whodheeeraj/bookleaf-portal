import {
  BookOpen,
  CalendarDays,
  Clock3,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  UserCheck,
  UserRound,
  Wallet,
} from "lucide-react";

import { BookCover } from "@/components/books/BookCard";
import { SourceBadge, ConfidenceMeter, ProductionBadge } from "@/components/tickets/TicketBadges";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { CATEGORIES, PRIORITIES, STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate, formatNumber, relativeTime } from "@/lib/format";
import type {
  TicketCategory,
  TicketDetail,
  TicketPriority,
  TicketStatus,
} from "@/lib/types";

interface PatchPayload {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  assigned_admin_id?: string | null;
}

export function ContextPanel({
  ticket,
  adminId,
  onPatch,
  saving,
}: {
  ticket: TicketDetail;
  adminId: string;
  onPatch: (payload: PatchPayload) => void;
  saving: boolean;
}) {
  const book = ticket.book;
  const assignedToMe = ticket.assigned_admin?.id === adminId;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Author context" icon={<UserRound size={15} />} />
        <CardContent className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <Avatar name={ticket.author.name} seed={ticket.author.id} />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">{ticket.author.name}</p>
              <a
                href={`mailto:${ticket.author.email}`}
                className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-forest-700 hover:underline"
              >
                <Mail size={10} /> {ticket.author.email}
              </a>
            </div>
          </div>
          <div className="space-y-1.5 border-t border-stone-100 pt-3">
            {ticket.author.city ? (
              <p className="flex items-center gap-1.5 text-[10px] text-stone-500">
                <MapPin size={10} className="text-stone-400" /> {ticket.author.city}
              </p>
            ) : null}
            {ticket.author.phone ? (
              <p className="flex items-center gap-1.5 text-[10px] text-stone-500">
                <Phone size={10} className="text-stone-400" /> {ticket.author.phone}
              </p>
            ) : null}
            <p className="flex items-center gap-1.5 text-[10px] text-stone-500">
              <CalendarDays size={10} className="text-stone-400" /> Author since{" "}
              {formatDate(ticket.author.joined_date)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Book context"
          icon={<BookOpen size={15} />}
          action={book ? <ProductionBadge status={book.status} /> : null}
        />
        <CardContent className="pt-3">
          {book ? (
            <>
              <div className="flex gap-3">
                <BookCover book={book} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-semibold text-ink">{book.title}</p>
                  <p className="mt-0.5 text-[10px] text-stone-400">
                    {book.id} · {book.isbn}
                  </p>
                  <p className="mt-1.5 text-[10px] text-stone-500">{book.genre ?? "Genre not set"}</p>
                </div>
              </div>

              {book.is_in_production ? (
                <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2.5 ring-1 ring-inset ring-sky-100">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-sky-800">
                    <span>
                      Stage {book.production_stage_number ?? "—"} of {book.production_stage_count}
                    </span>
                    <span>{book.production_stage ?? "In production"}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sky-100">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{
                        width: `${Math.round(
                          ((book.production_stage_number ?? 1) / book.production_stage_count) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  {book.next_production_stage ? (
                    <p className="mt-1.5 text-[9px] text-sky-700">
                      Next: {book.next_production_stage}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Metric label="Pending" value={formatCurrency(book.royalty_pending)} gold />
                  <Metric label="Paid" value={formatCurrency(book.royalty_paid)} />
                  <Metric label="MRP" value={formatCurrency(book.mrp)} />
                  <Metric label="Sold" value={formatNumber(book.total_copies_sold)} />
                </div>
              )}
              <div className="mt-2.5 flex items-center justify-between text-[9px] text-stone-400">
                <span className="inline-flex items-center gap-1">
                  <Wallet size={9} /> Last payout {formatDate(book.last_royalty_payout_date)}
                </span>
                <span>{book.print_partner ?? "Print partner TBD"}</span>
              </div>
              {book.available_on.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {book.available_on.map((platform) => (
                    <span
                      key={platform}
                      className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] text-stone-500"
                    >
                      {platform}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg bg-stone-50 px-3 py-4 text-center">
              <p className="text-[11px] font-medium text-stone-600">General inquiry</p>
              <p className="mt-0.5 text-[10px] text-stone-400">
                No book attached — check the author&apos;s portfolio if the request needs one.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Triage"
          description="Override the automated suggestion if it landed wrong."
          icon={<UserCheck size={15} />}
          action={
            saving ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-stone-400">
                <Spinner className="h-2.5 w-2.5" /> Saving
              </span>
            ) : null
          }
        />
        <CardContent className="space-y-2.5 pt-2">
          <TriageSelect
            label="Status"
            value={ticket.status}
            disabled={saving}
            onChange={(value) => onPatch({ status: value as TicketStatus })}
            options={STATUSES}
          />
          <TriageSelect
            label="Category"
            value={ticket.category ?? ""}
            disabled={saving}
            onChange={(value) => onPatch({ category: value as TicketCategory })}
            options={CATEGORIES}
            placeholder="Awaiting triage"
          />
          <TriageSelect
            label="Priority"
            value={ticket.priority ?? ""}
            disabled={saving}
            onChange={(value) => onPatch({ priority: value as TicketPriority })}
            options={PRIORITIES}
            placeholder="Awaiting triage"
          />

          <div className="flex items-center justify-between border-t border-stone-100 pt-2.5">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">
                Owner
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-stone-700">
                {ticket.assigned_admin ? ticket.assigned_admin.name : "Unassigned"}
              </p>
            </div>
            {assignedToMe ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onPatch({ assigned_admin_id: null })}
                className="focus-ring rounded-lg border border-stone-300 px-2.5 py-1 text-[10px] font-semibold text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
              >
                Unassign
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => onPatch({ assigned_admin_id: adminId })}
                className="focus-ring rounded-lg bg-forest-800 px-2.5 py-1 text-[10px] font-semibold text-cream transition hover:bg-forest-700 disabled:opacity-50"
              >
                Assign to me
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-stone-200/80 bg-white/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={ticket.classification_source} />
          <ConfidenceMeter value={ticket.ai_confidence} />
        </div>
        {ticket.ai_suggested_category &&
        (ticket.ai_suggested_category !== ticket.category ||
          ticket.ai_suggested_priority !== ticket.priority) ? (
          <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
            Suggested: {ticket.ai_suggested_category} · {ticket.ai_suggested_priority}
            {ticket.ai_model_used ? ` (${ticket.ai_model_used})` : ""}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between text-[9px] text-stone-400">
          <span className="inline-flex items-center gap-1">
            <Clock3 size={9} /> Created {relativeTime(ticket.created_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles size={9} /> Updated {relativeTime(ticket.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-inset ring-stone-100">
      <p className="text-[8px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`mt-0.5 text-[11px] font-semibold ${gold ? "text-gold-800" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

function TriageSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-semibold text-stone-500">{label}</span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-8 w-[62%] !py-0 text-[11px]"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </label>
  );
}
