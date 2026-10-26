import asyncio
import json

import httpx
import pytest

from app.errors import AppError
from app.providers import LLMProvider
from app.schemas import ReviewInput


def run(provider):
    return asyncio.run(provider.generate(ReviewInput(code="requests.get(url)"), [], {"example.py": {1}}))


def test_real_adapter_parses_mock_http_response(settings, draft):
    def handler(request):
        body = json.loads(request.content)
        assert body["model"] == "test-model"
        assert body["response_format"] == {"type": "json_object"}
        assert "UNTRUSTED DATA" in body["messages"][0]["content"]
        return httpx.Response(200, json={"choices": [{"message": {"content": draft.model_dump_json()}}]})
    assert run(LLMProvider(settings, httpx.MockTransport(handler))).findings[0].title == "Missing timeout"


@pytest.mark.parametrize("status,code", [(401, "provider_error"), (429, "provider_rate_limit"), (500, "provider_error")])
def test_provider_http_failures_are_sanitized(settings, status, code):
    with pytest.raises(AppError) as exc:
        run(LLMProvider(settings, httpx.MockTransport(lambda _: httpx.Response(status, text="secret-provider-error"))))
    assert exc.value.code == code
    assert "secret-provider-error" not in str(exc.value)


def test_provider_timeout(settings):
    def handler(request):
        raise httpx.ReadTimeout("sensitive transport error", request=request)
    with pytest.raises(AppError) as exc:
        run(LLMProvider(settings, httpx.MockTransport(handler)))
    assert exc.value.code == "provider_timeout"


def test_provider_connection_failure(settings):
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)
    with pytest.raises(AppError) as exc:
        run(LLMProvider(settings, httpx.MockTransport(handler)))
    assert exc.value.code == "provider_unavailable"


def test_invalid_output_retries_once_then_fails(settings):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "not JSON"}}]})
    with pytest.raises(AppError) as exc:
        run(LLMProvider(settings, httpx.MockTransport(handler)))
    assert exc.value.code == "invalid_provider_output"
    assert len(calls) == 2


def test_invalid_output_can_recover(settings, draft):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={} if len(calls) == 1 else {"choices": [{"message": {"content": draft.model_dump_json()}}]})
    assert run(LLMProvider(settings, httpx.MockTransport(handler))).summary == draft.summary
    assert len(calls) == 2


def test_no_key_is_an_explicit_configuration_failure(settings):
    from pydantic import SecretStr
    settings.llm_api_key = SecretStr("")
    with pytest.raises(AppError) as exc:
        run(LLMProvider(settings))
    assert exc.value.code == "llm_not_configured"
