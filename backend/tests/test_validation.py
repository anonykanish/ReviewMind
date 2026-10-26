import pytest
from pydantic import ValidationError

from app.analysis import line_map, validate_findings
from app.errors import AppError
from app.schemas import Finding, ReviewInput


@pytest.mark.parametrize("code", ["", " \n\t", "x\x00", "x" * 100001, "x\n" * 2001, "é" * 50001], ids=["empty", "whitespace", "null-byte", "too-many-characters", "too-many-lines", "too-many-utf8-bytes"])
def test_rejects_invalid_code(code):
    with pytest.raises(ValidationError):
        ReviewInput(code=code)


@pytest.mark.parametrize("filename", ["../secret", "/etc/passwd", "C:\\secret", "a/../b", "a//b"])
def test_rejects_unsafe_paths(filename):
    with pytest.raises(ValidationError):
        ReviewInput(code="x", filename=filename)


def test_preserves_code_and_normalizes_path():
    submission = ReviewInput(code="  x\n\n", filename="src\\test.py")
    assert submission.code == "  x\n\n"
    assert line_map(submission) == {"src/test.py": {1, 2}}


@pytest.mark.parametrize("change", [{"severity": "catastrophic"}, {"start_line": 0}, {"end_line": 0},
    {"start_line": 2, "end_line": 1}, {"confidence": "100%"}, {"start_line": "1"},
    {"memory_ids": ["fake"]}, {"memory_reason": "uncited"}, {"extra": "bad"}])
def test_finding_schema(finding, change):
    with pytest.raises(ValidationError):
        Finding.model_validate({**finding.model_dump(), **change})


@pytest.mark.parametrize("change", [{"end_line": 2}, {"file": "other.py"}, {"end_line": 10**15},
    {"memory_ids": ["unknown"], "memory_reason": "Claimed memory"}])
def test_rejects_invalid_finding_references(draft, finding, change):
    bad = finding.model_copy(update=change)
    with pytest.raises(AppError, match="model"):
        validate_findings(draft.model_copy(update={"findings": [bad]}), {"example.py": {1}}, set())


def test_removes_overlapping_same_issue_but_keeps_other_issues(draft, finding):
    duplicate = finding.model_copy(update={"title": "MISSING timeout!", "end_line": 2})
    other = finding.model_copy(update={"title": "Unhandled response status"})
    clean = validate_findings(draft.model_copy(update={"findings": [finding, duplicate, other]}), {"example.py": {1, 2}}, set())
    assert len(clean.findings) == 2


def test_unknown_review_level_memory_is_rejected(draft):
    with pytest.raises(AppError):
        validate_findings(draft.model_copy(update={"applied_memory_ids": ["unknown"], "memory_explanation": "Used"}), {"example.py": {1}}, set())


def test_diff_maps_only_added_new_file_lines():
    diff = "--- a/a.py\n+++ b/a.py\n@@ -1,2 +1,3 @@\n old\n-removed\n+new\n+added\n"
    assert line_map(ReviewInput(code=diff, input_type="diff")) == {"a.py": {2, 3}}


@pytest.mark.parametrize("diff", ["not a diff", "--- a/a.py\n+++ b/a.py\n@@ nonsense\n+x", "--- a/a.py\n+++ b/a.py\n@@ -1 +1,2 @@\n+x",
    "--- a/a.py\n+++ b/../x\n@@ -1 +1 @@\n-a\n+b", "--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-a\n+b\n+extra"])
def test_rejects_malformed_diff(diff):
    with pytest.raises(AppError):
        line_map(ReviewInput(code=diff, input_type="diff"))


def test_diff_finding_cannot_target_unchanged_lines(draft):
    with pytest.raises(AppError):
        validate_findings(draft, {"example.py": {2}}, set())
