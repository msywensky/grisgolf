"""Environment config. Loads backend/.env in local dev."""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class Settings:
    def __init__(self) -> None:
        self.supabase_url = os.environ.get("SUPABASE_URL", "")
        self.supabase_service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.cors_origins = [
            origin.strip()
            for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
            if origin.strip()
        ]
        # Optional — course search degrades to cached-only without it.
        self.golf_api_key = os.environ.get("GOLF_COURSE_API_KEY", "")
        if not self.supabase_url or not self.supabase_service_key:
            raise RuntimeError(
                "Missing Supabase config. Copy backend/.env.example to backend/.env "
                "and fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. 🍺"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
