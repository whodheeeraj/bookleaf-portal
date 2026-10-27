"""Multi-provider AI/SLM service with strict JSON validation and fallback.

Provider support
----------------
* ``openai`` / ``slm_cloud`` / ``slm_local`` all speak the OpenAI Chat
  Completions protocol, so one async client covers OpenAI, Groq, Together,
  Ollama and vLLM. Only base URL + model change.
* ``anthropic`` uses the native async SDK.
* ``mock`` (or a real provider with no key) uses the deterministic BookLeaf
  rule engine so the demo never depends on someone else's uptime.

Resilience contract
-------------------
* 8s timeout per attempt, one automatic retry, optional secondary provider.
* Invalid JSON / schema violations are treated as failures and retried.
* If every configured engine fails, the caller still saves the ticket with
  category=General Inquiry, priority=Medium, ai_classified=False and no draft.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel

from app.config import Settings, settings as default_settings
from app.models.enums import TicketCategory, TicketPriority
from app.schemas.ai import AIDraftOnly, AITriageOnly, AITriageResult, VALID_CATEGORIES, VALID_PRIORITIES
from app.services import kb_context
from app.services.ai_context import (
    AuthorSnapshot,
    BookSnapshot,
    TicketSnapshot,
    author_block,
    book_block,
    books_summary_block,
    format_inr,
    pending_royalty_total,
    truncate,
)
from app.services.rule_engine import MODEL_NAME as RULE_MODEL_NAME, RuleEngine

logger = logging.getLogger(__name__)

ProviderKind = Literal["openai", "anthropic"]


# ---------------------------------------------------------------------------
# Outcomes
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class TriageOutcome:
    category: TicketCategory
    priority: TicketPriority
    draft_response: str | None
    model_used: str | None
    ai_classified: bool
    confidence: float | None = None
    error: str | None = None
    degraded: bool = False
    latency_ms: int = 0


@dataclass(slots=True)
class DraftOutcome:
    draft_response: str | None
    model_used: str | None
    ai_classified: bool
    confidence: float | None = None
    error: str | None = None
    latency_ms: int = 0


@dataclass(slots=True)
class AIMetrics:
    """Cheap in-process counters surfaced by /api/health for observability."""

    calls: int = 0
    failures: int = 0
    retries: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    last_latency_ms: int | None = None
    last_model: str | None = None
    _latencies: list[int] = field(default_factory=list, repr=False)

    def record(self, *, ok: bool, latency_ms: int, model: str | None, usage: dict | None):
        self.calls += 1
        self.last_latency_ms = latency_ms
        self.last_model = model
        self._latencies = [*self._latencies[-49:], latency_ms]
        if usage:
            self.prompt_tokens += int(usage.get("prompt_tokens") or 0)
            self.completion_tokens += int(usage.get("completion_tokens") or 0)
        if not ok:
            self.failures += 1

    def snapshot(self) -> dict[str, Any]:
        avg = round(sum(self._latencies) / len(self._latencies)) if self._latencies else None
        return {
            "calls": self.calls,
            "failures": self.failures,
            "retries": self.retries,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "avg_latency_ms": avg,
            "last_latency_ms": self.last_latency_ms,
            "last_model": self.last_model,
        }


# ---------------------------------------------------------------------------
# Errors / provider plumbing
# ---------------------------------------------------------------------------
class AIProviderError(RuntimeError):
    """Any provider, transport, timeout or schema failure."""


@dataclass(frozen=True, slots=True)
class ProviderSpec:
    provider: str
    kind: ProviderKind
    model: str
    base_url: str | None
    api_key: str | None


def _short_error(exc: BaseException, limit: int = 240) -> str:
    text = f"{type(exc).__name__}: {exc}".replace("\n", " ").strip()
    return text[:limit]


def _extract_json(text: str) -> dict[str, Any]:
    """Tolerate fences, prose around JSON, trailing commas and key casing."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("response did not contain a JSON object")
    candidate = cleaned[start : end + 1]
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)  # trailing commas
    data = json.loads(candidate)
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object")
    return {str(key).strip().lower(): value for key, value in data.items()}


