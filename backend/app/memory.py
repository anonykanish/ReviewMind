import asyncio

from hindsight_client import Hindsight

from .config import Settings
from .errors import AppError
from .schemas import ConventionInput, MemoryEvidence


class HindsightMemory:
    """Real SDK boundary. An unavailable service raises; no fake success fallback."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def _client(self):
        if not self.settings.memory_configured:
            raise AppError("memory_not_configured", "Set HINDSIGHT_BASE_URL and provision HINDSIGHT_BANK_ID before using memory.", 503)
        return Hindsight(base_url=self.settings.hindsight_base_url,
            api_key=self.settings.hindsight_api_key.get_secret_value() or None,
            timeout=self.settings.request_timeout_seconds, max_attempts=1)

    async def recall(self, query: str) -> list[MemoryEvidence]:
        client = self._client()
        try:
            async with asyncio.timeout(self.settings.request_timeout_seconds):
                result = await client.arecall(bank_id=self.settings.hindsight_bank_id,
                    query=query, tags=["project:" + self.settings.project_id], tags_match="all_strict",
                    max_tokens=1800, budget="low")
            return [MemoryEvidence(id=str(item.id), text=item.text) for item in result.results[:8]]
        except Exception:
            raise AppError("memory_unavailable", "Hindsight recall failed. No memory-enabled review was generated.", 503, True) from None
        finally:
            await client.aclose()

    async def retain(self, source_id: str, convention: ConventionInput):
        client = self._client()
        try:
            async with asyncio.timeout(self.settings.request_timeout_seconds):
                result = await client.aretain(bank_id=self.settings.hindsight_bank_id,
                    content=f"Explicit developer convention for project {self.settings.project_id}: {convention.lesson}\nApplies only in this context: {convention.context}",
                    context="User-confirmed repository convention; preserve its applicability and exceptions.",
                    document_id=source_id, tags=["project:" + self.settings.project_id],
                    metadata={"source": "explicit_convention", "project": self.settings.project_id}, retain_async=False)
                if not result.success:
                    raise ValueError("Hindsight did not confirm retention")
        except Exception:
            raise AppError("memory_retention_failed", "Hindsight did not confirm retention. The lesson is marked failed and must not be treated as learned.", 503, True) from None
        finally:
            await client.aclose()
