import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .schemas import ReviewResult


class Store:
    """Application records only. Learned memory is retained by Hindsight."""

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS conventions (id TEXT PRIMARY KEY, lesson TEXT NOT NULL, context TEXT NOT NULL, status TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS feedback (review_id TEXT, finding_index INTEGER, action TEXT, reason TEXT,
                  PRIMARY KEY(review_id, finding_index));
                CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, review_id TEXT, title TEXT NOT NULL,
                  updated_at TEXT NOT NULL, messages TEXT NOT NULL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def save_review(self, review: ReviewResult):
        with self.connect() as db:
            db.execute("INSERT INTO reviews VALUES (?, ?, ?)", (review.id, review.created_at, review.model_dump_json()))

    def get_review(self, review_id: str) -> ReviewResult | None:
        with self.connect() as db:
            row = db.execute("SELECT payload FROM reviews WHERE id=?", (review_id,)).fetchone()
        return ReviewResult.model_validate_json(row[0]) if row else None

    def list_reviews(self):
        with self.connect() as db:
            rows = db.execute("SELECT id,created_at,payload FROM reviews ORDER BY created_at DESC LIMIT 50").fetchall()
        return [{"id": r[0], "created_at": r[1], "filename": json.loads(r[2])["submission"]["filename"],
                 "summary": json.loads(r[2])["summary"]} for r in rows]

    def save_convention(self, source_id, lesson, context, status):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO conventions VALUES (?,?,?,?)", (source_id, lesson, context, status))

    def conventions(self):
        with self.connect() as db:
            rows = db.execute("SELECT id,lesson,context,status FROM conventions ORDER BY rowid DESC LIMIT 50").fetchall()
        return [dict(zip(("id", "lesson", "context", "status"), row)) for row in rows]

    def save_feedback(self, review_id, feedback):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO feedback VALUES (?,?,?,?)", (review_id, feedback.finding_index, feedback.action, feedback.reason))

    def get_feedback(self, review_id):
        with self.connect() as db:
            rows = db.execute("SELECT finding_index,action,reason FROM feedback WHERE review_id=? ORDER BY finding_index", (review_id,)).fetchall()
        return [dict(zip(("finding_index", "action", "reason"), row)) for row in rows]

    def save_conversation(self, conversation_id, review_id, title, updated_at, messages):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO conversations VALUES (?,?,?,?,?)",
                       (conversation_id, review_id, title, updated_at, json.dumps(messages)))

    def get_conversation(self, conversation_id):
        with self.connect() as db:
            row = db.execute("SELECT id,review_id,title,updated_at,messages FROM conversations WHERE id=?", (conversation_id,)).fetchone()
        if not row:
            return None
        return {"id": row[0], "review_id": row[1], "title": row[2], "updated_at": row[3], "messages": json.loads(row[4])}

    def list_conversations(self):
        with self.connect() as db:
            rows = db.execute("SELECT id,review_id,title,updated_at FROM conversations ORDER BY updated_at DESC LIMIT 30").fetchall()
        return [dict(zip(("id", "review_id", "title", "updated_at"), row)) for row in rows]
