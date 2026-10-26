import type { Review } from "./api";

export function reviewMarkdown(review: Review) {
  return [
    "# ReviewMind review",
    "",
    `File: ${review.submission.filename}`,
    `Date: ${review.created_at}`,
    `Model: ${review.model}`,
    `Memory: ${review.memory_status}`,
    "",
    review.summary,
    "",
    "## Memory influence",
    review.memory_explanation || "No lesson cited as influential.",
    "",
    ...review.findings.flatMap((f, i) => [
      `## ${i + 1}. ${f.title}`,
      `Severity: ${f.severity} | Confidence: ${f.confidence}`,
      `Location: ${f.file}:${f.start_line}–${f.end_line}`,
      "",
      f.explanation,
      "",
      "Suggested fix:",
      f.suggested_fix,
      "",
      ...(f.memory_reason
        ? [
            `Memory: ${f.memory_reason}`,
            `Evidence IDs: ${f.memory_ids.join(", ")}`,
            "",
          ]
        : []),
    ]),
    "## Recalled evidence",
    ...review.memories.flatMap((m) => [`### ${m.id}`, m.text, ""]),
    "AI-generated suggestions; verify before applying.",
  ].join("\n");
}

export function downloadReview(review: Review, format: "md" | "json") {
  const content =
    format === "md" ? reviewMarkdown(review) : JSON.stringify(review, null, 2);
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        format === "md" ? "text/markdown;charset=utf-8" : "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reviewmind-${review.id.slice(0, 8)}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
