from pathlib import Path
from typing import Literal
import re
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Audio Toolkit"
    app_host: str = "127.0.0.1"
    app_port: int = 8012
    app_debug: bool = False
    data_dir: Path = Path("./data")
    public_site_url: str = ""
    security_headers_enabled: bool = True
    csp_mode: Literal["off", "report-only", "enforce"] = "report-only"
    csp_report_uri: str = ""
    max_upload_mb: int = 200
    max_pending_jobs: int = 8
    job_timeout_seconds: int = 300
    probe_timeout_seconds: int = 30
    file_retention_hours: int = 24
    stt_base_url: str = ""
    stt_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("csp_report_uri")
    @classmethod
    def validate_csp_report_uri(cls, value):
        if value and (value.startswith("//") or not re.fullmatch(r"/[A-Za-z0-9/_.-]+", value)):
            raise ValueError("CSP_REPORT_URI must be a same-origin absolute path")
        return value


settings = Settings()
