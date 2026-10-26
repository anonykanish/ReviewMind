import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewMarkdown } from "../src/lib/export.ts";
import type { Review } from "../src/lib/api.ts";

test("Markdown preserves evidence provenance and avoids exporting source by default", () => {
  const review: Review = {
    id: "test-review", created_at: "2026-10-26", model: "test-only", summary: "Inspect timeout.",
    submission: { code: "PRIVATE_SOURCE", filename: "client.py", language: "python", input_type: "code", use_memory: true },
    findings: [{ title: "Timeout", category: "bug", severity: "high", file: "client.py", start_line: 2, end_line: 3,
      explanation: "The request may block.", suggested_fix: "Specify timeout.", confidence: "high", memory_ids: ["lesson-123"], memory_reason: "The shared client needs an explicit timeout." }],
    memories: [{ id: "lesson-123", text: "Only the shared client's retry loop is built in." }],
    applied_memory_ids: ["lesson-123"], memory_explanation: "Avoided duplicate retries for this shared client.", memory_status: "recalled",
  };
  const text = reviewMarkdown(review);
  assert.match(text, /client.py:2–3/);
  assert.match(text, /lesson-123/);
  assert.match(text, /Avoided duplicate retries/);
  assert.match(text, /Only the shared client's retry loop/);
  assert.doesNotMatch(text, /PRIVATE_SOURCE/);
});
