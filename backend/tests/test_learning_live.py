"""Opt-in acceptance test. Never replaces remote services with mocks or expected findings."""
import asyncio
import os
import re
from uuid import uuid4

import pytest
from hindsight_client import Hindsight

from app.config import Settings
from app.memory import HindsightMemory
from app.providers import LLMProvider
from app.schemas import ConventionInput, ReviewInput
from app.services import ConventionService, ReviewService
from app.storage import Store

pytestmark = [pytest.mark.live, pytest.mark.skipif(os.getenv("RUN_LIVE_TESTS") != "1", reason="Set RUN_LIVE_TESTS=1 with real LLM/Hindsight credentials; makes billable calls to configured services.")]

SHARED_CODE = '''from shared_http import client

def fetch_inventory():
    response = client.get("https://supplier.example/inventory", timeout=10)
    response.raise_for_status()
    return response.json()
'''

DIRECT_CODE = '''import requests

def fetch_inventory():
    # Idempotent GET to an upstream known to intermittently return HTTP 503.
    response = requests.get("https://supplier.example/inventory", timeout=10)
    response.raise_for_status()
    return response.json()
'''


def recommends_retry(review):
    return any(re.search(r"\bretr(?:y|ies|ying)\b", f.title + " " + f.suggested_fix, re.I) for f in review.findings)


def test_real_persistent_learning_cycle(tmp_path):
    settings = Settings()
    assert settings.llm_configured, "Configure LLM_API_KEY and LLM_MODEL before running live acceptance."
    assert settings.memory_configured, "Configure a real Hindsight service before running live acceptance."
    # A unique disposable bank: never mutate the user's configured existing memory bank.
    settings.hindsight_bank_id = "reviewmind-acceptance-" + uuid4().hex
    settings.database_path = tmp_path / "acceptance.db"
    asyncio.run(learning_cycle(settings))


async def learning_cycle(settings):
    client = Hindsight(base_url=settings.hindsight_base_url, api_key=settings.hindsight_api_key.get_secret_value() or None,
                       timeout=settings.request_timeout_seconds, max_attempts=1)
    created = False
    try:
        await client.acreate_bank(bank_id=settings.hindsight_bank_id, name="ReviewMind disposable acceptance test")
        created = True
        store = Store(settings.database_path)
        provider, memory = LLMProvider(settings), HindsightMemory(settings)
        service = ReviewService(settings, provider, memory, store)
        shared = ReviewInput(code=SHARED_CODE, filename="inventory.py", use_memory=False)
        baseline = await service.review(shared)
        assert baseline.memory_status == "disabled"
        convention = ConventionInput(lesson="The shared HTTP client shared_http.client already retries idempotent GET requests on transient failures. Do not recommend a second retry loop around its get calls.",
            context="Only shared_http.client calls in this project. Direct requests.get calls bypass that client and are not covered by its retry policy.")
        retained = await ConventionService(store, memory).teach(convention)
        assert retained["status"] == "retained"

        # Recreate application-facing objects: the lesson must be in Hindsight, not Python state.
        fresh_settings = settings.model_copy()
        fresh_memory = HindsightMemory(fresh_settings)
        recalled = []
        for _ in range(12):
            recalled = await fresh_memory.recall("shared_http client retry policy for inventory GET requests")
            if recalled:
                break
            await asyncio.sleep(2)
        assert recalled, "Real Hindsight recall did not retrieve the retained lesson."
        fresh_service = ReviewService(fresh_settings, LLMProvider(fresh_settings), fresh_memory, Store(settings.database_path))
        learned = await fresh_service.review(shared.model_copy(update={"code": SHARED_CODE.replace("fetch_inventory", "fetch_inventory_snapshot"), "use_memory": True}))
        assert learned.memories
        assert learned.applied_memory_ids and learned.memory_explanation, "UI must receive an explanation of the applied lesson."
        assert not recommends_retry(learned), "The model still recommended redundant retries for the shared client."
        direct = await fresh_service.review(ReviewInput(code=DIRECT_CODE, filename="direct_inventory.py", use_memory=True))
        assert recommends_retry(direct), "The scoped exception must not suppress justified retries for an unrelated direct call."

        unrelated = fresh_settings.model_copy(update={"project_id": "unrelated-project"})
        assert await HindsightMemory(unrelated).recall("shared_http retry policy") == [], "Project scope leaked memory."
        assert Store(settings.database_path).get_review(learned.id) is not None
    finally:
        if created:
            await client.adelete_bank(bank_id=settings.hindsight_bank_id)
        await client.aclose()
