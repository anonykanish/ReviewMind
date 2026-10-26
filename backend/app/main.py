import asyncio
import secrets
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .chat import ChatService
from .errors import AppError
from .memory import HindsightMemory
from .providers import LLMProvider
from .schemas import ChatInput, ComparisonResult, ConventionInput, FeedbackInput, ReviewInput
from .services import ConventionService, FeedbackService, ReviewService
from .storage import Store


def create_app(settings: Settings | None = None, provider=None, memory=None, store=None):
    settings = settings or Settings()
    store = store or Store(settings.database_path)
    memory = memory or HindsightMemory(settings)
    provider = provider or LLMProvider(settings)
    service = ReviewService(settings, provider, memory, store)
    chat_service = ChatService(provider, memory, store)
    chat_slot = asyncio.Semaphore(1)
    feedback = FeedbackService(store)
    conventions = ConventionService(store, memory)
    slots = asyncio.Semaphore(2)
    app = FastAPI(title="ReviewMind", version="0.1.0")
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "Authorization"])

    def failure(code, message, status, request_id, retryable=False):
        return JSONResponse(status_code=status, content={"error": {"code": code, "message": message,
            "request_id": request_id, "retryable": retryable}})

    @app.middleware("http")
    async def guard(request: Request, call_next):
        request.state.request_id = str(uuid4())
        if request.url.path != "/health" and request.method != "OPTIONS":
            token = settings.api_token.get_secret_value()
            if token and not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + token):
                return failure("unauthorized", "Provide the configured API access token.", 401, request.state.request_id)
        if request.method == "POST":
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 120_000:
                    return failure("input_too_large", "Request exceeds the 120 KB transport limit.", 413, request.state.request_id)
            request._body = bytes(body)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request.state.request_id
            return response
        except Exception:
            return failure("internal_error", "The request could not be completed. Retry or check local service configuration.", 500, request.state.request_id)

    @app.exception_handler(AppError)
    async def app_error(request, exc):
        return failure(exc.code, exc.message, exc.status, request.state.request_id, exc.retryable)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        # Never echo Pydantic's raw input: it can contain submitted source or secrets.
        details = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())
        return failure("invalid_input", details[:1200], 422, request.state.request_id)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/status")
    async def status():
        return {"llm_configured": settings.llm_configured, "memory_configured": settings.memory_configured,
                "project_id": settings.project_id, "model": settings.llm_model or None,
                "note": "Configuration presence is not a live connection check."}

    @app.post("/api/reviews")
    async def review(submission: ReviewInput):
        try:
            await asyncio.wait_for(slots.acquire(), timeout=0.1)
        except TimeoutError:
            raise AppError("busy", "Two reviews are already running. Try again shortly.", 503, True)
        try:
            return await service.review(submission)
        finally:
            slots.release()

    @app.get("/api/reviews")
    async def history():
        return store.list_reviews()

    @app.post("/api/comparisons")
    async def compare(submission: ReviewInput):
        if not settings.memory_configured:
            raise AppError("memory_not_configured", "Configure Hindsight before running Memory Lab.", 503)
        try:
            await asyncio.wait_for(slots.acquire(), timeout=0.1)
        except TimeoutError:
            raise AppError("busy", "Review capacity is busy. Try again shortly.", 503, True)
        try:
            baseline = await service.review(submission.model_copy(update={"use_memory": False}))
            contextual = await service.review(submission.model_copy(update={"use_memory": True}))
            return ComparisonResult(baseline=baseline, contextual=contextual)
        finally:
            slots.release()

    @app.post("/api/chat")
    async def chat(payload: ChatInput):
        try:
            await asyncio.wait_for(chat_slot.acquire(), timeout=0.1)
        except TimeoutError:
            raise AppError("chat_busy", "The assistant is answering another message. Try again shortly.", 503, True)
        try:
            return await chat_service.respond(payload)
        finally:
            chat_slot.release()

    @app.get("/api/conversations")
    async def conversations_list():
        return store.list_conversations()

    @app.get("/api/conversations/{conversation_id}")
    async def conversation_get(conversation_id: str):
        result = store.get_conversation(conversation_id)
        if not result:
            raise AppError("conversation_not_found", "Conversation not found.", 404)
        return result

    @app.get("/api/reviews/{review_id}")
    async def get_review(review_id: str):
        result = store.get_review(review_id)
        if not result:
            raise AppError("review_not_found", "Review not found.", 404)
        return result

    @app.post("/api/reviews/{review_id}/feedback")
    async def record_feedback(review_id: str, payload: FeedbackInput):
        return feedback.record(review_id, payload)

    @app.get("/api/reviews/{review_id}/feedback")
    async def saved_feedback(review_id: str):
        if not store.get_review(review_id):
            raise AppError("review_not_found", "Review not found.", 404)
        return store.get_feedback(review_id)

    @app.post("/api/conventions")
    async def teach(payload: ConventionInput):
        return await conventions.teach(payload)

    @app.get("/api/conventions")
    async def list_conventions():
        return store.conventions()

    return app
