# BookLeaf Author Support & Communication Portal

A full-stack author support desk for BookLeaf Publishing: authors raise royalty, print, metadata, distribution and production questions; support admins triage them with AI assistance, see the author and book context before replying, and never leak internal notes or AI drafts to authors.

Built as a production-shaped monorepo — **FastAPI + SQLAlchemy 2 (async) + PostgreSQL** on the backend, **React + Vite + TypeScript + Tailwind + TanStack Query** on the frontend, with JWT RBAC, SSE realtime updates, provider-agnostic AI/SLM integration and an idempotent demo seed.

---

## Contents

- [Architecture & working guide](docs/ARCHITECTURE.md)
- [Demo accounts](#demo-accounts)
- [What you can demo](#what-you-can-demo)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
  - [Option A — Docker Compose (Postgres)](#option-a--docker-compose-postgres)
  - [Option B — Local SQLite (no services)](#option-b--local-sqlite-no-services)
  - [Option C — Local Postgres](#option-c--local-postgres)
- [Configuration](#configuration)
- [AI / SLM design](#ai--slm-design)
- [API surface](#api-surface)
- [Data model](#data-model)
- [Realtime updates](#realtime-updates)
- [Testing](#testing)
- [Database migrations](#database-migrations)
- [Production checklist](#production-checklist)
- [Troubleshooting](#troubleshooting)
- [Assignment coverage](#assignment-coverage)

---

## Demo accounts

Every seeded account uses the password **`password123`**.

| Role | Name | Email | Why this account |
| --- | --- | --- | --- |
| Admin | Aarav Mehta | `admin@bookleaf.com` | Full queue, filters, triage overrides, AI drafts, internal notes |
| Author | Sneha Kulkarni | `sneha.kulkarni@email.com` | Book in Cover Design (production timeline) |
| Author | Kavita Deshmukh | `kavita.deshmukh@email.com` | Typesetting book + ₹850 royalty below the ₹1,000 rollover threshold |
| Author | Rohit Kapoor | `rohit.kapoor@email.com` | Critical overdue-royalty escalation across two books |

The login screen has one-click demo buttons for these four accounts. The seed also creates six more authors and 18 books from `bookleaf_sample_data.json`, plus four realistic tickets (`TKT-1001`…`TKT-1004`).

## What you can demo

**Author portal** (`/app`)

- Dashboard with support KPIs, pending royalties, books in production and recent requests.
- Book shelf that safely renders *in-production* books where MRP, royalty and publication date are `null`.
- Ticket list, ticket thread, and a new-request form with book context.
- Royalty cards explain the **₹1,000 rollover threshold** with a tooltip when the balance is below it.
- Authors only ever see their own tickets — another author's ticket returns `404`.

**Admin console** (`/admin`)

- Queue with status/category/priority/assignee/date-range/search filters and urgency-first sort (unresolved → Critical → Low → oldest).
- Split-view workspace: queue rail, conversation, author/book context card, AI draft assistant.
- Triage overrides preserve the model's original suggestion (`AI triaged` → `Admin override`).
- Internal notes are visually distinct and are stripped server-side from author responses.
- Regenerate the AI draft for a chosen category; the response is only visible to admins.
- Author portfolio view with open tickets and pending royalties.

## Screens

| Admin queue | Ticket workspace | Author dashboard | Sign in |
| --- | --- | --- | --- |
| ![Admin support queue](docs/screenshots/admin-queue.png) | ![Admin ticket workspace](docs/screenshots/admin-workspace.png) | ![Author dashboard](docs/screenshots/author-dashboard.png) | ![Sign in](docs/screenshots/login.png) |

The interface uses the BookLeaf palette: coral `#F26979` accents on near-black `#161616`
surfaces, white cards and an off-white `#F7F6F3` page. Amber is reserved for warning and
status states, so semantic meaning survives the rebrand.

## Tech stack

| Layer | Choice |
| --- | --- |
| API | Python 3.11–3.14, FastAPI 0.162, Pydantic v2 |
| Persistence | SQLAlchemy 2.1 async, asyncpg, Alembic |
| Auth | JWT (PyJWT) + Passlib/bcrypt, role-based dependencies |
| AI | OpenAI-compatible provider factory, Anthropic native client, Google AI Studio (Gemini) client, deterministic rules fallback |
| Realtime | Server-Sent Events (`sse-starlette`) with polling fallback in the client |
| Frontend | React 18, Vite 5, TypeScript 5.7, Tailwind CSS 3, TanStack Query 5, React Router 6, Lucide |
| Tests | pytest + pytest-asyncio + httpx ASGI transport |
| Deploy | Docker multi-stage builds, nginx, docker-compose with Postgres |

## Repository layout

```text
bookleaf-portal/
├── backend/
│   ├── app/
│   │   ├── api/            # auth, books, tickets, admin, stream, health
│   │   ├── models/         # User, Book, Ticket, TicketMessage
│   │   ├── schemas/        # Pydantic v2 request/response contracts
│   │   ├── services/       # ticket lifecycle, AI service, rule engine, KB, SSE broker
│   │   ├── config.py       # typed settings / .env
│   │   ├── database.py     # async engine + session factory
│   │   ├── security.py     # hashing + JWT
│   │   ├── seed.py         # idempotent demo seed
│   │   └── main.py         # app factory, middleware, lifespan
│   ├── alembic/            # async migration environment + initial schema
│   ├── data/               # copy of bookleaf_sample_data.json
│   ├── tests/              # auth/RBAC, ticket lifecycle, AI + SSE tests
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/          # login, author/*, admin/*
│   │   ├── components/     # layout, tickets, books, admin, UI primitives
│   │   ├── hooks/          # TanStack Query hooks + SSE hook
│   │   ├── auth/           # auth context + route guards
│   │   └── lib/            # API client, types, formatting, constants
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .env.example
├── docker-compose.yml
├── docs/
│   ├── ARCHITECTURE.md     # deep-dive guide: system design, flows, trade-offs
│   └── screenshots/        # sign-in, admin queue/workspace, author dashboard
├── WRITEUP.md
└── README.md
```

---

## Quick start

### Option A — Docker Compose (Postgres)

From `bookleaf-portal/`:

```bash
docker compose up --build
```

- Portal: <http://localhost:5173>
- API docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/health>

On first boot the backend container runs `alembic upgrade head`, seeds the demo data (idempotent), then starts Uvicorn. nginx serves the built SPA and reverse-proxies `/api/*` to the backend, including unbuffered SSE.

To wipe and reseed the demo database:

```bash
docker compose run --rm backend python -m app.seed --reset
```

Set a real secret before exposing the stack:

```bash
JWT_SECRET="$(python -c "import secrets; print(secrets.token_urlsafe(48))")" docker compose up --build
```

### Option B — Local SQLite (no services)

**Backend**

```powershell
cd bookleaf-portal
python -m venv .venv
.venv\Scripts\Activate.ps1
cd backend
python -m pip install -r requirements.txt

Copy-Item .env.example .env
# Edit .env and set:
#   DATABASE_URL=sqlite+aiosqlite:///./bookleaf.db
#   AUTO_CREATE_TABLES=true

python -m app.seed --reset
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

macOS/Linux equivalents:

```bash
cd bookleaf-portal
python3 -m venv .venv
source .venv/bin/activate
cd backend
pip install -r requirements.txt
cp .env.example .env
# set DATABASE_URL=sqlite+aiosqlite:///./bookleaf.db
python -m app.seed --reset
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to `http://127.0.0.1:8000`, so no CORS setup is required.

### Option C — Local Postgres

Create a database and point `DATABASE_URL` at it, then apply migrations and seed:

```bash
createdb bookleaf
cd backend
cp .env.example .env
# DATABASE_URL=postgresql+asyncpg://bookleaf:bookleaf@localhost:5432/bookleaf
alembic upgrade head
python -m app.seed --reset
uvicorn app.main:app --reload
```

The bundled `docker-compose.yml` is the quickest way to get Postgres:

```bash
docker compose up -d db
```

### Deploying a live demo

The repository ships host-agnostic Docker images. On a VPS, clone the private repo, create a root `.env` with a rotated `JWT_SECRET`, then run `docker compose up -d --build`; nginx serves the SPA on port 5173 and proxies `/api` to the backend. For a managed platform (Render, Railway, Fly.io, ECS), deploy `backend/Dockerfile` and `frontend/Dockerfile` as two services, point `DATABASE_URL` at managed Postgres, and use `alembic upgrade head && python -m app.seed` as the release command. Build the frontend with `VITE_API_BASE_URL=/api` and route `/api/*` to the backend service.

---

## Configuration

Backend configuration is validated by Pydantic Settings and loaded from `backend/.env` or process environment variables. See [`backend/.env.example`](backend/.env.example) for every option and four ready-to-use AI presets.

### Core settings

| Variable | Default | Notes |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `staging`, `production`, `test` |
| `DATABASE_URL` | Postgres URL | Plain `postgres://` / `sqlite://` URLs are upgraded to async drivers automatically |
| `AUTO_CREATE_TABLES` | `false` | Dev convenience; use Alembic in deployed environments |
| `JWT_SECRET` | dev default | **Rotate in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | 24-hour access tokens |
| `CORS_ORIGINS` | localhost Vite origins | Comma-separated |
| `DISPLAY_TIMEZONE` | `Asia/Kolkata` | Interprets admin date filters as local calendar days |
| `SEED_DEFAULT_PASSWORD` | `password123` | Password for seeded authors |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@bookleaf.com` / `password123` | Seeded admin |
| `LOG_LEVEL` | `INFO` | Structured request logs with `X-Request-ID` |

### AI settings

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `mock` | `mock`, `openai`, `anthropic`, `google`, `slm_cloud`, `slm_local` (`gemini` is an alias) |
| `AI_BASE_URL` | OpenAI | Any OpenAI-compatible endpoint (Groq, Together, Ollama, vLLM). Ignored for Anthropic; defaults to the Gemini API root for `google` |
| `AI_API_KEY` | empty | Not needed for `mock` or keyless local runtimes. For Google use a key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `AI_MODEL` | `gpt-4o-mini` | Provider-specific model ID. With `AI_PROVIDER=google` the OpenAI default resolves to `gemini-3.8-flash` |
| `AI_TIMEOUT_SECONDS` | `8` | Per-attempt timeout |
| `AI_MAX_RETRIES` | `1` | One immediate retry on transport/5xx errors |
| `AI_TOTAL_TIMEOUT_SECONDS` | `20` | Hard ceiling across retries and fallback |
| `AI_TWO_PASS` | `false` | Optional classify-then-draft flow |
| `AI_FALLBACK_PROVIDER` | empty | Optional second engine (e.g. Groq → local Ollama) |
| `AI_FALLBACK_BASE_URL` / `AI_FALLBACK_MODEL` | empty | Fallback endpoint/model |
| `AI_FALLBACK_API_KEY` | empty | Fallback credentials |

Frontend settings live in `frontend/.env`:

```ini
VITE_API_BASE_URL=/api
VITE_PROXY_TARGET=http://127.0.0.1:8000
```

---

## AI / SLM design

The brief asks for a provider-agnostic AI layer, not a hard dependency on one vendor. The implementation separates **policy** from **transport**:

1. **Provider factory** (`app/services/ai_service.py`)
   - OpenAI, Groq/Together, Ollama and vLLM all speak the OpenAI Chat Completions protocol; only base URL, model and key change.
   - Anthropic uses its native messages API.
   - Google AI Studio (Gemini) uses the native `generateContent` REST API over `httpx` — `POST /v1beta/models/{model}:generateContent` with an `x-goog-api-key` header, a `systemInstruction` block and `responseMimeType: application/json` for schema-bound output. No extra SDK dependency.
   - A provider without credentials is never called; the service falls back to the deterministic rules engine.
2. **Strict JSON contract**
   - The model must return `{ "category": ..., "priority": ..., "draft_response": ... }` (plus optional confidence/rationale).
   - JSON extraction tolerates markdown fences, surrounding prose and trailing commas.
   - Values are validated against the API enums; malformed output degrades rather than creating an invalid row.
3. **Resilience**
   - 8-second per-attempt timeout, configurable retry (default 1), and a total request ceiling.
   - Optional dual-engine fallback on timeout/429/5xx/validation failure.
   - Any final failure creates the ticket with `General Inquiry` / `Medium`, `ai_classified=false`, no draft, and a short `ai_error` for admins.
4. **Context, not a giant prompt**
   - The prompt receives only the author, the selected book (or a compact catalogue summary), the ticket text and a category-specific knowledge-base slice.
   - `regenerate-draft` re-sends only the requested category slice, not the whole KB.
   - Optional two-pass mode: a cheap classification call followed by a category-scoped drafting call.
5. **Offline demo engine**
   - `AI_PROVIDER=mock` runs `RuleEngine` (`bookleaf-rules-v1`): deterministic keyword/category/priority scoring plus context-aware drafts for royalty, printing, distribution, production, ISBN and general inquiries.
   - This keeps the demo fully reproducible without API keys while the real provider path remains production code.

| `AI_PROVIDER` | Wire protocol | Key required | Example `AI_MODEL` |
| --- | --- | --- | --- |
| `openai` | OpenAI Chat Completions | Yes | `gpt-4o-mini` |
| `anthropic` | Anthropic Messages (native SDK) | Yes | `claude-3-5-haiku-latest` |
| `google` / `gemini` | Gemini `generateContent` (REST via `httpx`) | Yes | `gemini-3.8-flash` |
| `slm_cloud` | OpenAI-compatible (Groq/Together) | Yes | `llama-3.1-8b-instant` |
| `slm_local` | OpenAI-compatible (Ollama/vLLM) | No | `llama3.2:3b` |
| `mock` | Local deterministic rule engine | No | `bookleaf-rules-v1` |

Switching providers is an `.env` change only. Any configured provider that fails is retried and then degraded, so a bad key or an outage never blocks ticket creation.

**What the model is allowed to see** is deliberately narrow. Internal notes are never included in prompts; only public ticket description plus author/book facts are sent. The generated draft is stored on the ticket, returned only to admins, and omitted from every author serialization path.

### Hybrid LLM/SLM strategy: how the ~85% cost reduction is achieved

Support drafting is a good fit for small open-weight models: most tickets fall into a handful of policy categories, and each answer is short and bounded. The economics only work if the prompt is small and the output is machine-parseable, so the portal is built around those two constraints.

1. **Route by difficulty.** Standard categories (royalty status, production stage, availability, general account questions) can run on a hosted 3B–8B SLM such as Llama 3.1 8B or Qwen2.5 7B. Ambiguous or high-stakes cases (ISBN conflicts, multi-book payout disputes) can stay on a frontier model. `AI_PROVIDER`, `AI_BASE_URL` and `AI_MODEL` make that a deployment choice rather than a code change, and `AI_FALLBACK_*` can cascade from cloud to local.
2. **Make the prompt small.** The service never injects all 18 books or the whole policy corpus. It sends the author snapshot, the linked book, the public ticket text and **one category slice** — roughly 250 tokens of KB rules plus tone guidance. A smaller context is the biggest single lever for both SLM accuracy and cost.
3. **Force a schema.** Every provider must return JSON matching `AITriageResult` (`category`, `priority`, `draft_response`, optional confidence/rationale). Markdown fences and trailing commas are stripped, aliases are normalised, and Pydantic validation rejects anything outside the API enums. Invalid output is retried or degraded; it never reaches the database.
4. **Keep humans in the loop.** Drafts are never auto-sent. An admin reviews, edits and explicitly uses the text in a reply. This is both a quality gate and a safety control for smaller models.

On the cost side, a compact prompt plus a short completion on a hosted 8B SLM typically prices at roughly **10–20% of an equivalent frontier-model call** — an ~80–90% reduction, commonly summarised as **~85%** — for the share of volume routed to it. Local Ollama/vLLM goes further: no per-token fee, only compute capacity. The exact saving depends on provider pricing and ticket mix, so the application exposes token/latency counters at `/api/admin/ai/health` and keeps provider selection configurable instead of hard-coding a claim.

The commented default commercial preset is `gpt-4o-mini` because it is inexpensive, fast enough for synchronous triage and reliable at strict JSON; Claude Haiku (`AI_PROVIDER=anthropic`) and Google's `gemini-3.8-flash` (`AI_PROVIDER=google`) are drop-in alternatives. The repository itself defaults to `mock` so reviewers can run the full flow without an API key — switching to a real provider is one environment-variable change.

## API surface

Base prefix: `/api`. Interactive docs: `/docs`; OpenAPI: `/openapi.json`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | public | Email/password → JWT |
| `GET` | `/auth/me` | authenticated | Current user |
| `GET` | `/books` | authenticated | Author's books; admins may filter by `author_id` |
| `GET` | `/books/{id}` | authenticated | One visible book |
| `POST` | `/tickets` | author | Create ticket + synchronous AI triage/draft |
| `GET` | `/tickets` | authenticated | Role-scoped list with filters/pagination |
| `GET` | `/tickets/{id}` | authenticated | Detail + thread (author-safe) |
| `PATCH` | `/tickets/{id}` | admin | Status/category/priority/assignee override |
| `POST` | `/tickets/{id}/messages` | authenticated | Public reply or admin internal note |
| `POST` | `/tickets/{id}/regenerate-draft` | admin | Regenerate draft, optionally scoped to a category |
| `GET` | `/admin/stats` | admin | Queue KPIs and pending royalty total |
| `GET` | `/admin/authors` | admin | Author portfolio overview |
| `GET` | `/admin/ai/health` | admin | Provider mode, usage counters, no secrets |
| `GET` | `/stream?token=...` | authenticated | SSE event stream |
| `GET` | `/health` | public | Liveness + AI/realtime summary |
| `GET` | `/health/ready` | public | Database readiness |

**List filters:** `status`, `category`, `priority`, `date_from`, `date_to` (inclusive calendar days in `DISPLAY_TIMEZONE`), `q` (subject/description/ticket number), `unassigned`, `mine`, `page`, `page_size` (max 100).

**Error envelope:** every application error returns `{ "error": { "code", "message", "details", "request_id" } }` with the appropriate status code.

## Data model

- **User** — `AUTHOR` or `ADMIN`, email unique, bcrypt hash, city/join date.
- **Book** — author-scoped; commercial fields nullable so in-production titles never break rendering.
- **Ticket** — ticket number, author, optional book, subject/description, status, category, priority, assignee, AI metadata (`ai_classified`, `ai_model_used`, `ai_confidence`, `ai_draft_response`, `ai_error`, original `ai_suggested_*`).
- **TicketMessage** — public reply or internal note, sender, timestamp. Internal notes are filtered at serialization time, not hidden in the browser.

Indexes cover the queue (`status, priority, created_at`), author/status lookups, and message ordering. All timestamps are stored UTC via a custom type that also behaves correctly on SQLite.

## Realtime updates

`GET /api/stream?token=<JWT>` returns Server-Sent Events:

- `connected` — channel acknowledgement.
- `ticket.created`, `ticket.updated`, `message.created`, `ping`.

Payloads contain ticket/message **metadata only** — never message bodies — so even a leaked stream cannot expose an internal note. Authors subscribe to `author:{id}`; admins to the shared `admin` channel. The frontend uses `EventSource` and invalidates the relevant TanStack Query caches; polling remains the fallback if the stream is unavailable.

## Testing

From `backend/`:

```bash
pytest
```

The suite bootstraps a dedicated SQLite database, seeds it once, and exercises:

- login, JWT validation, role guards, author scoping, 404 for foreign tickets;
- ticket creation, AI mock classification, draft visibility rules;
- internal-note filtering and author-visible thread contents;
- triage overrides and original AI suggestion preservation;
- assignment/unassignment and `mine` filtering;
- status transitions, author reopen, pagination, search, date-range filtering;
- timezone conversion of local calendar-day filters to UTC boundaries;
- admin stats/authors, AI health without secrets;
- rule-engine determinism, provider factory, graceful degradation, JSON extraction;
- SSE channel isolation and metadata-only encoding.

Type-check and production build the frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

## Database migrations

Alembic is configured for async engines and reads `DATABASE_URL` from application settings, so the same command works for SQLite and Postgres.

```bash
cd backend
alembic upgrade head
alembic current
alembic check          # confirms models and migrations agree
```

To create a new migration after a model change:

```bash
alembic revision --autogenerate -m "describe change"
```

SQLite runs use batch mode (`render_as_batch`) so future `ALTER` migrations remain possible. In production set `AUTO_CREATE_TABLES=false` and always run `alembic upgrade head` before starting the app.

## Production checklist

- [ ] Rotate `JWT_SECRET`; do not ship the development default.
- [ ] Set `ENVIRONMENT=production`, `DEBUG=false`, `AUTO_CREATE_TABLES=false`.
- [ ] Use managed Postgres with backups; run Alembic as a release step.
- [ ] Terminate TLS at the ingress and forward `X-Forwarded-*`.
- [ ] Disable proxy buffering for `/api/stream` (the bundled nginx config does this).
- [ ] Restrict `CORS_ORIGINS` to the real frontend origin.
- [ ] Store AI keys in a secret manager, not `.env` in the image.
- [ ] Add rate limiting / WAF at the edge for login and ticket creation.
- [ ] Decide on AI data-egress policy and retention for prompts/drafts.
- [ ] Add audit logging for internal notes, triage overrides and exports if required.
- [ ] Keep `passlib` pinned with `bcrypt==4.0.1` until hashes are migrated.

## Troubleshooting

**`ZoneInfoNotFoundError` on Windows.** Install `tzdata` (`pip install tzdata`; already pinned in `requirements.txt`). If it is unavailable, the app falls back to a fixed IST offset for `Asia/Kolkata`.

**SSE events arrive in bursts or not at all behind a proxy.** Disable response buffering and raise `proxy_read_timeout` for `/api/stream`; the client falls back to polling after repeated stream errors.

**`asyncpg` build errors.** Use Python 3.11–3.13 for the easiest wheel availability, or build inside the provided Docker image (Python 3.12).

**Postgres connection refused during Compose startup.** The backend waits for the database health check; if you changed credentials, also update `DATABASE_URL` in `docker-compose.yml`.

**Demo data looks mutated after UI testing.** Reseed with `python -m app.seed --reset` (or the Compose equivalent). The seed is idempotent without `--reset`: it updates authors/books and only creates missing demo tickets.

## Assignment coverage

| Requirement | Where |
| --- | --- |
| FastAPI + async SQLAlchemy + Postgres + Pydantic v2 + Alembic | `backend/app`, `backend/alembic` |
| JWT auth and AUTHOR/ADMIN RBAC | `security.py`, `api/deps.py`, `auth/` |
| Full ticket REST API + filters + pagination | `api/tickets.py`, `services/ticket_service.py` |
| AI/SLM provider factory, JSON validation, timeout/retry, degradation, fallback | `services/ai_service.py` |
| Modular KB slices + category-scoped regeneration | `services/kb_context.py`, `services/ai_context.py` |
| SSE realtime with author channel isolation | `api/stream.py`, `services/sse_manager.py` |
| Internal notes and AI draft never exposed to authors | `api/serializers.py`, tests |
| React/Vite/TS/Tailwind/TanStack/Router/Lucide frontend | `frontend/src` |
| One-click demo logins and null-safe in-production books | `LoginPage.tsx`, `BookCard.tsx` |
| ₹1,000 rollover tooltip | `BookCard.tsx` |
| Admin queue filters/urgency sort + split workspace + AI assistant | `pages/admin/*`, `components/admin/*` |
| Idempotent seed with four demo tickets | `app/seed.py` |
| `.env.example` provider presets, README, write-up, tests | repository root / `backend/tests` |
