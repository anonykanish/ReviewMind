from datetime import datetime, timezone
from uuid import uuid4

from .analysis import line_map, validate_findings
from .errors import AppError
from .schemas import ConventionInput, FeedbackInput, ReviewInput, ReviewResult


class ReviewService:
    def __init__(self, settings, provider, memory, store):
        self.settings, self.provider, self.memory, self.store = settings, provider, memory, store

    async def review(self, submission: ReviewInput):
        files = line_map(submission)
        memories = []
        if submission.use_memory:
            memories = await self.memory.recall(
                f"Review conventions and architectural decisions relevant to {submission.language}, {submission.filename}.\nCode or diff:\n{submission.code[:12000]}")
        draft = await self.provider.generate(submission, memories, files)
        draft = validate_findings(draft, files, {m.id for m in memories})
        result = ReviewResult(**draft.model_dump(), id=str(uuid4()), created_at=datetime.now(timezone.utc).isoformat(),
            submission=submission, memories=memories, model=self.settings.llm_model,
            memory_status=("recalled" if memories else "no_matches") if submission.use_memory else "disabled")
        self.store.save_review(result)
        return result


class FeedbackService:
    def __init__(self, store):
        self.store = store

    def record(self, review_id: str, feedback: FeedbackInput):
        review = self.store.get_review(review_id)
        if not review or feedback.finding_index >= len(review.findings):
            raise AppError("finding_not_found", "The selected review finding does not exist.", 404)
        self.store.save_feedback(review_id, feedback)
        return {"saved": True, "learned": False, "message": "Feedback recorded. Teach an explicit scoped convention to retain a lesson."}


class ConventionService:
    def __init__(self, store, memory):
        self.store, self.memory = store, memory

    async def teach(self, convention: ConventionInput):
        source_id = "convention-" + str(uuid4())
        self.store.save_convention(source_id, convention.lesson, convention.context, "pending")
        try:
            await self.memory.retain(source_id, convention)
        except AppError:
            self.store.save_convention(source_id, convention.lesson, convention.context, "failed")
            raise
        self.store.save_convention(source_id, convention.lesson, convention.context, "retained")
        return {"id": source_id, "status": "retained", "message": "Hindsight confirmed retention. Recall relevance is checked on the next review."}
