"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, auth, books, health, stream, tickets
from app.config import settings
from app.errors import register_exception_handlers
from app.logging_config import configure_logging, request_id_var

logger = logging.getLogger(__name__)

OPENAPI_TAGS = [
    {"name": "system", "description": "Health, readiness and runtime configuration."},
    {"name": "auth", "description": "JWT login and current-user lookup."},
    {"name": "books", "description": "Author catalogue with nullable commercial fields."},
    {
        "name": "tickets",
        "description": "Ticket lifecycle, AI triage, AI drafts and threaded messages.",
    },
    {"name": "admin", "description": "Queue KPIs, author overview and AI usage (admin only)."},
    {"name": "realtime", "description": "Server-Sent Events stream for live updates."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    logger.info(
        "starting %s v%s env=%s db=%s",
        settings.app_name,
        settings.app_version,
        settings.environment,
        settings.database_url.split("@")[-1],
    )
    logger.info("ai configuration: %s", settings.safe_summary())
    if settings.is_production and settings.jwt_secret.startswith("dev-only"):
        logger.warning("JWT_SECRET is still the development default - rotate it before launch")
    if not settings.ai_provider_ready:
        logger.warning(
            "AI provider %r has no API key; requests will use the deterministic rule engine",
            settings.ai_provider,
        )

    if settings.auto_create_tables:
        from app.database import init_db

        await init_db()
        logger.info("database schema ensured (AUTO_CREATE_TABLES=true)")

    yield

    from app.database import dispose_engine

    await dispose_engine()
    logger.info("shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title="BookLeaf Author Support & Communication Portal",
        description=(
            "Author support API for BookLeaf Publishing.\n\n"
            "**Highlights**\n"
            "- JWT auth with AUTHOR/ADMIN RBAC; internal notes are stripped server-side.\n"
            "- AI/SLM triage + drafting with strict JSON validation, retries and provider fallback.\n"
            "- Server-Sent Events for live ticket threads, with polling as a client fallback.\n\n"
            "Seeded demo accounts and the full integration guide live in the repository README."
        ),
        version=settings.app_version,
        openapi_tags=OPENAPI_TAGS,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        swagger_ui_parameters={"persistAuthorization": True, "displayRequestDuration": True},
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Response-Time-ms"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=800)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)

        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-ms"] = f"{elapsed_ms:.1f}"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not request.url.path.startswith("/api/stream"):
            logger.info(
                "%s %s -> %s (%.1fms)",
                request.method,
                request.url.path,
                response.status_code,
                elapsed_ms,
            )
        return response

    register_exception_handlers(app)

    for router_module in (health, auth, books, tickets, admin, stream):
        app.include_router(router_module.router, prefix=settings.api_prefix)

    @app.get("/", include_in_schema=False)
    async def root() -> JSONResponse:
        return JSONResponse(
            {
                "service": settings.app_name,
                "version": settings.app_version,
                "docs": "/docs",
                "api": settings.api_prefix,
                "health": f"{settings.api_prefix}/health",
            }
        )

    return app


app = create_app()
