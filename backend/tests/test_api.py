from fastapi.testclient import TestClient

from app.errors import AppError
from app.main import create_app
from app.schemas import ReviewDraft


class TestProvider:
    __test__ = False
    def __init__(self, draft):
        self.draft = draft
    async def generate(self, submission, memories, files):
        return self.draft


def test_review_flow_persists_across_app_instances(settings, draft):
    with TestClient(create_app(settings, provider=TestProvider(draft))) as client:
        response = client.post("/api/reviews", json={"code": "requests.get(url)"})
        assert response.status_code == 200, response.text
        review_id = response.json()["id"]
        assert response.json()["memory_status"] == "disabled"
        assert client.post(f"/api/reviews/{review_id}/feedback", json={"finding_index": 0, "action": "accepted"}).json()["learned"] is False
        assert client.post(f"/api/reviews/{review_id}/feedback", json={"finding_index": 0, "action": "rejected"}).status_code == 422
        assert client.post(f"/api/reviews/{review_id}/feedback", json={"finding_index": 3, "action": "fixed"}).status_code == 404
    with TestClient(create_app(settings, provider=TestProvider(draft))) as restarted:
        assert restarted.get(f"/api/reviews/{review_id}").json()["submission"]["code"] == "requests.get(url)"
        assert restarted.get(f"/api/reviews/{review_id}/feedback").json() == [
            {"finding_index": 0, "action": "accepted", "reason": ""}
        ]
        assert restarted.get("/api/reviews/missing/feedback").status_code == 404
        assert len(restarted.get("/api/reviews").json()) == 1


def test_empty_findings_are_valid(settings):
    draft = ReviewDraft(summary="No actionable findings.", findings=[], applied_memory_ids=[], memory_explanation=None)
    with TestClient(create_app(settings, provider=TestProvider(draft))) as client:
        assert client.post("/api/reviews", json={"code": "x = 1"}).json()["findings"] == []


def test_validation_errors_do_not_echo_source(settings):
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/reviews", json={"code": "SECRET_SOURCE\x00"})
        assert response.status_code == 422
        assert "SECRET_SOURCE" not in response.text


def test_memory_missing_fails_without_baseline_fallback(settings, draft):
    with TestClient(create_app(settings, provider=TestProvider(draft))) as client:
        response = client.post("/api/reviews", json={"code": "x = 1", "use_memory": True})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "memory_not_configured"
        assert client.get("/api/reviews").json() == []


def test_failed_retention_has_a_failed_audit_record(settings):
    class BrokenMemory:
        async def retain(self, *args):
            raise AppError("memory_retention_failed", "Unavailable", 503)
    with TestClient(create_app(settings, memory=BrokenMemory())) as client:
        assert client.post("/api/conventions", json={"lesson": "Shared client already retries", "context": "Only shared_http calls"}).status_code == 503
        assert client.get("/api/conventions").json()[0]["status"] == "failed"


def test_body_size_limit(settings):
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/reviews", content=b"x" * 120001).status_code == 413


def test_optional_application_access_control(settings):
    from pydantic import SecretStr
    settings.api_token = SecretStr("local-test-token")
    with TestClient(create_app(settings)) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/status").status_code == 401
        assert client.get("/api/status", headers={"Authorization": "Bearer local-test-token"}).status_code == 200


def test_live_provider_failure_is_exposed_as_safe_api_error(settings):
    class BrokenProvider:
        async def generate(self, *args):
            raise AppError("provider_timeout", "Provider timed out", 504, True)
    with TestClient(create_app(settings, provider=BrokenProvider())) as client:
        response = client.post("/api/reviews", json={"code": "x"})
        assert response.status_code == 504
        assert response.json()["error"]["retryable"] is True
        assert response.json()["error"]["request_id"]


def test_both_local_development_origins_allow_browser_requests(settings):
    with TestClient(create_app(settings)) as client:
        for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
            response = client.options("/api/reviews", headers={"Origin": origin,
                "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origin
