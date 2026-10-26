import type { Review } from "./api";

export const sampleCode = `import requests


def fetch_profile(user_id: str):
    response = requests.get(
        f"https://api.example.com/users/{user_id}"
    )
    return response.json()
`;

// Visual fixtures only. Never returned by the real review API or learning demo.
export const previewReview: Review = {
  id: "visual-fixture",
  created_at: "2026-10-26T12:00:00Z",
  model: "Visual fixture · no model call",
  summary: "One potential reliability issue needs your attention.",
  submission: {
    code: sampleCode,
    filename: "services/profile.py",
    language: "python",
    input_type: "code",
    use_memory: false,
  },
  memory_status: "disabled",
  memories: [],
  applied_memory_ids: [],
  memory_explanation: null,
  findings: [
    {
      title: "Set a timeout on the outgoing request",
      category: "bug",
      severity: "medium",
      file: "services/profile.py",
      start_line: 5,
      end_line: 7,
      explanation:
        "This request has no timeout. A slow upstream could hold the worker indefinitely.",
      suggested_fix:
        "Pass an explicit timeout suited to the service, for example timeout=10.",
      confidence: "high",
      memory_ids: [],
      memory_reason: null,
    },
  ],
};