class AIService:
    def __init__(
        self,
        app_settings: Settings | None = None,
        rule_engine: RuleEngine | None = None,
        metrics: AIMetrics | None = None,
    ) -> None:
        self.settings = app_settings or default_settings
        self.rule_engine = rule_engine or RuleEngine()
        self.metrics = metrics or AIMetrics()

    # -- provider resolution ------------------------------------------------
    def _spec_for(
        self,
        provider: str | None,
        model: str | None,
        base_url: str | None,
        api_key: str | None,
    ) -> ProviderSpec | None:
        if not provider or provider == "mock" or not model:
            return None
        provider = provider.lower().strip()
        if provider == "anthropic":
            if not api_key:
                return None
            return ProviderSpec(provider, "anthropic", model, base_url, api_key)
        if provider in {"openai", "slm_cloud", "slm_local"}:
            if provider != "slm_local" and not api_key:
                return None
            return ProviderSpec(
                provider,
                "openai",
                model,
                base_url or "https://api.openai.com/v1",
                api_key or "not-needed",
            )
        logger.warning("Unknown AI_PROVIDER=%r; falling back to the rule engine", provider)
        return None

    @property
    def primary(self) -> ProviderSpec | None:
        return self._spec_for(
            self.settings.ai_provider,
            self.settings.ai_model,
            self.settings.ai_base_url,
            self.settings.api_key,
        )

    @property
    def fallback(self) -> ProviderSpec | None:
        if not self.settings.fallback_configured:
            return None
        spec = self._spec_for(
            self.settings.ai_fallback_provider,
            self.settings.ai_fallback_model,
            self.settings.ai_fallback_base_url,
            self.settings.fallback_api_key,
        )
        if spec and self.primary and spec.model == self.primary.model and spec.base_url == self.primary.base_url:
            return None
        return spec

    # -- prompts ------------------------------------------------------------
    def _payout_note(self, today: date) -> str:
        return kb_context.payout_calendar_note(today)

    def _user_context(
        self,
        author: AuthorSnapshot,
        book: BookSnapshot | None,
        books: list[BookSnapshot],
        ticket: TicketSnapshot,
        today: date,
    ) -> str:
        if book is not None:
            book_context = book_block(book)
        else:
            book_context = books_summary_block(books)
            total = pending_royalty_total(books)
            book_context += f"\nPending royalty across the account: {format_inr(total)}."

        limit = max(400, int(self.settings.ai_max_output_tokens * 2.5))
        return "\n\n".join(
            [
                self._payout_note(today),
                author_block(author),
                book_context,
                (
                    "TICKET\n"
                    f"Subject: {truncate(ticket.subject, 200)}\n"
                    f"Message: {truncate(ticket.description, limit)}"
                ),
            ]
        )

    def _triage_draft_system(self, today: date) -> str:
        return (
            "You are BookLeaf Assist, the author-support drafting assistant for BookLeaf "
            "Publishing (India and US). You write replies a senior support specialist can send "
            "with light editing, and you classify the ticket.\n\n"
            f"{kb_context.policy_digest()}\n\n"
            f"{kb_context.category_router()}\n\n"
            f"{kb_context.tone_contract()}\n\n"
            "PRIORITY RUBRIC\n"
            "- Critical: legal/regulatory threat, duplicate or conflicting ISBN, data/privacy "
            "issue, royalty overdue by 2+ quarters, published book unpurchasable for 7+ days, "
            "or an explicit escalation request.\n"
            "- High: overdue/unpaid royalty within policy, print defect, wrong metadata, "
            "production delay against a promised date, stock-sync issue on a live title.\n"
            "- Medium: routine status checks, payout timing questions, metadata change requests, "
            "new-listing questions.\n"
            "- Low: general how-to, bio/description updates, non-urgent requests.\n\n"
            f"{kb_context.STYLE_ANCHOR}\n\n"
            "OUTPUT CONTRACT\n"
            "Return ONE JSON object and nothing else:\n"
            '{"category": "<exactly one listed category>", "priority": "<Critical|High|Medium|Low>", '
            '"confidence": <0.0-1.0>, "rationale": "<max 15 words>", "draft_response": "<the reply>"}\n'
            f"category must be one of: {VALID_CATEGORIES}.\n"
            f"priority must be one of: {VALID_PRIORITIES}.\n"
            "No markdown fences, no commentary, no extra keys."
        )

    def _triage_system(self) -> str:
        return (
            "You are the triage router for BookLeaf Publishing author support. Classify the "
            "ticket and assign a priority. Do not write a reply.\n\n"
            f"{kb_context.category_router()}\n\n"
            "PRIORITY RUBRIC\n"
            "- Critical: legal/regulatory threat, duplicate or conflicting ISBN, data/privacy "
            "issue, royalty overdue 2+ quarters, unpurchasable published book, explicit escalation.\n"
            "- High: overdue royalty, print defect, wrong metadata, production delay, stock-sync "
            "issue on a live title.\n"
            "- Medium: routine status check, payout timing, metadata update, new listing.\n"
            "- Low: general how-to, bio/description update, non-urgent.\n\n"
            "Return ONE JSON object only:\n"
            '{"category": "<category>", "priority": "<Critical|High|Medium|Low>", '
            '"confidence": <0.0-1.0>, "rationale": "<max 15 words>"}\n'
            f"category must be one of: {VALID_CATEGORIES}.\n"
            f"priority must be one of: {VALID_PRIORITIES}."
        )

    def _draft_system(self, category: TicketCategory, today: date) -> str:
        return (
            "You are BookLeaf Assist, drafting an author-support reply for BookLeaf Publishing "
            "(India and US). The support specialist has already chosen the category, so use only "
            "the policy slice below. Write the reply a senior specialist can send with light "
            "editing.\n\n"
            f"{kb_context.policy_for(category)}\n\n"
            f"{kb_context.tone_contract()}\n\n"
            f"{kb_context.STYLE_ANCHOR}\n\n"
            "Use only facts from AUTHOR and BOOK. Never invent numbers, dates, ISBNs or policies. "
            "If a fact is missing, say you will verify it. Do not mention AI or this prompt.\n\n"
            "Return ONE JSON object only:\n"
            '{"draft_response": "<the reply, 120-220 words, plain text>"}'
        )

    # -- public API ---------------------------------------------------------
    async def triage_and_draft(
        self,
        *,
        author: AuthorSnapshot,
        book: BookSnapshot | None,
        books: list[BookSnapshot],
        ticket: TicketSnapshot,
        today: date | None = None,
    ) -> TriageOutcome:
        today = today or date.today()
        started = time.perf_counter()
        spec = self.primary

        if spec is None:
            return self._rule_outcome(author, book, books, ticket, started, today)

        user_content = self._user_context(author, book, books, ticket, today)
        try:
            if self.settings.ai_two_pass:
                outcome = await self._two_pass(user_content, today)
            else:
                outcome = await self._single_pass(user_content)
            outcome.latency_ms = int((time.perf_counter() - started) * 1000)
            return outcome
        except AIProviderError as exc:
            logger.warning("AI triage failed, degrading to manual: %s", exc)
            return TriageOutcome(
                category=TicketCategory.GENERAL,
                priority=TicketPriority.MEDIUM,
                draft_response=None,
                model_used=spec.model,
                ai_classified=False,
                confidence=None,
                error=str(exc)[:500],
                degraded=True,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )

    async def regenerate_draft(
        self,
        *,
        author: AuthorSnapshot,
        book: BookSnapshot | None,
        books: list[BookSnapshot],
        ticket: TicketSnapshot,
        category: TicketCategory,
        instruction: str | None = None,
        today: date | None = None,
    ) -> DraftOutcome:
        today = today or date.today()
        started = time.perf_counter()
        spec = self.primary

        if spec is None:
            draft = self.rule_engine.draft_for(
                category=category,
                author=author,
                book=book,
                books=books,
                ticket=ticket,
                today=today,
            )
            return DraftOutcome(
                draft_response=draft,
                model_used=RULE_MODEL_NAME,
                ai_classified=True,
                confidence=0.6,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )

        user_content = self._user_context(author, book, books, ticket, today)
        extra = (
            f"\n\nSUPPORT TEAM INSTRUCTION: {truncate(instruction, 300)}" if instruction else ""
        )
        user_content = (
            f"{user_content}\n\nCONFIRMED CATEGORY: {category.value}{extra}\n\n"
            "Write the reply now for this category only."
        )

        try:
            result, usage, model = await self._with_fallback(
                system=self._draft_system(category, today),
                user=user_content,
                schema=AIDraftOnly,
                max_tokens=self.settings.ai_max_output_tokens,
            )
            return DraftOutcome(
                draft_response=result.draft_response,
                model_used=model,
                ai_classified=True,
                confidence=None,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
        except AIProviderError as exc:
            logger.warning("AI regenerate failed: %s", exc)
            return DraftOutcome(
                draft_response=None,
                model_used=spec.model,
                ai_classified=False,
                error=str(exc)[:500],
                latency_ms=int((time.perf_counter() - started) * 1000),
            )

    def health(self) -> dict[str, Any]:
        spec = self.primary
        return {
            "provider": self.settings.ai_provider,
            "model": spec.model if spec else RULE_MODEL_NAME,
            "configured": spec is not None,
            "mode": "llm" if spec else "rule_engine",
            "fallback_enabled": self.fallback is not None,
            "two_pass": self.settings.ai_two_pass,
            "metrics": self.metrics.snapshot(),
        }

    # -- orchestration ------------------------------------------------------
    def _rule_outcome(
        self,
        author: AuthorSnapshot,
        book: BookSnapshot | None,
        books: list[BookSnapshot],
        ticket: TicketSnapshot,
        started: float,
        today: date,
    ) -> TriageOutcome:
        result = self.rule_engine.triage_and_draft(author, book, books, ticket, today)
        return TriageOutcome(
            category=result.category,
            priority=result.priority,
            draft_response=result.draft_response,
            model_used=RULE_MODEL_NAME,
            ai_classified=True,
            confidence=result.confidence,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )

    async def _single_pass(self, user_content: str) -> TriageOutcome:
        result, _, model = await self._with_fallback(
            system=self._triage_draft_system(date.today()),
            user=user_content,
            schema=AITriageResult,
            max_tokens=self.settings.ai_max_output_tokens,
        )
        return TriageOutcome(
            category=result.category,
            priority=result.priority,
            draft_response=result.draft_response,
            model_used=model,
            ai_classified=True,
            confidence=result.confidence,
        )

    async def _two_pass(self, user_content: str, today: date) -> TriageOutcome:
        triage, _, model = await self._with_fallback(
            system=self._triage_system(),
            user=user_content,
            schema=AITriageOnly,
            max_tokens=200,
        )

        draft_user = (
            f"{user_content}\n\nCONFIRMED CATEGORY: {triage.category.value}\n\n"
            "Write the reply now for this category only."
        )
        try:
            draft, _, draft_model = await self._with_fallback(
                system=self._draft_system(triage.category, today),
                user=draft_user,
                schema=AIDraftOnly,
                max_tokens=self.settings.ai_max_output_tokens,
            )
        except AIProviderError as exc:
            # Classification succeeded, drafting did not: keep the useful half
            # and let the admin write the reply manually.
            logger.warning("Two-pass draft failed after successful triage: %s", exc)
            return TriageOutcome(
                category=triage.category,
                priority=triage.priority,
                draft_response=None,
                model_used=model,
                ai_classified=True,
                confidence=triage.confidence,
                error=f"Draft pass failed: {exc}"[:500],
            )

        return TriageOutcome(
            category=triage.category,
            priority=triage.priority,
            draft_response=draft.draft_response,
            model_used=draft_model,
            ai_classified=True,
            confidence=triage.confidence,
        )

    async def _with_fallback(
        self,
        *,
        system: str,
        user: str,
        schema: type[BaseModel],
        max_tokens: int,
    ) -> tuple[Any, dict | None, str]:
        primary = self.primary
        if primary is None:
            raise AIProviderError("No AI provider configured")

        try:
            async with asyncio.timeout(self.settings.ai_total_timeout_seconds):
                return await self._validated_call(primary, system, user, schema, max_tokens)
        except (AIProviderError, TimeoutError) as primary_exc:
            fallback = self.fallback
            if fallback is None:
                if isinstance(primary_exc, TimeoutError):
                    raise AIProviderError("AI request exceeded the total time budget") from primary_exc
                raise
            logger.warning(
                "Primary AI provider %s/%s failed (%s); trying fallback %s/%s",
                primary.provider,
                primary.model,
                _short_error(primary_exc, 120),
                fallback.provider,
                fallback.model,
            )
            try:
                async with asyncio.timeout(self.settings.ai_total_timeout_seconds):
                    return await self._validated_call(fallback, system, user, schema, max_tokens)
            except (AIProviderError, TimeoutError) as fallback_exc:
                raise AIProviderError(
                    f"Primary failed ({_short_error(primary_exc, 120)}); "
                    f"fallback failed ({_short_error(fallback_exc, 120)})"
                ) from fallback_exc

    async def _validated_call(
        self,
        spec: ProviderSpec,
        system: str,
        user: str,
        schema: type[BaseModel],
        max_tokens: int,
    ) -> tuple[Any, dict | None, str]:
        attempts = self.settings.ai_max_retries + 1
        last_error: BaseException | None = None

        for attempt in range(1, attempts + 1):
            attempt_started = time.perf_counter()
            try:
                text, usage = await self._complete(spec, system, user, max_tokens)
                parsed = schema.model_validate(_extract_json(text))
                self.metrics.record(
                    ok=True,
                    latency_ms=int((time.perf_counter() - attempt_started) * 1000),
                    model=spec.model,
                    usage=usage,
                )
                return parsed, usage, spec.model
            except asyncio.CancelledError:  # pragma: no cover - cooperative cancel
                raise
            except Exception as exc:  # noqa: BLE001 - provider errors are heterogeneous
                last_error = exc
                logger.warning(
                    "AI attempt %s/%s failed provider=%s model=%s error=%s",
                    attempt,
                    attempts,
                    spec.provider,
                    spec.model,
                    _short_error(exc),
                )
                if attempt < attempts:
                    self.metrics.retries += 1
                    await asyncio.sleep(0.4 * attempt)

        self.metrics.record(
            ok=False,
            latency_ms=int((time.perf_counter() - attempt_started) * 1000),
            model=spec.model,
            usage=None,
        )
        raise AIProviderError(_short_error(last_error or RuntimeError("unknown AI error")))

    async def _complete(
        self, spec: ProviderSpec, system: str, user: str, max_tokens: int
    ) -> tuple[str, dict | None]:
        if spec.kind == "anthropic":
            return await self._complete_anthropic(spec, system, user, max_tokens)
        return await self._complete_openai(spec, system, user, max_tokens)

    async def _complete_openai(
        self, spec: ProviderSpec, system: str, user: str, max_tokens: int
    ) -> tuple[str, dict | None]:
        from openai import AsyncOpenAI

        kwargs: dict[str, Any] = {
            "model": spec.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": self.settings.ai_temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }

        async with AsyncOpenAI(
            api_key=spec.api_key or "not-needed",
            base_url=spec.base_url,
            timeout=self.settings.ai_timeout_seconds,
            max_retries=0,
        ) as client:
            try:
                response = await asyncio.wait_for(
                    client.chat.completions.create(**kwargs),
                    timeout=self.settings.ai_timeout_seconds,
                )
            except Exception as exc:  # noqa: BLE001
                lowered = str(exc).lower()
                # Ollama/vLLM and a few gateways reject response_format and/or
                # max_tokens. Retry once with the most compatible payload.
                adjusted = False
                if "response_format" in lowered:
                    kwargs.pop("response_format", None)
                    adjusted = True
                if "max_tokens" in lowered:
                    kwargs.pop("max_tokens", None)
                    kwargs["max_completion_tokens"] = max_tokens
                    adjusted = True
                if not adjusted:
                    raise
                response = await asyncio.wait_for(
                    client.chat.completions.create(**kwargs),
                    timeout=self.settings.ai_timeout_seconds,
                )

        choice = response.choices[0] if response.choices else None
        text = (choice.message.content if choice and choice.message else None) or ""
        if not text.strip():
            raise AIProviderError("AI returned an empty message")
        usage = None
        if getattr(response, "usage", None) is not None:
            usage = {
                "prompt_tokens": getattr(response.usage, "prompt_tokens", 0),
                "completion_tokens": getattr(response.usage, "completion_tokens", 0),
            }
        return text, usage

    async def _complete_anthropic(
        self, spec: ProviderSpec, system: str, user: str, max_tokens: int
    ) -> tuple[str, dict | None]:
        from anthropic import AsyncAnthropic

        async with AsyncAnthropic(
            api_key=spec.api_key,
            timeout=self.settings.ai_timeout_seconds,
            max_retries=0,
        ) as client:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=spec.model,
                    max_tokens=max_tokens,
                    temperature=self.settings.ai_temperature,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                ),
                timeout=self.settings.ai_timeout_seconds,
            )

        parts = [
            block.text
            for block in getattr(response, "content", [])
            if getattr(block, "type", None) == "text" and getattr(block, "text", None)
        ]
        text = "\n".join(parts).strip()
        if not text:
            raise AIProviderError("Anthropic returned an empty message")
        usage = None
        if getattr(response, "usage", None) is not None:
            usage = {
                "prompt_tokens": getattr(response.usage, "input_tokens", 0),
                "completion_tokens": getattr(response.usage, "output_tokens", 0),
            }
        return text, usage


#: Process-wide singleton (stateless apart from counters).
ai_service = AIService()
