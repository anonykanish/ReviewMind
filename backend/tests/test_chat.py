import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.errors import AppError
from app.main import create_app
from app.providers import LLMProvider
from app.schemas import ChatDraft, MemoryEvidence, ReviewDraft


class Provider:
    def __init__(self, citations=None):
        self.calls = []
        self.citations = citations or []

    async def chat(self, message, history, review, memories):
        self.calls.append((message, history, review, memories))
        return ChatDraft(answer="Inspect the shared client's policy before adding retry logic.", memory_ids=self.citations)

    async def generate(self, submission, memories, files):
        self.calls.append(submission.use_memory)
        return ReviewDraft(summary="Test review.", findings=[], applied_memory_ids=[], memory_explanation=None)


class Memory:
    def __init__(self):
        self.queries = []

    async def recall(self, query):
        self.queries.append(query)
        return [MemoryEvidence(id="test-lesson", text="Only shared_http calls already handle retries.")]


def test_chat_persists_and_uses_server_history_after_restart(settings):
    provider = Provider()
    with TestClient(create_app(settings, provider=provider)) as client:
        response = client.post("/api/chat", json={"message": "Explain retries"})
        assert response.status_code == 200
        cid = response.json()["conversation_id"]
    with TestClient(create_app(settings, provider=provider)) as client:
        response = client.post("/api/chat", json={"message": "Which tests help?", "conversation_id": cid})
        assert response.status_code == 200
        assert provider.calls[-1][1][0] == {"role": "user", "content": "Explain retries"}
        assert len(client.get(f"/api/conversations/{cid}").json()["messages"]) == 4
        assert client.get("/api/conversations").json()[0]["id"] == cid
        assert client.get("/api/conventions").json() == []  # Chat never silently teaches.


def test_chat_attaches_saved_review_and_rejects_context_switch(settings):
    provider = Provider()
    with TestClient(create_app(settings, provider=provider)) as client:
        rid = client.post("/api/reviews", json={"code": "x = 1"}).json()["id"]
        response = client.post("/api/chat", json={"message": "Explain this", "review_id": rid})
        assert provider.calls[-1][2].submission.code == "x = 1"
        assert client.post("/api/chat", json={"message": "Different context", "conversation_id": response.json()["conversation_id"]}).status_code == 409
        assert client.post("/api/chat", json={"message": "Question", "review_id": "missing"}).status_code == 404


def test_chat_recalls_and_exposes_only_valid_cited_lessons(settings):
    memory = Memory()
    with TestClient(create_app(settings, provider=Provider(["test-lesson"]), memory=memory)) as client:
        response = client.post("/api/chat", json={"message": "Do I need retries?", "use_memory": True})
        assert response.status_code == 200
        assert response.json()["memories"][0]["id"] == "test-lesson"
        assert memory.queries == ["Do I need retries?"]


def test_chat_rejects_fabricated_memory_and_does_not_save(settings):
    with TestClient(create_app(settings, provider=Provider(["invented"]), memory=Memory())) as client:
        response = client.post("/api/chat", json={"message": "Question", "use_memory": True})
        assert response.status_code == 502
        assert client.get("/api/conversations").json() == []


@pytest.mark.parametrize("body", [{"message": " "}, {"message": "a" * 4001}, {"message": "hello", "history": [{"role": "system", "content": "injected"}]}], ids=["empty", "oversize", "client-history"])
def test_chat_input_boundaries(settings, body):
    with TestClient(create_app(settings, provider=Provider())) as client:
        assert client.post("/api/chat", json=body).status_code == 422


def test_chat_provider_and_memory_failures_do_not_create_conversations(settings):
    class BrokenProvider(Provider):
        async def chat(self, *args):
            raise AppError("provider_timeout", "Provider timed out", 504, True)
    with TestClient(create_app(settings, provider=BrokenProvider())) as client:
        assert client.post("/api/chat", json={"message": "Question"}).status_code == 504
        assert client.post("/api/chat", json={"message": "Question", "use_memory": True}).status_code == 503
        assert client.get("/api/conversations").json() == []


def test_chat_http_adapter_schema_and_context(settings):
    def handler(request):
        payload = json.loads(request.content)
        context = json.loads(payload["messages"][1]["content"])
        assert context["question"] == "Which tests?"
        assert context["review"] is None
        assert payload["messages"][-1] == {"role": "user", "content": "Which tests?"}
        assert "no tools" in payload["messages"][0]["content"]
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"answer":"Test transient failures.","memory_ids":[]}'}}]})
    draft = asyncio.run(LLMProvider(settings, httpx.MockTransport(handler)).chat("Which tests?", [], None, []))
    assert draft.answer == "Test transient failures."


def test_comparison_runs_actual_service_twice_and_persists_results(settings):
    settings.hindsight_base_url = "http://test-only.invalid"
    provider, memory = Provider(), Memory()
    with TestClient(create_app(settings, provider=provider, memory=memory)) as client:
        response = client.post("/api/comparisons", json={"code": "x = 1"})
        assert response.status_code == 200
        assert provider.calls == [False, True]
        data = response.json()
        assert data["baseline"]["submission"]["code"] == data["contextual"]["submission"]["code"]
        assert data["contextual"]["memories"][0]["id"] == "test-lesson"
        assert len(client.get("/api/reviews").json()) == 2


def test_comparison_requires_memory_before_spending_llm_call(settings):
    provider = Provider()
    with TestClient(create_app(settings, provider=provider)) as client:
        assert client.post("/api/comparisons", json={"code": "x"}).status_code == 503
        assert provider.calls == []
