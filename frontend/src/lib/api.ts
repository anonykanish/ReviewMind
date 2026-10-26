export type Finding = {
  title: string;
  category: string;
  severity: string;
  file: string;
  start_line: number;
  end_line: number;
  explanation: string;
  suggested_fix: string;
  confidence: string;
  memory_ids: string[];
  memory_reason: string | null;
};
export type Submission = {
  code: string;
  filename: string;
  language: string;
  input_type: "code" | "diff";
  use_memory: boolean;
};
export type Review = {
  id: string;
  created_at: string;
  summary: string;
  findings: Finding[];
  applied_memory_ids: string[];
  memory_explanation: string | null;
  memories: { id: string; text: string }[];
  memory_status: "disabled" | "recalled" | "no_matches";
  model: string;
  submission: Submission;
};
export type Status = {
  llm_configured: boolean;
  memory_configured: boolean;
  project_id: string;
  model: string | null;
};
export type HistoryItem = {
  id: string;
  created_at: string;
  filename: string;
  summary: string;
};
export type Convention = {
  id: string;
  lesson: string;
  context: string;
  status: string;
};

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function api<T>(
  path: string,
  token: string,
  body?: unknown,
  timeout = 190_000,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  }).catch(() => {
    throw new Error(
      "Cannot reach the backend. Check that FastAPI is running and the API URL is correct.",
    );
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      payload?.error?.message || `Request failed (${response.status}).`,
    );
  return payload as T;
}
