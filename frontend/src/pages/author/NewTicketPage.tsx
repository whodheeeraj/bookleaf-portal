import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileText,
  Info,
  Lightbulb,
  LockKeyhole,
  Mail,
  Paperclip,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { BookCover } from "@/components/books/BookCard";
import { ProductionBadge } from "@/components/tickets/TicketBadges";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useBooks, useCreateTicket } from "@/hooks/queries";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { Book } from "@/lib/types";

export function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const booksQuery = useBooks();
  const mutation = useCreateTicket();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const books = booksQuery.data ?? [];
  const initialBook = searchParams.get("book") ?? "";
  const [bookId, setBookId] = useState(initialBook);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (initialBook && books.some((book) => book.id === initialBook)) {
      setBookId(initialBook);
    }
  }, [initialBook, books]);

  const selectedBook: Book | undefined = books.find((book) => book.id === bookId);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (subject.trim().length < 3) next.subject = "Add a short subject (at least 3 characters).";
    if (subject.trim().length > 200) next.subject = "Keep the subject under 200 characters.";
    if (description.trim().length < 10) {
      next.description = "Describe the issue in a little more detail (at least 10 characters).";
    }
    if (description.trim().length > 5000) next.description = "Keep the description under 5,000 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    try {
      const ticket = await mutation.mutateAsync({
        book_id: bookId || null,
        subject: subject.trim(),
        description: description.trim(),
        attachment_name: attachmentName,
      });
      notify({
        title: "Request received",
        description: `${ticket.ticket_number} is with the BookLeaf support team.`,
        tone: "success",
      });
      navigate(`/app/tickets/${ticket.id}`, { state: { created: true } });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : "We could not send your request. Please try again.",
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

      <PageHeader
        eyebrow="New request"
        title="Tell us what you need"
        description="Share the details once — we attach your book, royalty and production context automatically so you do not have to repeat yourself."
      />

      <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Request details"
            description="Clear details help us resolve this on the first reply."
            icon={<FileText size={16} />}
          />
          <CardContent className="space-y-4">
            {submitError ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700"
              >
                {submitError}
              </div>
            ) : null}

            <Field
              label="Which book is this about?"
              htmlFor="book"
              hint="Optional — choose General inquiry if it is about your account or payouts overall."
            >
              <Select
                id="book"
                value={bookId}
                onChange={(event) => setBookId(event.target.value)}
                disabled={booksQuery.isLoading}
              >
                <option value="">General inquiry — not book-specific</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title} · {book.id}
                    {book.is_in_production ? " (in production)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Subject"
              htmlFor="subject"
              required
              error={errors.subject}
              hint={`${subject.length}/200 characters`}
            >
              <Input
                id="subject"
                value={subject}
                maxLength={200}
                onChange={(event) => {
                  setSubject(event.target.value);
                  if (errors.subject) setErrors((current) => ({ ...current, subject: "" }));
                }}
                placeholder="e.g. Royalty transfer not received for last quarter"
              />
            </Field>

            <Field
              label="What is happening?"
              htmlFor="description"
              required
              error={errors.description}
              hint="Include dates, amounts, order numbers or the exact message you saw. Avoid sharing bank passwords or OTPs."
            >
              <Textarea
                id="description"
                value={description}
                maxLength={5000}
                rows={9}
                onChange={(event) => {
                  setDescription(event.target.value);
                  if (errors.description) setErrors((current) => ({ ...current, description: "" }));
                }}
                placeholder="Tell us what you expected, what happened, and what you have already tried…"
              />
            </Field>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-700">Attachment (optional)</p>
              {attachmentName ? (
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3.5 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-50 text-forest-700">
                    <Paperclip size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-ink">{attachmentName}</p>
                    <p className="text-[10px] text-stone-400">Filename attached to this request</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentName(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    aria-label="Remove attachment"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="focus-ring flex w-full items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white/60 px-4 py-4 text-left transition hover:border-forest-400 hover:bg-forest-50/30"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                    <Upload size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-ink">
                      Add a screenshot or document
                    </span>
                    <span className="mt-0.5 block text-[10px] text-stone-400">
                      PDF, JPG, PNG or DOCX · the demo stores the filename only
                    </span>
                  </span>
                  <ArrowRight size={14} className="text-stone-300" />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setAttachmentName(file.name);
                }}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2.5">
              <LockKeyhole size={12} className="mt-0.5 shrink-0 text-stone-400" />
              <p className="text-[10px] leading-relaxed text-stone-500">
                Your request is visible only to you and the BookLeaf support team. Internal notes
                and AI drafts are never shared with authors.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
              <Link to="/app/tickets" className={buttonStyles({ variant: "ghost" })}>
                Cancel
              </Link>
              <Button
                type="submit"
                loading={mutation.isPending}
                icon={mutation.isPending ? undefined : <Sparkles size={15} />}
              >
                {mutation.isPending ? "Routing your request…" : "Submit request"}
              </Button>
            </div>
            {mutation.isPending ? (
              <p className="text-right text-[10px] text-stone-400">
                Reading your request and matching the right team…
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {selectedBook ? (
            <Card>
              <CardHeader
                title="Attached book"
                description="Shared with your request automatically."
                icon={<BookCheckIcon />}
              />
              <CardContent className="pt-3">
                <div className="flex gap-3">
                  <BookCover book={selectedBook} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-ink">
                      {selectedBook.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-stone-400">{selectedBook.isbn}</p>
                    <div className="mt-2">
                      <ProductionBadge status={selectedBook.status} />
                    </div>
                  </div>
                </div>
                {selectedBook.is_in_production ? (
                  <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-[10px] leading-relaxed text-sky-800">
                    Currently at <strong>{selectedBook.production_stage}</strong>
                    {selectedBook.next_production_stage
                      ? ` · next stage: ${selectedBook.next_production_stage}`
                      : ""}
                    . Royalty tracking begins after publication.
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-inset ring-stone-100">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">
                        Pending
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-gold-800">
                        {formatCurrency(selectedBook.royalty_pending)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-inset ring-stone-100">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">
                        Copies sold
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-ink">
                        {selectedBook.total_copies_sold.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="What happens next"
              description="A human always reviews the reply before you see it."
              icon={<Bot size={15} />}
            />
            <CardContent className="space-y-3 pt-3">
              {[
                {
                  step: "01",
                  title: "We read the full context",
                  body: "Your request is matched with your book, royalty history and production stage.",
                },
                {
                  step: "02",
                  title: "The right team is picked",
                  body: "Royalty, production, print or distribution — routed automatically, adjusted by a human.",
                },
                {
                  step: "03",
                  title: "You get a clear reply",
                  body: "A support specialist reviews the suggested response, edits it, and sends it here.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest-50 font-display text-[11px] font-bold text-forest-700">
                    {item.step}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">{item.body}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="rounded-2xl border border-gold-200/70 bg-gold-50/60 p-4">
            <div className="flex items-center gap-2">
              <Lightbulb size={14} className="text-gold-700" />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-800">
                Helpful to include
              </p>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {[
                "Payout amounts and the dates you expected them",
                "Order IDs, ISBNs or the exact retail link",
                "Photos for print or quality issues",
                "The launch date you are working towards",
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-gold-900/80">
                  <CheckCircle2 size={10} className="mt-0.5 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 px-1 text-[10px] leading-relaxed text-stone-400">
            <Mail size={12} className="mt-0.5 shrink-0" />
            Prefer email? Write to support@bookleaf.com and we will link it to your account.
          </div>
        </div>
      </form>
    </div>
  );
}

function BookCheckIcon() {
  return <Info size={15} />;
}
