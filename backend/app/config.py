from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env", extra="ignore")
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: SecretStr = SecretStr("")
    llm_model: str = ""
    llm_response_format: Literal["json_object", "json_schema"] = "json_object"
    request_timeout_seconds: float = Field(default=60, ge=1, le=180)
    database_path: Path = Path("data/reviewmind.db")
    allowed_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    api_token: SecretStr = SecretStr("")
    hindsight_base_url: str = ""
    hindsight_api_key: SecretStr = SecretStr("")
    hindsight_bank_id: str = "reviewmind-local"
    project_id: str = Field(default="demo-repository", pattern=r"^[a-zA-Z0-9_-]{1,80}$")

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_model and self.llm_api_key.get_secret_value())

    @property
    def memory_configured(self) -> bool:
        return bool(self.hindsight_base_url and self.hindsight_bank_id)
