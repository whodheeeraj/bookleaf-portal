import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Copy,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ConfidenceMeter, SourceBadge } from "@/components/tickets/TicketBadges";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useRegenerateDraft } from "@/hooks/queries";
import { ApiError } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import type { TicketCategory, TicketDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AiDraftPanel({
  ticket,
  onUseDraft,
}: {
  ticket: TicketDetail;
  onUseDraft: (text: string) => void;
}) {
  const mutation = useRegenerateDraft(ticket.id);
  const { notify } = useToast();
  const [draft, setDraft] = useState(ticket.ai_draft_response ?? "");
  const [showOptions, setShowOptions] = useState(false);
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(ticket.ai_draft_response ?? "");
  }, [ticket.id, ticket.ai_draft_response]);

  const hasDraft = Boolean(draft.trim());
  const degraded = !ticket.ai_classified;

  async function regenerate() {
    setError(null);
    try {
      const response = await mutation.mutateAsync({
        category: category || undefined,
        instruction: instruction.trim() || undefined,
      });
      setDraft(response.ai_draft_response);
      notify({
        title: "Draft regenerated",
        description: "Review the wording before sending it to the author.",
        tone: "success",
      });
      setShowOptions(false);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "The AI provider could not generate a draft. You can still reply manually.";
      setError(message);
      notify({ title: "Draft unavailable", description: message, tone: "error" });
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was blocked. Select the draft and copy it manually.");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-forest-100 bg-gradient-to-r from-forest-50/80 to-cream px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest-500 text-white">
            <Sparkles size={13} />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-ink">AI draft assistant</p>
            <p className="text-[9px] text-stone-500">Admin-only · never auto-sent</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-forest-800">
            <LockKeyhole size={8} /> Internal
          </span>
        </div>
      </div>

      <CardContent className="space-y-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={ticket.classification_source} />
          <ConfidenceMeter value={ticket.ai_confidence} />
          {ticket.ai_model_used ? (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500">
              {ticket.ai_model_used}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] leading-relaxed text-rose-700">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        {degraded && !hasDraft ? (
          <div className="rounded-lg border border-dashed border-gold-300 bg-gold-50/70 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-800">
              <TriangleAlert size={11} /> AI Offline - Manual Triage Required
            </p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-gold-900/75">
              Automated triage did not complete for this request
              {ticket.ai_error ? `: ${ticket.ai_error}` : "."} You can regenerate a draft or reply
              manually below.
            </p>
          </div>
        ) : null}

        <div>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={11}
            placeholder={
              hasDraft
                ? "Edit the draft before using it…"
                : "No draft yet. Generate one, or write your reply manually in the conversation."
            }
            className="bg-white text-[12px] leading-relaxed"
            disabled={mutation.isPending}
          />
          <div className="mt-1 flex items-center justify-between text-[9px] text-stone-400">
            <span>{draft.length} characters</span>
            <span>{hasDraft ? "Editable · review before sending" : "Empty draft"}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowOptions((current) => !current)}
            icon={<ChevronDown size={12} className={cn("transition", showOptions && "rotate-180")} />}
          >
            Options
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void regenerate()}
            loading={mutation.isPending}
            icon={mutation.isPending ? undefined : <RefreshCw size={12} />}
          >
            {hasDraft ? "Regenerate" : "Generate draft"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copyDraft()}
            disabled={!hasDraft}
            icon={copied ? <Check size={12} /> : <Copy size={12} />}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => onUseDraft(draft)}
            disabled={!hasDraft}
            icon={<ArrowDownToLine size={12} />}
          >
            Use in reply
          </Button>
        </div>

        {showOptions ? (
          <div className="animate-slide-up space-y-2.5 rounded-lg border border-stone-200 bg-stone-50/70 p-3">
            <Field label="Regenerate with category" hint="Only that policy slice is sent to the model.">
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value as TicketCategory | "")}
                className="h-8 !py-0 text-[11px]"
              >
                <option value="">Use current category</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Extra instruction" hint="Optional tone or content guidance.">
              <Textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. Acknowledge the delay and give a 48-hour update promise."
                className="text-[11px]"
              />
            </Field>
            <Button
              size="sm"
              onClick={() => void regenerate()}
              loading={mutation.isPending}
              icon={<Wand2 size={12} />}
              className="w-full"
            >
              Regenerate with these options
            </Button>
          </div>
        ) : null}

        <p className="flex items-start gap-1.5 border-t border-stone-100 pt-2.5 text-[9px] leading-relaxed text-stone-400">
          <LockKeyhole size={9} className="mt-0.5 shrink-0" />
          Drafts stay on the admin side. Authors only receive messages a human explicitly sends.
        </p>
      </CardContent>
    </Card>
  );
}
