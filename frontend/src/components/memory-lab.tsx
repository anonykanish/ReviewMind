"use client";
import { useState } from "react";
import { api, type Review, type Submission } from "@/lib/api";

type Comparison = { baseline: Review; contextual: Review; note: string };
export default function MemoryLab({
  submission,
  token,
  previewMode,
  onOpenReview,
  onEdit,
}: {
  submission: Submission;
  token: string;
  previewMode: boolean;
  onOpenReview: (review: Review) => void;
  onEdit: () => void;
}) {
  const [result, setResult] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await api<Comparison>("/api/comparisons", token, submission, 380_000),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE THE MEMORY VISIBLE</div>
          <h1>Same code. More context.</h1>
          <p>
            Compare a baseline review with a review informed by your team’s
            lessons.
          </p>
        </div>
        <span className="feature-badge">MEMORY LAB</span>
      </div>
      <section className="lab-intro panel">
        <div>
          <span className="lab-symbol" aria-hidden="true">
            ⇄
          </span>
          <h2>A small experiment in better reasoning.</h2>
          <p>
            Run two real reviews of the same code. Inspect the findings, then
            follow the recalled evidence to see what the model says it used.
          </p>
        </div>
        <div className="lab-input">
          <span>CURRENT EDITOR INPUT</span>
          <strong>{submission.filename}</strong>
          <small>
            {submission.input_type} · {submission.code.split("\n").length} lines
          </small>
          <button className="chip-button" onClick={onEdit} disabled={busy}>
            Edit source ↗
          </button>
        </div>
        <div className="lab-run">
          <button
            className="primary"
            onClick={run}
            disabled={busy || !submission.code.trim() || previewMode}
          >
            {busy ? (
              <>
                <span className="spinner" />
                Comparing…
              </>
            ) : (
              "Run comparison ⇄"
            )}
          </button>
          <small>
            Uses two LLM calls + Hindsight recall. Both reviews are saved in
            history.
          </small>
        </div>
      </section>
      {error && (
        <div className="alert error" role="alert">
          <strong>Comparison could not complete.</strong>
          {error}
          <span>
            If the first review completed, it is still available in Review
            history.
          </span>
        </div>
      )}
      {busy && (
        <div className="loading-state" role="status">
          <div className="spinner dark" />
          <h3>First the baseline. Then the context.</h3>
          <p>Both runs use your actual source and configured services.</p>
          <div className="skeleton" />
          <div className="skeleton short" />
        </div>
      )}
      {result ? (
        <>
          <div className="lab-notice">{result.note}</div>
          <div className="comparison-grid">
            {[result.baseline, result.contextual].map((review, i) => (
              <section
                className={`panel comparison-card ${i ? "with-memory" : ""}`}
                key={review.id}
              >
                <div className="comparison-head">
                  <span className="eyebrow">
                    {i ? "B · WITH TEAM MEMORY" : "A · BASELINE"}
                  </span>
                  <span>{review.findings.length} findings</span>
                </div>
                <h2>{i ? "Context in the loop." : "A fresh pair of eyes."}</h2>
                <p>{review.summary}</p>
                <div className="comparison-counts">
                  <span>
                    <strong>{review.memories.length}</strong> recalled
                  </span>
                  <span>
                    <strong>{review.applied_memory_ids.length}</strong> cited as
                    influential
                  </span>
                </div>
                {review.memory_explanation && (
                  <div className="memory-explanation">
                    <strong>What memory changed, according to the model</strong>
                    <p>{review.memory_explanation}</p>
                  </div>
                )}
                {review.findings.map((finding, n) => (
                  <div className="comparison-finding" key={n}>
                    <span className={`severity ${finding.severity}`}>
                      {finding.severity}
                    </span>
                    <strong>{finding.title}</strong>
                    <small>
                      {finding.file}:{finding.start_line}
                    </small>
                  </div>
                ))}
                {!review.findings.length && (
                  <p className="lab-clear">No actionable findings returned.</p>
                )}
                {review.memories.map((memory) => (
                  <details className="lab-evidence" key={memory.id}>
                    <summary>
                      {review.applied_memory_ids.includes(memory.id)
                        ? "Influential lesson"
                        : "Retrieved lesson"}{" "}
                      · {memory.id.slice(0, 8)}
                    </summary>
                    <p>{memory.text}</p>
                    <code>{memory.id}</code>
                  </details>
                ))}
                <button
                  className="secondary"
                  onClick={() => onOpenReview(review)}
                >
                  Open full review ↗
                </button>
              </section>
            ))}
          </div>
        </>
      ) : (
        !busy && (
          <div className="lab-path">
            <div>
              <span>01</span>
              <h3>Teach a bounded lesson</h3>
              <p>Define the component and the exceptions in Team memory.</p>
            </div>
            <div>
              <span>02</span>
              <h3>Review identical input</h3>
              <p>
                One run without memory. One run with scoped Hindsight recall.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>Inspect the evidence</h3>
              <p>
                Check citations and reasoning, including lessons that avoided a
                finding.
              </p>
            </div>
          </div>
        )
      )}
    </>
  );
}
