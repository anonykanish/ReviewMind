import re

from .errors import AppError
from .schemas import ReviewDraft, ReviewInput


def line_map(submission: ReviewInput) -> dict[str, set[int]]:
    if submission.input_type == "code":
        return {submission.filename: set(range(1, len(submission.code.splitlines()) + 1))}
    files: dict[str, set[int]] = {}
    file = None
    new_line = 0
    old_left = new_left = 0
    saw_hunk = False
    for line in submission.code.splitlines():
        if line.startswith("@@"):
            match = re.match(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            if not match or not file or old_left or new_left:
                raise AppError("invalid_diff", "Malformed unified diff hunk.", 422)
            new_line = int(match[3])
            old_left, new_left = int(match[2] or 1), int(match[4] or 1)
            saw_hunk = True
        elif old_left or new_left:
            if line.startswith("\\ No newline"):
                continue
            if line.startswith("+"):
                if new_line > 0:
                    files[file].add(new_line)
                new_line += 1
                new_left -= 1
            elif line.startswith("-"):
                old_left -= 1
            elif line.startswith(" "):
                new_line += 1
                old_left -= 1
                new_left -= 1
            else:
                raise AppError("invalid_diff", "Diff hunk lines need a space, +, or - prefix.", 422)
            if old_left < 0 or new_left < 0:
                raise AppError("invalid_diff", "Diff hunk counts do not match its content.", 422)
        elif line.startswith("+++ "):
            path = line[4:].split("\t")[0]
            file = None if path == "/dev/null" else path.removeprefix("b/")
            if file:
                try:
                    file = ReviewInput.safe_filename(file)
                except ValueError:
                    raise AppError("invalid_diff", "Unsafe path in diff.", 422) from None
                files.setdefault(file, set())
        elif line and line[0] in {"+", " "} and not line.startswith("+++ "):
            raise AppError("invalid_diff", "Unexpected content outside a diff hunk.", 422)
    if old_left or new_left or not saw_hunk or not any(files.values()):
        raise AppError("invalid_diff", "Submit a complete unified diff with added lines; deletion-only diffs are not supported yet.", 422)
    return files


def validate_findings(draft: ReviewDraft, files: dict[str, set[int]], memory_ids: set[str]) -> ReviewDraft:
    clean = []
    for finding in draft.findings:
        lines = files.get(finding.file, set())
        if finding.end_line - finding.start_line > 2000 or not all(line in lines for line in range(finding.start_line, finding.end_line + 1)):
            raise AppError("invalid_findings", "The model referenced lines outside the submitted code or added diff lines.")
        if not set(finding.memory_ids) <= memory_ids:
            raise AppError("invalid_findings", "The model referenced memory that was not retrieved.")
        title = re.sub(r"\W+", "", finding.title.casefold())
        duplicate = any(
            prior.file == finding.file and prior.category == finding.category
            and re.sub(r"\W+", "", prior.title.casefold()) == title
            and prior.start_line <= finding.end_line and finding.start_line <= prior.end_line
            for prior in clean
        )
        if not duplicate:
            clean.append(finding)
    if not set(draft.applied_memory_ids) <= memory_ids:
        raise AppError("invalid_findings", "The model claimed to apply an unknown memory.")
    return draft.model_copy(update={"findings": clean})
