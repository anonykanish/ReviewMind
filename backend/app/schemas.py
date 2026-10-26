from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ReviewInput(StrictModel):
    # Preserve exact code whitespace for accurate line numbers and diffs.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    code: str = Field(min_length=1, max_length=100_000)
    filename: str = Field(default="example.py", min_length=1, max_length=200)
    language: Literal["python", "typescript", "javascript", "other"] = "python"
    input_type: Literal["code", "diff"] = "code"
    use_memory: bool = False

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not value.strip() or "\x00" in value:
            raise ValueError("Submit nonempty text code without null bytes.")
        if len(value.encode("utf-8")) > 100_000 or len(value.splitlines()) > 2000:
            raise ValueError("Limit each review to 100 KB and 2,000 lines.")
        return value

    @field_validator("filename")
    @classmethod
    def safe_filename(cls, value: str) -> str:
        value = value.replace("\\", "/")
        if value.startswith("/") or ":" in value or any(p in {"..", ".", ""} for p in value.split("/")):
            raise ValueError("Use a relative repository path without traversal.")
        return value


class Finding(StrictModel):
    title: str = Field(min_length=1, max_length=180)
    category: Literal["bug", "security", "performance", "maintainability", "convention"]
    severity: Literal["critical", "high", "medium", "low", "info"]
    file: str = Field(min_length=1, max_length=200)
    start_line: int = Field(ge=1, strict=True)
    end_line: int = Field(ge=1, strict=True)
    explanation: str = Field(min_length=1, max_length=3000)
    suggested_fix: str = Field(min_length=1, max_length=3000)
    confidence: Literal["high", "medium", "low"]
    memory_ids: list[str] = Field(max_length=8)
    memory_reason: str | None = Field(max_length=1500)

    @model_validator(mode="after")
    def coherent(self):
        if self.end_line < self.start_line:
            raise ValueError("Finding end_line precedes start_line.")
        if bool(self.memory_ids) != bool(self.memory_reason):
            raise ValueError("Memory citations require an explanation, and vice versa.")
        return self


class ReviewDraft(StrictModel):
    summary: str = Field(min_length=1, max_length=2000)
    findings: list[Finding] = Field(max_length=25)
    applied_memory_ids: list[str] = Field(max_length=8)
    memory_explanation: str | None = Field(max_length=2000)

    @model_validator(mode="after")
    def coherent(self):
        if bool(self.applied_memory_ids) != bool(self.memory_explanation):
            raise ValueError("Applied memories require a review-level explanation.")
        return self


class MemoryEvidence(StrictModel):
    id: str
    text: str


class ReviewResult(ReviewDraft):
    id: str
    created_at: str
    submission: ReviewInput
    memories: list[MemoryEvidence]
    memory_status: Literal["disabled", "recalled", "no_matches"]
    model: str


class ConventionInput(StrictModel):
    lesson: str = Field(min_length=10, max_length=3000)
    context: str = Field(min_length=5, max_length=1000)


class FeedbackInput(StrictModel):
    finding_index: int = Field(ge=0)
    action: Literal["accepted", "rejected", "fixed"]
    reason: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def rejection_reason(self):
        if self.action == "rejected" and not self.reason.strip():
            raise ValueError("Explain why you rejected this finding.")
        return self


class ChatInput(StrictModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = Field(default=None, max_length=80)
    review_id: str | None = Field(default=None, max_length=80)
    use_memory: bool = False


class ChatDraft(StrictModel):
    answer: str = Field(min_length=1, max_length=12000)
    memory_ids: list[str] = Field(max_length=8)


class ChatResult(ChatDraft):
    conversation_id: str
    memories: list[MemoryEvidence]
    memory_status: Literal["disabled", "recalled", "no_matches"]


class ComparisonResult(StrictModel):
    baseline: ReviewResult
    contextual: ReviewResult
    note: str = "Two independent model runs on identical input. Differences may include model variation; inspect the cited lessons before attributing changes to memory."
