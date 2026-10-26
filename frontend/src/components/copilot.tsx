"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Review } from "@/lib/api";
import { createSpeechSession, speechConstructor } from "@/lib/speech";

type Message = {
  role: "user" | "assistant";
  content: string;
  memories?: { id: string; text: string }[];
  memory_status?: string;
};
type Conversation = {
  id: string;
  review_id: string | null;
  title: string;
  messages: Message[];
};
type Reply = {
  answer: string;
  conversation_id: string;
  memories: { id: string; text: string }[];
  memory_status: string;
};

export default function Copilot({
  token,
  review,
  previewMode,
  onTeach,
}: {
  token: string;
  review: Review | null;
  previewMode: boolean;
  onTeach: (lesson: string, context: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(review?.id || null);
  const [recent, setRecent] = useState<Conversation[]>([]);
  const [useMemory, setUseMemory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speechLanguage, setSpeechLanguage] = useState("en-IN");
  const session = useRef<ReturnType<typeof createSpeechSession> | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSpeechAvailable(Boolean(speechConstructor()));
    if (!previewMode)
      api<Conversation[]>("/api/conversations", token)
        .then(setRecent)
        .catch((err) => setError(err.message));
    return () => session.current?.dispose();
  }, [token, previewMode]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  function dictate() {
    if (listening) {
      session.current?.stop();
      return;
    }
    const Constructor = speechConstructor();
    if (!Constructor) return;
    session.current?.dispose();
    const original = draft.trim();
    setError("");
    setListening(true);
    session.current = createSpeechSession(Constructor, speechLanguage, {
      transcript: (final, partial) => {
        setDraft([original, final].filter(Boolean).join(" "));
        setInterim(partial);
      },
      error: setError,
      end: () => {
        setListening(false);
        setInterim("");
        input.current?.focus();
      },
    });
    session.current.start();
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy || listening || previewMode) return;
    const question = draft.trim();
    setBusy(true);
    setError("");
    try {
      const reply = await api<Reply>("/api/chat", token, {
        message: question,
        conversation_id: conversationId,
        review_id: reviewId,
        use_memory: useMemory,
      });
      setConversationId(reply.conversation_id);
      setMessages((previous) => [
        ...previous,
        { role: "user", content: question },
        {
          role: "assistant",
          content: reply.answer,
          memories: reply.memories,
          memory_status: reply.memory_status,
        },
      ]);
      setDraft("");
      setRecent(
        await api<Conversation[]>("/api/conversations", token).catch(
          () => recent,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THINK IT THROUGH, TOGETHER</div>
          <h1>Your code. A conversation.</h1>
          <p>
            A second perspective on fixes, tradeoffs, and the decisions your
            team remembers.
          </p>
        </div>
        <span className="feature-badge">
          {speechAvailable ? "VOICE INPUT AVAILABLE" : "REVIEW COPILOT"}
        </span>
      </div>
      <div className="copilot-layout">
        <section className="panel chat-panel" aria-label="Review copilot">
          <div className="chat-header">
            <span className="copilot-orb" aria-hidden="true">
              ✳
            </span>
            <div>
              <h2>ReviewMind Copilot</h2>
              <small>
                {reviewId
                  ? "Saved review attached"
                  : "General conversation · no code attached"}
              </small>
            </div>
            <button
              className="chip-button"
              disabled={busy || listening}
              onClick={() => {
                setConversationId(null);
                setMessages([]);
                setReviewId(review?.id || null);
                setError("");
                setDraft("");
              }}
            >
              New chat +
            </button>
          </div>
          <div
            className="chat-messages"
            role="log"
            aria-label="Conversation"
            aria-live="polite"
          >
            {!messages.length && (
              <div className="chat-welcome">
                <div className="orb-large">✳</div>
                <h2>Let’s get to the why.</h2>
                <p>
                  Explore a finding, plan a safer fix, or check how a team
                  convention applies.
                </p>
                <div className="prompt-grid">
                  {[
                    "Explain the highest-priority finding and a minimal fix.",
                    "Which tests would verify this change?",
                    "When should a shared HTTP client handle retries?",
                    "Which recalled lessons influenced this review?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      disabled={busy}
                      onClick={() => {
                        setDraft(prompt);
                        input.current?.focus();
                      }}
                    >
                      {prompt}
                      <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, i) => (
              <article className={`chat-message ${message.role}`} key={i}>
                <span className="message-author">
                  {message.role === "user" ? "YOU" : "✳ REVIEWMIND"}
                </span>
                <div className="message-body">{message.content}</div>
                {!!message.memories?.length && (
                  <details className="chat-citations">
                    <summary>
                      {message.memories.length} cited project lesson
                      {message.memories.length > 1 ? "s" : ""}
                    </summary>
                    {message.memories.map((memory) => (
                      <div key={memory.id}>
                        <p>{memory.text}</p>
                        <code>{memory.id}</code>
                      </div>
                    ))}
                  </details>
                )}
                {message.role === "assistant" && !message.memories?.length && (
                  <small className="chat-memory-status">
                    {message.memory_status === "disabled"
                      ? "Memory was off"
                      : message.memory_status === "no_matches"
                        ? "No relevant lessons recalled"
                        : "No recalled lesson cited in this answer"}
                  </small>
                )}
                {message.role === "user" && (
                  <button
                    className="teach-link"
                    disabled={busy || listening}
                    onClick={() =>
                      onTeach(
                        message.content.slice(0, 3000),
                        reviewId
                          ? `Applies to the pattern discussed in saved review ${reviewId}. Specify the exact component and exceptions before retaining.`
                          : "",
                      )
                    }
                  >
                    Turn into a lesson →
                  </button>
                )}
              </article>
            ))}
            {busy && (
              <div className="chat-thinking" role="status">
                <span className="spinner dark" />
                {useMemory
                  ? "Recalling project context and thinking…"
                  : "Thinking through your question…"}
              </div>
            )}
            <div ref={end} />
          </div>
          {error && (
            <div className="chat-error" role="alert">
              {error}
            </div>
          )}
          <form className="chat-composer" onSubmit={send}>
            {listening && (
              <div className="listening" role="status">
                <span />
                Listening… {interim || "Speak, then stop to edit your message."}
              </div>
            )}
            <textarea
              ref={input}
              aria-label="Message to copilot"
              placeholder="Ask about your review, or use the mic…"
              value={draft}
              maxLength={4000}
              disabled={busy || listening}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-actions">
              <button
                type="button"
                className={`mic-button ${listening ? "recording" : ""}`}
                onClick={dictate}
                disabled={!speechAvailable || busy || previewMode}
                aria-pressed={listening}
                aria-label={listening ? "Stop dictation" : "Start dictation"}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
                </svg>
                {listening ? "Stop" : "Dictate"}
              </button>
              <select
                aria-label="Speech language"
                value={speechLanguage}
                onChange={(e) => setSpeechLanguage(e.target.value)}
                disabled={listening}
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi</option>
                <option value="en-US">English (US)</option>
              </select>
              <span className="composer-count">{draft.length}/4,000</span>
              <button
                className="primary"
                disabled={busy || listening || !draft.trim() || previewMode}
              >
                Send ↑
              </button>
            </div>
            <p className="speech-note">
              {speechAvailable
                ? "Your browser handles speech and may send audio to its speech service. Nothing is sent to chat until you press Send."
                : "Speech recognition isn’t available in this browser. Try a supported Chrome or Edge browser, or type here."}
            </p>
          </form>
        </section>
        <aside className="chat-context">
          <section className="panel">
            <div className="eyebrow">IN THIS CONVERSATION</div>
            <h3>Context, on your terms.</h3>
            <label className="chat-check">
              <input
                type="checkbox"
                checked={useMemory}
                disabled={busy}
                onChange={(e) => setUseMemory(e.target.checked)}
              />
              Recall team memory
            </label>
            <p>
              Search Hindsight for lessons scoped to this project with every
              message. Cited lessons appear beside the answer.
            </p>
            <div className="attachment-card">
              <span>
                {reviewId ? "↳ ATTACHED REVIEW" : "○ NO REVIEW ATTACHED"}
              </span>
              <strong>
                {reviewId === review?.id
                  ? review?.submission.filename
                  : reviewId
                    ? "Previously saved review"
                    : "Ask a general code question"}
              </strong>
              {reviewId && <code>{reviewId.slice(0, 8)}</code>}
            </div>
            <p>
              New chats attach the current completed review. Editor changes are
              not sent automatically.
            </p>
          </section>
          <section className="panel recent-chats">
            <div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div>
            <h3>Recent conversations</h3>
            {!recent.length && (
              <p>Completed conversations are saved locally.</p>
            )}
            {recent.map((item) => (
              <button
                key={item.id}
                disabled={busy || listening || previewMode}
                onClick={async () => {
                  try {
                    const saved = await api<Conversation>(
                      `/api/conversations/${item.id}`,
                      token,
                    );
                    setMessages(saved.messages);
                    setConversationId(saved.id);
                    setReviewId(saved.review_id);
                    setDraft("");
                    setError("");
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                {item.title}
                <span>↗</span>
              </button>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
