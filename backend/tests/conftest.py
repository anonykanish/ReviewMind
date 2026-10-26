import pytest

from app.config import Settings
from app.schemas import Finding, ReviewDraft


@pytest.fixture
def settings(tmp_path):
    return Settings(_env_file=None, database_path=tmp_path / "reviews.db", llm_api_key="test-only", llm_model="test-model")


@pytest.fixture
def finding():
    return Finding(title="Missing timeout", category="bug", severity="medium", file="example.py",
        start_line=1, end_line=1, explanation="The network request may block.", suggested_fix="Set a timeout.",
        confidence="medium", memory_ids=[], memory_reason=None)


@pytest.fixture
def draft(finding):
    return ReviewDraft(summary="Potential reliability issue.", findings=[finding], applied_memory_ids=[], memory_explanation=None)
