"""HMB Scramble API — the clubhouse back office.

Handles the bits that need a trusted server: event creation (share codes +
admin pins), admin verification, "Clone for Next Weekend", and calendar export.
Everything else (scores, teams, highlights) goes straight from the app to
Supabase with row-level security.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import courses, events

app = FastAPI(title="HMB Scramble API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)
app.include_router(courses.router)


@app.get("/")
def health() -> dict:
    return {"status": "ok", "vibe": "🍺⛳ hold my beer"}
