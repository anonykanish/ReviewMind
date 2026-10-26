"use client";

import { useEffect, useRef, useState } from "react";
import {
  api,
  type Convention,
  type HistoryItem,
  type Review,
  type Status,
} from "@/lib/api";
import { previewReview, sampleCode } from "@/lib/samples";
import Copilot from "@/components/copilot";
import MemoryLab from "@/components/memory-lab";
import { downloadReview } from "@/lib/export";

type View = "review" | "history" | "memory" | "settings" | "chat" | "lab";
type Phase = "idle" | "loading" | "success" | "empty" | "error";

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function Workbench({
  previewMode = false,
}: {
  previewMode?: boolean;
}) {
  const [view, setView] = useState<View>("review");
  const [code, setCode] = useState("");
  const [filename, setFilename] = useState("services/profile.py");
  const [language, setLanguage] = useState("python");
  const [inputType, setInputType] = useState<"code" | "diff">("code");
  const [useMemory, setUseMemory] = useState(false);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [conventions, setConventions] = useState<Convention[]>([]);
  const [lesson, setLesson] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [severityFilter, setSeverityFilter] = useState("all");
  const upload = useRef<HTMLInputElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const busy = phase === "loading";

  function invalidateResult() {
    setResult(null);
    setPhase("idle");
    setFeedback({});
    setReasons({});
    setError("");
    setSeverityFilter("all");
  }

  function openReview(review: Review) {
    setResult(review);
    setCode(review.submission.code);
    setFilename(review.submission.filename);
    setLanguage(review.submission.language);
    setInputType(review.submission.input_type);
    setUseMemory(review.submission.use_memory);
    setFeedback({});
    setReasons({});
    setSeverityFilter("all");
    setPhase(review.findings.length ? "success" : "empty");
    setView("review");
  }

  useEffect(() => {
    if (previewMode) return;
    api<Status>("/api/status", token)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [token, previewMode]);

  async function navigate(next: View) {
    setView(next);
    setError("");
    setNotice("");
    if (previewMode) return;
    try {
      if (next === "history")
        setHistory(await api<HistoryItem[]>("/api/reviews", token));
      if (next === "memory")
        setConventions(await api<Convention[]>("/api/conventions", token));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runReview() {
    setPhase("loading");
    setError("");
    setNotice("");
    setResult(null);
    setFeedback({});
    setReasons({});
    try {
      const review = await api<Review>("/api/reviews", token, {
        code,
        filename,
        language,
        input_type: inputType,
        use_memory: useMemory,
      });
      setResult(review);
      setSeverityFilter("all");
      setPhase(review.findings.length ? "success" : "empty");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
    }
  }

  async function teach(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<{ message: string }>("/api/conventions", token, {
        lesson,
        context,
      });
      setNotice(saved.message);
      setLesson("");
      setContext("");
      setConventions(await api<Convention[]>("/api/conventions", token));
    } catch (err) {
      setError((err as Error).message);
      setConventions(
        await api<Convention[]>("/api/conventions", token).catch(() => []),
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendFeedback(index: number, action: string) {
    if (!result || previewMode) return;
    setError("");
    try {
      await api(`/api/reviews/${result.id}/feedback`, token, {
        finding_index: index,
        action,
        reason: reasons[index] || "",
      });
      setFeedback((previous) => ({ ...previous, [index]: action }));
      setNotice(
        "Feedback saved. Use Team memory to explicitly teach a scoped lesson.",
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function preview(next: Phase) {
    setCode(sampleCode);
    setPhase(next);
    setResult(
      next === "success"
        ? previewReview
        : next === "empty"
          ? {
              ...previewReview,
              findings: [],
              summary: "No actionable findings in this visual fixture.",
            }
          : null,
    );
    setError(
      next === "error"
        ? "Sample error: the review provider timed out. Try a smaller submission."
        : "",
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <Mark />
          <span>
            ReviewMind<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">R</span>
          <span>
            Engineering workspace
            <small>{status?.project_id || "Local development"}</small>
          </span>
          <span className="workspace-arrow">⌄</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              ["review", "⌘", "New review"],
              ["chat", "✳", "Copilot"],
              ["lab", "⇄", "Memory Lab"],
              ["history", "◷", "Review history"],
              ["memory", "▧", "Team memory"],
              ["settings", "⚙", "Settings"],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
              {id === "review" && <span className="nav-plus">+</span>}
            </button>
          ))}
        </nav>
        <div className="memory-note">
          <span className="tiny-label">BUILT TO REMEMBER</span>
          <h3>Good reviews get better.</h3>
          <p>
            Keep the reasoning behind your team’s decisions close to the code.
          </p>
          <button onClick={() => navigate("memory")}>
            Explore team memory <span>↗</span>
          </button>
        </div>
        <div className="sidebar-footer">
          <span
            className={`status-dot ${status?.memory_configured ? "online" : ""}`}
          />
          <span>
            Hindsight{" "}
            {status?.memory_configured ? "configured" : "not configured"}
          </span>
          <small>v0.2</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            <strong>
              {
                {
                  review: "New review",
                  history: "Review history",
                  memory: "Team memory",
                  settings: "Settings",
                  chat: "Copilot",
                  lab: "Memory Lab",
                }[view]
              }
            </strong>
          </span>
          <div className="topbar-actions">
            <span className="local-tag">
              {status?.llm_configured
                ? "PROVIDER CONFIGURED"
                : "LOCAL WORKSPACE"}
            </span>
            <button
              className="copilot-shortcut"
              onClick={() => navigate("chat")}
            >
              ✳ Ask Copilot
            </button>
          </div>
        </header>
        <div className="main-content">
          {previewMode && (
            <div className="preview-banner">
              <strong>
                Visual preview only · fixtures, no AI or Hindsight calls
              </strong>
              <div>
                {(
                  ["idle", "loading", "success", "empty", "error"] as Phase[]
                ).map((state) => (
                  <button key={state} onClick={() => preview(state)}>
                    {state}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              <strong>Couldn’t complete that request.</strong>
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="alert notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                ×
              </button>
            </div>
          )}

          {view === "review" && (
            <>
              <div className="page-heading review-hero">
                <div>
                  <div className="eyebrow">THE REVIEWER THAT REMEMBERS</div>
                  <h1>
                    Better code.
                    <br />
                    <em>One lesson at a time.</em>
                  </h1>
                  <p>
                    Find the issues that matter. Keep the reasoning behind your
                    decisions. Build on what your team already knows.
                  </p>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="hero-core">✳</div>
                  <span className="orbit-label label-code">&lt;/&gt; code</span>
                  <span className="orbit-label label-memory">▧ memory</span>
                  <span className="orbit-label label-insight">↗ insight</span>
                </div>
              </div>
              <div className="feature-strip">
                <button onClick={() => navigate("memory")}>
                  <span className="feature-icon">▧</span>
                  <span>
                    <strong>Teach your conventions</strong>
                    <small>Decisions that stay with the team</small>
                  </span>
                  <b>↗</b>
                </button>
                <button onClick={() => navigate("lab")}>
                  <span className="feature-icon">⇄</span>
                  <span>
                    <strong>See memory in action</strong>
                    <small>Compare two real reviews</small>
                  </span>
                  <b>↗</b>
                </button>
                <button onClick={() => navigate("chat")}>
                  <span className="feature-icon">✳</span>
                  <span>
                    <strong>Talk through a fix</strong>
                    <small>Your review, in a conversation</small>
                  </span>
                  <b>↗</b>
                </button>
              </div>
              <div className="review-grid">
                <section
                  className="panel editor-panel"
                  aria-labelledby="source-heading"
                >
                  <div className="panel-header">
                    <div>
                      <span className="section-number">01</span>
                      <h2 id="source-heading">Your code</h2>
                    </div>
                    <div className="segmented">
                      <button
                        className={inputType === "code" ? "selected" : ""}
                        onClick={() => {
                          setInputType("code");
                          invalidateResult();
                        }}
                        disabled={busy}
                      >
                        Code
                      </button>
                      <button
                        className={inputType === "diff" ? "selected" : ""}
                        onClick={() => {
                          setInputType("diff");
                          invalidateResult();
                        }}
                        disabled={busy}
                      >
                        Diff
                      </button>
                    </div>
                  </div>
                  <div className="editor-options">
                    <label>
                      FILE PATH
                      <input
                        value={filename}
                        onChange={(e) => {
                          setFilename(e.target.value);
                          invalidateResult();
                        }}
                        maxLength={200}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      LANGUAGE
                      <select
                        value={language}
                        onChange={(e) => {
                          setLanguage(e.target.value);
                          invalidateResult();
                        }}
                        disabled={busy}
                      >
                        <option value="python">Python</option>
                        <option value="typescript">TypeScript</option>
                        <option value="javascript">JavaScript</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                  </div>
                  <div className="editor">
                    <div
                      className="line-numbers"
                      aria-hidden="true"
                      ref={gutter}
                    >
                      {(code || "\n\n\n\n\n\n\n\n\n\n\n\n\n\n")
                        .split("\n")
                        .map((_, i) => (
                          <span key={i}>{i + 1}</span>
                        ))}
                    </div>
                    <textarea
                      aria-label="Source code or unified diff"
                      onScroll={(event) => {
                        if (gutter.current)
                          gutter.current.scrollTop =
                            event.currentTarget.scrollTop;
                      }}
                      spellCheck={false}
                      onKeyDown={(e) => {
                        if (
                          (e.ctrlKey || e.metaKey) &&
                          e.key === "Enter" &&
                          !busy &&
                          code.trim() &&
                          !previewMode
                        ) {
                          e.preventDefault();
                          void runReview();
                        }
                      }}
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        invalidateResult();
                      }}
                      disabled={busy}
                      placeholder={
                        "// Paste your code here.\n// A fresh perspective starts with a few lines."
                      }
                    />
                  </div>
                  <div className="editor-footer">
                    <span>
                      {code.split("\n").length} lines{" "}
                      <span className="slash">·</span>{" "}
                      {new Blob([code]).size.toLocaleString()} / 100,000 bytes
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => upload.current?.click()}
                    >
                      ↑ Upload file
                    </button>
                    <input
                      ref={upload}
                      type="file"
                      className="visually-hidden"
                      accept=".py,.ts,.tsx,.js,.jsx,.diff,.patch,.txt"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 100_000) {
                          setError("Choose a file under 100 KB.");
                          return;
                        }
                        const text = await file.text();
                        if (text.includes("\0")) {
                          setError("Choose a text code file.");
                          return;
                        }
                        setCode(text);
                        setFilename(file.name);
                        setResult(null);
                        setPhase("idle");
                        if (/\.(diff|patch)$/.test(file.name))
                          setInputType("diff");
                        else {
                          setInputType("code");
                          setLanguage(
                            file.name.endsWith(".py")
                              ? "python"
                              : /\.tsx?$/.test(file.name)
                                ? "typescript"
                                : /\.jsx?$/.test(file.name)
                                  ? "javascript"
                                  : "other",
                          );
                        }
                      }}
                    />
                  </div>
                  <div className="run-area">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setCode(sampleCode);
                        setFilename("services/profile.py");
                        setLanguage("python");
                        setInputType("code");
                        invalidateResult();
                      }}
                    >
                      Load example code
                    </button>
                    <button
                      className="primary"
                      onClick={runReview}
                      disabled={busy || !code.trim() || previewMode}
                    >
                      {busy ? (
                        <>
                          <span className="spinner" /> Reviewing…
                        </>
                      ) : (
                        <>
                          Review code <span className="key-hint">Ctrl ↵</span>
                        </>
                      )}
                    </button>
                  </div>
                </section>
                <aside className="context-column">
                  <section className="context-card">
                    <div className="card-overline">
                      <span className="memory-icon">▧</span> CONTEXT MAKES THE
                      DIFFERENCE
                    </div>
                    <h2>
                      A reviewer that knows
                      <br /> how your team works.
                    </h2>
                    <p>
                      Bring past decisions into this review with relevant
                      lessons recalled from Hindsight.
                    </p>
                    <label className="toggle-row">
                      <span>
                        <strong>Use team memory</strong>
                        <small>
                          {status?.memory_configured
                            ? "Recall relevant project conventions"
                            : "Requires Hindsight configuration"}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={useMemory}
                        onChange={(e) => {
                          setUseMemory(e.target.checked);
                          invalidateResult();
                        }}
                        disabled={busy}
                      />
                      <span className="toggle" aria-hidden="true" />
                    </label>
                    <div className="context-footnote">
                      {useMemory
                        ? "Memory failures are reported. No silent fallback."
                        : "Baseline review · no memory is retrieved."}
                    </div>
                  </section>
                  <section className="coverage">
                    <h3>WHAT WE LOOK FOR</h3>
                    {[
                      ["◇", "Bugs & logic errors"],
                      ["⌁", "Security risks"],
                      ["↗", "Performance problems"],
                      ["≋", "Team conventions"],
                    ].map(([icon, text]) => (
                      <div key={text}>
                        <span aria-hidden="true">{icon}</span>
                        {text}
                        <span className="coverage-check">✓</span>
                      </div>
                    ))}
                    <p>
                      AI findings are suggestions. Review the reasoning before
                      making changes.
                    </p>
                  </section>
                </aside>
              </div>

              <section className="results" aria-live="polite" aria-busy={busy}>
                <div className="results-title">
                  <div>
                    <span className="section-number">02</span>
                    <h2>Review findings</h2>
                    {result && (
                      <span className="count">{result.findings.length}</span>
                    )}
                  </div>
                  <span className="muted">
                    {result ? result.model : "Your next step, made clearer."}
                  </span>
                </div>
                {phase === "idle" && (
                  <div className="empty-state">
                    <Mark small />
                    <h3>A fresh perspective is one review away.</h3>
                    <p>
                      Add code above to get actionable findings and the context
                      behind them.
                    </p>
                  </div>
                )}
                {busy && (
                  <div className="loading-state">
                    <span className="spinner dark" />
                    <h3>Reading between the lines…</h3>
                    <p>
                      {useMemory
                        ? "Recalling relevant conventions, then analyzing your code."
                        : "Analyzing your code and validating the findings."}
                    </p>
                    <div className="skeleton" />
                    <div className="skeleton short" />
                  </div>
                )}
                {phase === "error" && (
                  <div className="empty-state">
                    <span className="failure-symbol">!</span>
                    <h3>No review was generated.</h3>
                    <p>
                      Resolve the error above and try again. No sample results
                      have been substituted.
                    </p>
                    <button
                      className="secondary"
                      onClick={runReview}
                      disabled={previewMode}
                    >
                      Try again
                    </button>
                  </div>
                )}
                {result && (
                  <>
                    <div className="review-tools">
                      <div
                        className="filter-chips"
                        aria-label="Filter findings by severity"
                      >
                        {["all", "critical", "high", "medium", "low", "info"]
                          .filter(
                            (level) =>
                              level === "all" ||
                              result.findings.some((f) => f.severity === level),
                          )
                          .map((level) => (
                            <button
                              key={level}
                              aria-pressed={severityFilter === level}
                              className={
                                severityFilter === level ? "active" : ""
                              }
                              onClick={() => setSeverityFilter(level)}
                            >
                              {level}
                            </button>
                          ))}
                      </div>
                      <div className="export-actions">
                        <button onClick={() => downloadReview(result, "md")}>
                          ↓ Markdown
                        </button>
                        <button onClick={() => downloadReview(result, "json")}>
                          ↓ JSON
                        </button>
                        <button onClick={() => navigate("chat")}>
                          ✳ Discuss review
                        </button>
                      </div>
                    </div>
                    <div className="review-summary">
                      <p>{result.summary}</p>
                      <span className="memory-pill">
                        {result.memory_status === "disabled"
                          ? "Baseline · memory off"
                          : `${result.memories.length} memories recalled`}
                      </span>
                    </div>
                    {result.memory_explanation && (
                      <div className="memory-explanation">
                        <strong>How memory influenced this review</strong>
                        <p>{result.memory_explanation}</p>
                      </div>
                    )}
                    {phase === "empty" && (
                      <div className="empty-state compact">
                        <span className="clear-symbol">✓</span>
                        <h3>No actionable findings returned.</h3>
                        <p>
                          This review found no issues to report. It does not
                          guarantee the code is defect-free.
                        </p>
                      </div>
                    )}
                    {result.findings.map(
                      (finding, index) =>
                        (severityFilter === "all" ||
                          finding.severity === severityFilter) && (
                          <article
                            className="finding"
                            key={`${finding.title}-${index}`}
                          >
                            <div className="finding-top">
                              <span className={`severity ${finding.severity}`}>
                                {finding.severity}
                              </span>
                              <span>{finding.category}</span>
                              <span className="finding-location">
                                {finding.file}:{finding.start_line}
                                {finding.end_line !== finding.start_line
                                  ? `–${finding.end_line}`
                                  : ""}
                              </span>
                            </div>
                            <h3>{finding.title}</h3>
                            <p>{finding.explanation}</p>
                            <details>
                              <summary>
                                Suggested fix <span>↓</span>
                              </summary>
                              <pre>{finding.suggested_fix}</pre>
                            </details>
                            {finding.memory_reason && (
                              <p className="memory-reason">
                                Memory context: {finding.memory_reason}
                              </p>
                            )}
                            <div className="finding-bottom">
                              <span>
                                {finding.confidence} confidence · AI estimate
                              </span>
                              <div>
                                {["accepted", "rejected", "fixed"].map(
                                  (action) => (
                                    <button
                                      key={action}
                                      onClick={() =>
                                        sendFeedback(index, action)
                                      }
                                      disabled={previewMode}
                                      className={
                                        feedback[index] === action
                                          ? "feedback-selected"
                                          : ""
                                      }
                                    >
                                      {action === "accepted"
                                        ? "Accept"
                                        : action === "rejected"
                                          ? "Reject"
                                          : "Mark fixed"}
                                    </button>
                                  ),
                                )}
                              </div>
                            </div>
                            <input
                              className="reason-input"
                              aria-label={`Feedback reason for finding ${index + 1}`}
                              placeholder="Reason or context (required to reject)"
                              value={reasons[index] || ""}
                              onChange={(e) =>
                                setReasons((previous) => ({
                                  ...previous,
                                  [index]: e.target.value,
                                }))
                              }
                            />
                          </article>
                        ),
                    )}
                    {result.memories.length > 0 && (
                      <details className="evidence">
                        <summary>
                          Inspect recalled lessons ({result.memories.length})
                        </summary>
                        {result.memories.map((memory) => (
                          <div key={memory.id}>
                            <span className="memory-pill">
                              {result.applied_memory_ids.includes(memory.id)
                                ? "Cited as influential"
                                : "Retrieved context"}
                            </span>
                            <p>{memory.text}</p>
                            <code>{memory.id}</code>
                          </div>
                        ))}
                      </details>
                    )}
                  </>
                )}
              </section>
            </>
          )}

          {view === "chat" && (
            <Copilot
              key={token}
              token={token}
              review={result}
              previewMode={previewMode}
              onTeach={(text, scope) => {
                setLesson(text);
                setContext(scope);
                void navigate("memory");
              }}
            />
          )}
          {view === "lab" && (
            <MemoryLab
              token={token}
              previewMode={previewMode}
              submission={{
                code,
                filename,
                language,
                input_type: inputType,
                use_memory: useMemory,
              }}
              onOpenReview={openReview}
              onEdit={() => navigate("review")}
            />
          )}

          {view === "history" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">DECISIONS, KEPT IN CONTEXT</div>
                  <h1>Review history.</h1>
                  <p>
                    Revisit the code, findings, and evidence behind each review.
                  </p>
                </div>
              </div>
              <section className="panel list-panel">
                {history.length === 0 ? (
                  <div className="empty-state">
                    <h3>No saved reviews yet.</h3>
                    <p>Your completed reviews will appear here.</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <button
                      className="history-row"
                      key={item.id}
                      onClick={async () => {
                        try {
                          const review = await api<Review>(
                            `/api/reviews/${item.id}`,
                            token,
                          );
                          const saved = await api<
                            {
                              finding_index: number;
                              action: string;
                              reason: string;
                            }[]
                          >(`/api/reviews/${item.id}/feedback`, token);
                          openReview(review);
                          setFeedback(
                            Object.fromEntries(
                              saved.map((entry) => [
                                entry.finding_index,
                                entry.action,
                              ]),
                            ),
                          );
                          setReasons(
                            Object.fromEntries(
                              saved.map((entry) => [
                                entry.finding_index,
                                entry.reason,
                              ]),
                            ),
                          );
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    >
                      <strong>{item.filename}</strong>
                      <span>{item.summary}</span>
                      <small>
                        {new Date(item.created_at).toLocaleString()}
                      </small>
                      <span>↗</span>
                    </button>
                  ))
                )}
              </section>
            </>
          )}

          {view === "memory" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THE REASON BEHIND THE RULE</div>
                  <h1>Teach once. Review with context.</h1>
                  <p>
                    Save explicit conventions with the boundaries that make them
                    useful.
                  </p>
                </div>
              </div>
              <div className="memory-grid">
                <form className="panel teaching-form" onSubmit={teach}>
                  <h2>Teach a convention</h2>
                  <p>
                    Retained through the real Hindsight API for{" "}
                    <strong>
                      {status?.project_id || "the configured project"}
                    </strong>
                    .
                  </p>
                  <label>
                    WHAT SHOULD THE REVIEWER REMEMBER?
                    <textarea
                      required
                      minLength={10}
                      maxLength={3000}
                      value={lesson}
                      onChange={(e) => setLesson(e.target.value)}
                      placeholder="Our shared HTTP client already handles retries. Avoid adding a second retry loop at call sites."
                    />
                  </label>
                  <label>
                    WHEN DOES THIS APPLY?
                    <textarea
                      required
                      minLength={5}
                      maxLength={1000}
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="Calls through shared_http.get only. Direct requests calls still need their own reliability policy."
                    />
                  </label>
                  <button className="primary" disabled={saving || previewMode}>
                    {saving
                      ? "Retaining in Hindsight…"
                      : "Retain convention ↗"}
                  </button>
                  <small>
                    Only a confirmed Hindsight response is marked retained.
                    Local records are an audit trail, not agent memory.
                  </small>
                </form>
                <section className="panel lessons">
                  <h2>Convention sources</h2>
                  <p className="muted">
                    Explicit lessons submitted from this workspace.
                  </p>
                  {conventions.length === 0 ? (
                    <div className="empty-state compact">
                      <h3>A clean slate.</h3>
                      <p>Teach your first convention to begin.</p>
                    </div>
                  ) : (
                    conventions.map((item) => (
                      <article key={item.id}>
                        <span className={`retention ${item.status}`}>
                          {item.status}
                        </span>
                        <h3>{item.lesson}</h3>
                        <p>{item.context}</p>
                        <code>{item.id}</code>
                      </article>
                    ))
                  )}
                </section>
              </div>
            </>
          )}

          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR WORKSPACE, WIRED UP</div>
                  <h1>Configuration.</h1>
                  <p>
                    Keep provider credentials on the backend. Never paste
                    provider keys here.
                  </p>
                </div>
              </div>
              <section className="panel settings">
                <h2>Service configuration</h2>
                <div>
                  <span>Review provider</span>
                  <strong>
                    {status?.llm_configured
                      ? "Configured"
                      : "Not configured / status unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Model</span>
                  <strong>{status?.model || "Set LLM_MODEL"}</strong>
                </div>
                <div>
                  <span>Hindsight</span>
                  <strong>
                    {status?.memory_configured
                      ? "Configured"
                      : "Not configured / status unavailable"}
                  </strong>
                </div>
                <p>
                  Configuration presence is not proof of a live connection.
                  Configure services in <code>backend/.env</code> and restart
                  FastAPI.
                </p>
                <label>
                  APPLICATION ACCESS TOKEN (OPTIONAL)
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Only if API_TOKEN is configured on the backend"
                    autoComplete="off"
                  />
                </label>
                <small>
                  This token stays in this page’s memory and is cleared on
                  reload.
                </small>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <Mark small /> Code deserves context.
            </span>
            <span>
              Powered by Hindsight memory <span className="slash">/</span>{" "}
              ReviewMind
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
