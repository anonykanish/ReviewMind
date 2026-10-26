from datetime import datetime, timezone
from uuid import uuid4

from .errors import AppError
from .schemas import ChatInput, ChatResult


class ChatService:
    """Server-owned conversation history; chat can recall but never retain lessons."""

    def __init__(self, provider, memory, store):
        self.provider, self.memory, self.store = provider, memory, store

    async def respond(self, payload: ChatInput):
        conversation = self.store.get_conversation(payload.conversation_id) if payload.conversation_id else None
        if payload.conversation_id and not conversation:
            raise AppError("conversation_not_found", "Conversation not found.", 404)
        if conversation and conversation["review_id"] != payload.review_id:
            raise AppError("chat_context_changed", "Start a new conversation to change the attached review.", 409)
        review = self.store.get_review(payload.review_id) if payload.review_id else None
        if payload.review_id and not review:
            raise AppError("review_not_found", "The attached review no longer exists.", 404)
        messages = conversation["messages"] if conversation else []
        if len(messages) >= 100:
            raise AppError("conversation_full", "Start a new conversation after 50 exchanges.", 422)
        memories = []
        if payload.use_memory:
            context = f"\nFile: {review.submission.filename}\nCode: {review.submission.code[:8000]}" if review else ""
            memories = await self.memory.recall(payload.message + context)
        # Strip UI evidence fields from history, keeping a bounded context window.
        history = [{"role": m["role"], "content": m["content"]} for m in messages[-12:]]
        draft = await self.provider.chat(payload.message, history, review, memories)
        available = {m.id for m in memories}
        if not set(draft.memory_ids) <= available:
            raise AppError("invalid_memory_citation", "The assistant cited unavailable memory. Try again.", 502)
        result = ChatResult(**draft.model_dump(), conversation_id=payload.conversation_id or str(uuid4()),
            memories=[m for m in memories if m.id in draft.memory_ids],
            memory_status=("recalled" if memories else "no_matches") if payload.use_memory else "disabled")
        messages = messages + [{"role": "user", "content": payload.message},
            {"role": "assistant", "content": result.answer, "memories": [m.model_dump() for m in result.memories],
             "memory_status": result.memory_status}]
        self.store.save_conversation(result.conversation_id, payload.review_id,
            conversation["title"] if conversation else payload.message[:80], datetime.now(timezone.utc).isoformat(), messages)
        return result
