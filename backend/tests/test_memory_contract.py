import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.errors import AppError
from app.memory import HindsightMemory
from app.schemas import ConventionInput


def test_adapter_uses_real_sdk_signature_and_strict_scope(settings, monkeypatch):
    client = SimpleNamespace(arecall=AsyncMock(return_value=SimpleNamespace(results=[SimpleNamespace(id="m1", text="Shared client retries")])),
                             aretain=AsyncMock(return_value=SimpleNamespace(success=True)), aclose=AsyncMock())
    settings.hindsight_base_url = "http://test.invalid"
    monkeypatch.setattr("app.memory.Hindsight", lambda **kwargs: client)
    adapter = HindsightMemory(settings)
    result = asyncio.run(adapter.recall("retry conventions"))
    assert result[0].id == "m1"
    params = client.arecall.call_args.kwargs
    assert params["tags_match"] == "all_strict"
    assert params["tags"] == ["project:demo-repository"]
    asyncio.run(adapter.retain("source-1", ConventionInput(lesson="Shared HTTP client already handles retries", context="Only shared_http.get calls")))
    retained = client.aretain.call_args.kwargs
    assert retained["document_id"] == "source-1"
    assert retained["retain_async"] is False
    assert retained["tags"] == params["tags"]
    assert client.aclose.await_count == 2


def test_sdk_rejection_never_becomes_success(settings, monkeypatch):
    settings.hindsight_base_url = "http://test.invalid"
    client = SimpleNamespace(aretain=AsyncMock(return_value=SimpleNamespace(success=False)), aclose=AsyncMock())
    monkeypatch.setattr("app.memory.Hindsight", lambda **kwargs: client)
    with pytest.raises(AppError) as exc:
        asyncio.run(HindsightMemory(settings).retain("source", ConventionInput(lesson="Shared client retries", context="Shared client calls only")))
    assert exc.value.code == "memory_retention_failed"
